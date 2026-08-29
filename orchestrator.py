#!/usr/bin/env python3
"""orchestrator.py — 잡 진행·라우팅·게이트 판정 (AI 아님). 계획서 7절.

잡 폴더 자체가 체크포인트다 (계획서 2.13). 상태는 디스크(파일 존재 +
run_metadata.json)로만 판단한다. 이 프로세스는 상태를 들고 있지 않는다.

  python orchestrator.py <잡_폴더>            # 현재 상태와 다음 행동을 보여준다
  python orchestrator.py <잡_폴더> build      # builder/deck_v1.js → pptx + manifest
  python orchestrator.py <잡_폴더> review     # audit.py + EDITOR 결과 → issue_register.json
  python orchestrator.py <잡_폴더> render     # render_check.py (GATE 2, 집 Windows에서 유효)
  python orchestrator.py <잡_폴더> route      # issue_register.json → 라우터 분류
  python orchestrator.py <잡_폴더> gates      # 검사 결과 → 게이트 표 (계획서 8절)
  python orchestrator.py <잡_폴더> report     # final/QA_REPORT.md + CHANGELOG.md

라우터와 게이트는 계획서 2.7·8절의 결정을 코드로 옮긴 것이다.
SEVERITY와 ACTION은 별개 차원이다. 사용자에게 넘기는 것은 ACTION이
USER_DECISION인 항목만이다 (2.7). 게이트 판정은 exit code가 아니라
결과 파일로 한다 (2.16.5).

외부 호출은 전부 서브프로세스 한 번이고, 실패하면 이 프로세스가 멈춘다.
'검사 불가'는 조용한 PASS가 아니라 ERROR/SKIP으로 남긴다 (2.16.7).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ── 계획서 5절 잡 폴더 구조 ─────────────────────────────────────────
DIRS = ("source", "builder", "review", "revision", "final")


def job_paths(root: Path, version: int = 1) -> dict[str, Path]:
    """잡 폴더의 확정 경로. 계획서 5절의 구조 그대로다."""
    build_dir = root / "builder" if version == 1 else root / "revision"
    return {
        "root": root,
        "source": root / "source",
        "builder": build_dir,
        "deck_js": build_dir / f"deck_v{version}.js",
        "pptx": build_dir / f"deck_v{version}.pptx",
        "manifest": build_dir / "manifest.json",
        "review": root / "review",
        "audit": root / "review" / f"audit_r{version}.json",
        "editor": root / "review" / f"editor_r{version}.json",
        "register": root / "review" / "issue_register.json",
        "decision": root / "review" / "user_decision.json",
        "final": root / "final",
        "qa": root / "final" / "QA_REPORT.md",
        "changelog": root / "final" / "CHANGELOG.md",
        "metadata": root / "run_metadata.json",
    }


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(cmd: list[str], cwd: Path) -> None:
    """외부 도구 호출은 전부 결정적인 서브프로세스 한 번이다."""
    cwd.mkdir(parents=True, exist_ok=True)
    subprocess.run(cmd, cwd=cwd, check=True)


# ── 상태 판단 (파일 존재 → 현재 단계) ───────────────────────────────
def state(root: Path) -> dict:
    p = job_paths(root)
    built = p["pptx"].exists()
    registered = p["register"].exists()
    decided = p["decision"].exists()
    qa = p["qa"].exists()
    return {
        "job": root.name,
        "built": built,
        "registered": registered,
        "decided": decided,
        "qa": qa,
        "stage": ("FINAL" if qa else
                  "AWAIT_DECISION" if registered and not decided else
                  "REVIEWED" if registered else
                  "BUILT" if built else
                  "COLLECTING"),
    }


def banner(root: Path) -> None:
    st = state(root)
    print(f"잡    : {st['job']}   stage={st['stage']}")
    if st["stage"] == "COLLECTING":
        print("다음  : source.xlsx/brief.md 수집 후  build")
    elif st["stage"] == "BUILT":
        print("다음  : review  (audit.py + EDITOR)")
    elif st["stage"] == "REVIEWED":
        print("다음  : route   (분류) → gates")
    elif st["stage"] == "AWAIT_DECISION":
        print("다음  : 사용자 버튼 → decide 하여 gates")
    elif st["stage"] == "FINAL":
        print("종료  : FINAL + QA_REPORT.md")

    meta = read_json(root / "run_metadata.json")
    if meta:
        print("meta  :", " ".join(f"{k}={v}" for k, v in sorted(meta.items())))


# ── 단계 ────────────────────────────────────────────────────────────
def meta_update(root: Path, **fields) -> None:
    path = root / "run_metadata.json"
    payload = read_json(path)
    payload.update(fields)
    write_json(path, payload)
    print(f"meta  : {' '.join(f'{k}={v}' for k, v in fields.items())}")


def cmd_build(root: Path, version: int = 1) -> None:
    p = job_paths(root, version)
    repo = Path(__file__).resolve().parent
    # deck_v1.js는 잡 폴더에 복사해 채운다. 리포의 데크.js는 템플릿이다 (계획서 5절)
    if not p["deck_js"].exists():
        print(f"누락  : {p['deck_js']}  (잡 폴더로 deck.js를 복사해 수치를 채운다)", file=sys.stderr)
        sys.exit(1)
    # deck.js는 생성 헬퍼를 ./template.js로 참조한다. 잡 폴더가 리포 밖이므로 잡상에 복사해
    # 루트에서 운용하되, 복제된 헬퍼가 리포 node_modules(pptxgenjs, js-yaml)를 보게 한다 (계획서 5절).
    tpl_src = repo / "template.js"
    if not tpl_src.exists():
        print(f"누락  : {tpl_src}  (생성 헬퍼 템플릿)", file=sys.stderr)
        sys.exit(1)
    shutil.copy2(tpl_src, p["builder"] / "template.js")
    env = dict(os.environ)
    env["NODE_PATH"] = str(repo / "node_modules")
    # 규칙 단일 원천 (2.16-6). 잡 폴더에 규칙 사본을 만들지 않고 리포의 YAML을 가리킨다
    env["HOUSE_RULES"] = str(repo / "house-rules.yaml")
    p["builder"].mkdir(parents=True, exist_ok=True)
    subprocess.run(["node", str(p["deck_js"]), str(p["pptx"])],
                   cwd=p["builder"], env=env, check=True)
    meta_update(root, stage="BUILT", deck_version=version,
                built_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


def cmd_review(root: Path, version: int = 1) -> None:
    p = job_paths(root, version)
    if not p["pptx"].exists():
        print(f"누락  : {p['pptx']}", file=sys.stderr)
        sys.exit(1)

    # audit.py는 결정적 정적 검사. exit code가 아니라 결과 파일로 판정한다 (2.16.5).
    # 단일 대상의 --json 출력은 {"status", "results":[{file, status, issues, error}],
    #                          "expected_mismatches"} 꼴이다. 이슈는 results 안에 있다.
    with p["audit"].open("w", encoding="utf-8") as out:
        subprocess.run(
            [sys.executable, str(Path(__file__).with_name("audit.py")), "--json",
             "--source-root", str(p["source"]), str(p["pptx"])],
            stdout=out, check=False,
        )

    # EDITOR 결과(editor_r1.json)가 있으면 그대로 두고, 없으면 빈 슬롯으로 표시한다
    editor = read_json(p["editor"]) if p["editor"].exists() else {}

    audit = read_json(p["audit"])
    probe = next(iter(audit.get("results") or []), None)
    if not isinstance(probe, dict):
        # audit.py가 JSON을 만들지 못했다(스택 트레이스 등). 조용한 PASS는 오류다 (2.16.7)
        audit_status, audit_error, audit_issues = "ERROR", "audit.py 결과 JSON이 없다", []
    else:
        audit_status, audit_error = probe.get("status", "ERROR"), probe.get("error")
        audit_issues = list(probe.get("issues", []))

    if audit_status == "ERROR":
        # 이슈가 없는 ERROR는 게이트에서 ALL PASS처럼 보이므로 블로킹용으로 만든다
        audit_issues.append({"rule": "audit.error", "slide": 0, "shape": "-",
                             "evidence": audit_error or "검사 수행 불가 (2.16.7)"})

    issues = audit_issues + editor.get("issues", [])
    register = {
        "job": root.name,
        "round": version,
        "audit_status": audit_status,
        "audit_error": audit_error,
        "issues": issues,
        "merged_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    write_json(p["register"], register)
    meta_update(root, stage="REVIEWED", audit_round=version)
    print(f"issue : 총 {len(issues)}건 → {p['register'].name}")


# ── 라우터 (계획서 2.7) ─────────────────────────────────────────────
def issue_action(issue: dict) -> str:
    """ACTION이 없는 검사기 이슈의 안전 기본값은 REVIEW_ONLY다.
    사용자를 뜻밖에 세우지 않는 기본값이다. 확정 ACTION은 검사기가 판다."""
    return issue.get("action", "REVIEW_ONLY")


def cmd_render(root: Path, version: int = 1) -> None:
    """GATE 2: PowerPoint COM 실측 렌더 검사 (render_check.py).

    집 Windows PC에서만 실행한다. macOS에서는 SKIP이므로 게이트를 막지 않는다.
    결과.issues는 register의 render_issues로 따로 기록해 게이트가 audit 이슈와
    합쳐 판정한다. render_check.py 실행 파일은 리포 루트에 있다 (담당: Codex).
    """
    p = job_paths(root, version)
    if not p["pptx"].exists():
        print(f"누락  : {p['pptx']}", file=sys.stderr)
        sys.exit(1)

    render_exe = Path(__file__).with_name("render_check.py")
    render_file = root / "review" / f"render_r{version}.json"
    with render_file.open("w", encoding="utf-8") as out:
        subprocess.run(
            [sys.executable, str(render_exe), str(p["pptx"]), "--json"],
            stdout=out, check=False,
        )

    payload = read_json(render_file)
    probe = payload if isinstance(payload, dict) and "status" in payload else None
    if probe is None:
        render_status, render_issues, render_error = "ERROR", [], "render 결과 JSON이 없다"
    else:
        render_status = probe.get("status", "ERROR")
        render_issues = list(probe.get("issues", []))
        render_error = probe.get("error")

    register = read_json(p["register"])
    register["render_status"] = render_status
    register["render_error"] = render_error
    register["render_issues"] = render_issues
    stale = [i for i in register.get("issues", []) if not str(i.get("rule", "")).startswith("render.")]
    register["issues"] = stale + list(render_issues)
    write_json(p["register"], register)
    meta_update(root, stage="REVIEWED", render_round=version, render_status=render_status)
    print(f"render: {render_status}  렌더 이슈 {len(render_issues)}건 → {render_file.name}")


def cmd_route(root: Path) -> None:
    register = read_json(root / "review" / "issue_register.json")
    if not register:
        print(f"누락  : issue_register.json  (먼저 review)", file=sys.stderr)
        sys.exit(1)

    buckets = {"AUTO_FIX": [], "USER_DECISION": [], "REVIEW_ONLY": []}
    for issue in register.get("issues", []):
        buckets[issue_action(issue)].append(issue)

    route = {
        "job": root.name,
        "severity": register.get("audit_status"),
        "buckets": {name: [i.get("id") or i.get("rule") for i in items]
                    for name, items in buckets.items()},
        "counts": {name: len(items) for name, items in buckets.items()},
    }
    write_json(root / "review" / "route_result.json", route)
    meta_update(root, stage="AWAIT_DECISION" if buckets["USER_DECISION"] else "ROUTED")
    for name in ("AUTO_FIX", "USER_DECISION", "REVIEW_ONLY"):
        print(f"  {name:14} {len(buckets[name])}건")


# ── 게이트 (계획서 8절) ─────────────────────────────────────────────
# 규칙 문자열 → 게이트 맵. 감사기가 이미 FAIL 처리한 항목이면 해당 게이트를 막는다
RULE_TO_GATE = {
    "claim.source_manifest_pptx": "SOURCE",
    "claim.cross_page_consistency": "XREF",
    "calc.": "CALC", "token.": "TOKEN",
    "qa.text_max_ymax_pt": "LAYOUT", "layout.": "LAYOUT",
    "forbidden.": "HOUSE", "fonts.": "HOUSE", "sizes.": "HOUSE",
    "table.": "HOUSE", "zones.": "HOUSE", "notation.": "HOUSE",
    "render.": "LAYOUT", "lint.": "LINT",
}
GATES = ("SOURCE", "CALC", "XREF", "TOKEN", "LAYOUT", "HOUSE", "LINT", "ISSUE")


def gate_of(rule: str) -> str:
    for prefix, gate in RULE_TO_GATE.items():
        if rule.startswith(prefix):
            return gate
    return "HOUSE"


def cmd_gates(root: Path) -> None:
    register = read_json(root / "review" / "issue_register.json")
    violations = {gate: [] for gate in GATES}
    for issue in register.get("issues", []):
        if issue.get("severity") == "MINOR":
            continue  # 8절: MINOR는 비차단, 잔여 건수만 기록
        violations[gate_of(issue.get("rule", ""))].append(issue.get("id") or issue.get("rule"))

    blocked = [g for g in GATES if violations[g]]
    gates = {
        "job": root.name,
        "blocked": blocked,
        "pass": [g for g in GATES if not violations[g]],
        "violations": violations,
    }
    write_json(root / "review" / "gates.json", gates)
    print("GATE      " + "  ".join(gates["blocked"] or ["ALL PASS"]))
    if blocked:
        print("차단      : " + ", ".join(blocked))


# ── 보고서 (계획서 8절: 사용자가 받는 것은 게이트 표 + 채택·기각 내역) ──
def cmd_report(root: Path) -> None:
    p = job_paths(root)
    register = read_json(p["register"])
    route = read_json(root / "review" / "route_result.json")
    decision = read_json(p["decision"])

    lines = [f"# QA REPORT — {root.name}", ""]
    gates = read_json(root / "review" / "gates.json")
    lines.append("## Gates")
    if gates:
        lines.append("BLOCKING: " + ("없음" if not gates["blocked"] else ", ".join(gates["blocked"])))
        lines.append("PASS    : " + (", ".join(gates["pass"]) if gates["pass"] else "없음"))
    lines.append("")

    # 채택·기각은 user_decision.json이 정본이다. CHANGELOG.md(마크다운)는
    # 잡 진행 내역을 한눈에 보이는 부산물로 만든다 (계획서 6.3·5절 구조).
    items = decision.get("items") or []
    lines.append(f"## 채택·기각 ({len(items)}건)")
    for item in items:
        lines.append(f"- {item.get('id')} [{item.get('action', '?')}] {item.get('note', '')}")
    lines.append("")
    lines.append(f"Issue total: {len(register.get('issues', []))}건")
    p["qa"].write_text("\n".join(lines) + "\n", encoding="utf-8")

    changelog_lines = [
        f"# CHANGELOG — {root.name}",
        "",
        f"round  : {register.get('round', 1)}  audit={register.get('audit_status', '?')}",
        "채택액: " + str(sum(1 for i in items if i.get("action") == "ACC")) + "건, "
        "기각액: " + str(sum(1 for i in items if i.get("action") == "REJ")) + "건",
        "",
    ]
    for item in items:
        changelog_lines.append(f"## {item.get('id')} [{item.get('action', '?')}]")
        if item.get("note"):
            changelog_lines.append(item["note"])
        changelog_lines.append("")
    p["changelog"].write_text("\n".join(changelog_lines) + "\n", encoding="utf-8")

    meta_update(root, stage="FINAL")
    print(f"보고서 : {p['qa']}")
    print(f"이력   : {p['changelog']}")


# ── CLI ─────────────────────────────────────────────────────────────
def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("job_root", type=Path)
    parser.add_argument("command", nargs="?", default="status",
                        choices=("status", "build", "review", "render", "route", "gates", "report"))
    args = parser.parse_args(argv)

    for name in DIRS:
        (args.job_root / name).mkdir(parents=True, exist_ok=True)

    if args.command == "status":
        banner(args.job_root)
    elif args.command == "build":
        cmd_build(args.job_root)
    elif args.command == "review":
        cmd_review(args.job_root)
    elif args.command == "render":
        cmd_render(args.job_root)
    elif args.command == "route":
        cmd_route(args.job_root)
    elif args.command == "gates":
        cmd_gates(args.job_root)
    elif args.command == "report":
        cmd_report(args.job_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())