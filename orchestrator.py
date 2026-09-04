#!/usr/bin/env python3
"""orchestrator.py — 잡 진행·라우팅·게이트 판정 (AI 아님). 계획서 7절.

잡 폴더 자체가 체크포인트다 (계획서 2.13). 상태는 디스크(파일 존재 +
run_metadata.json)로만 판단한다. 이 프로세스는 상태를 들고 있지 않는다.

  python orchestrator.py <잡_폴더>            # 현재 상태와 다음 행동을 보여준다
  python orchestrator.py <잡_폴더> build      # builder/deck_v1.js → pptx + manifest
  python orchestrator.py <잡_폴더> review     # audit.py + EDITOR 결과 → issue_register.json
  python orchestrator.py <잡_폴더> render     # render_check.py (GATE 2, 집 Windows에서 유효)
  python orchestrator.py <잡_폴더> preflight  # 스킬 preflight.py → review/preflight_rN.json (STRUCT, 1차)
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
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import preview

# ── 계획서 5절 잡 폴더 구조 ─────────────────────────────────────────
DIRS = ("source", "builder", "review", "revision", "final")

# 스타일별 생성기 (2.17). deck_v1.js가 require하는 생성기로 스타일을 판정한다.
# 추측하지 않는다 — 정확히 하나여야 하며, 모르면 멈춘다 (audit.py bfd482b와 같은 이유).
GENERATOR_STYLE = {
    "template.js": "corporate-strategy-ppt",
    "template_shin.js": "shin-ppt1",
}
DECKKIT_NAME = "deckkit.js"


def deck_hash(path: Path) -> str | None:
    """검사한 덱을 특정하는 해시. 게이트가 '지금 그 파일'을 봤는지 대조하는 데 쓴다."""
    if not path.is_file():
        return None
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


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
        "preflight": root / "review" / f"preflight_r{version}.json",
        "lint": root / "review" / f"lint_r{version}.json",
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
def repo_versions() -> dict:
    """리포의 결정값을 읽는다: template.js TEMPLATE_VERSION, house-rules version.

    JSON 6.4 스키마의 house_rule_version/template_version/audit_version을
    채운다. YAML 파서 없이 정규식 한 줄로 읽는다 (의존성 추가 회피).
    """
    repo = Path(__file__).resolve().parent
    versions = {}
    tpl = repo / "template.js"
    if tpl.exists():
        m = re.search(r'TEMPLATE_VERSION\s*=\s*"([^"]+)"', tpl.read_text(encoding="utf-8"))
        versions["template_version"] = m.group(1) if m else "unknown"
    rules = repo / "house-rules.yaml"
    if rules.exists():
        m = re.search(r'^version:\s*"([^"]+)"', rules.read_text(encoding="utf-8"), re.M)
        versions["house_rule_version"] = m.group(1) if m else "unknown"
    return versions


def source_hashes(root: Path) -> dict:
    """잡 폴더의 입력 파일 해시 (6.4): source/*, builder/deck_v1.js."""
    p = job_paths(root)
    hashes = {}
    targets = list(p["source"].glob("*.xlsx")) if p["source"].exists() else []
    targets.append(p["deck_js"])
    for f in targets:
        if f.exists():
            hashes[str(f.relative_to(root))] = "sha256:" + hashlib.sha256(
                f.read_bytes()).hexdigest()
    return hashes


def meta_update(root: Path, **fields) -> None:
    path = root / "run_metadata.json"
    payload = read_json(path)
    payload.update(fields)
    write_json(path, payload)
    print(f"meta  : {' '.join(f'{k}={v}' for k, v in fields.items())}")


def judgment_reminder() -> None:
    """장표를 만들기 전에 판단 가드를 화면에 낸다.

    Atlas의 session handoff에서 빌렸다 — 새 세션 첫 메시지에 사실 묶음을 자동으로 싣는다.
    ask.sh는 다른 에이전트에게 그걸 붙여 주는데, **정작 만드는 쪽(BUILDER)은 아무도 안 붙여 준다.**
    2026-08-30에 잡 004를 고쳐 놓고 같은 데이터로 차트 판(005)을 만들며 004에 붙인
    경고 각주를 통째로 빠뜨렸다. 이미 고친 결함 셋이 되살아났다 (LESSONS L18).
    사람의 기억에 맡기지 않는다.
    """
    path = Path(__file__).resolve().parent / "LESSONS.md"
    if not path.exists():
        return
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        cols = [c.strip() for c in line.strip("|").split("|")]
        if len(cols) >= 8 and re.fullmatch(r"L\d+", cols[0]) and cols[7] == "판단":
            rows.append(f"  {cols[0]} {cols[1]}")
    if rows:
        print("── 만들기 전에 (스크립트가 못 잡는 것들) ──")
        for r in rows:
            print(r)
        print(f"  ({len(rows)}건. 전체는 LESSONS.md)")


def cmd_build(root: Path, version: int = 1) -> None:
    judgment_reminder()
    p = job_paths(root, version)
    repo = Path(__file__).resolve().parent
    # deck_v1.js는 잡 폴더에 복사해 채운다. 리포의 데크.js는 템플릿이다 (계획서 5절)
    if not p["deck_js"].exists():
        print(f"누락  : {p['deck_js']}  (잡 폴더로 deck.js를 복사해 수치를 채운다)", file=sys.stderr)
        sys.exit(1)
    # 어느 스타일 생성기인지 deck_v1.js의 require로 판정하고, 그 생성기와 계약
    # deckkit.js를 잡으로 복사한다 (2.17). 잡이 리포 밖이므로 복사해 운용하되,
    # 복제된 헬퍼가 리포 node_modules(pptxgenjs, js-yaml)를 보게 한다.
    deck_src = p["deck_js"].read_text(encoding="utf-8")
    required = set(re.findall(r'require\(["\']\./([\w./-]+\.js)["\']\)', deck_src))
    generators = sorted(set(GENERATOR_STYLE) & required)
    if len(generators) != 1:
        print(f"누락  : {p['deck_js']}가 스타일 생성기를 정확히 하나 require하지 않는다 "
              f"({sorted(required)}). 스타일을 추측하지 않는다.", file=sys.stderr)
        sys.exit(1)
    style = GENERATOR_STYLE[generators[0]]
    for name in (*generators, DECKKIT_NAME):
        src = repo / name
        if not src.exists():
            print(f"누락  : {src}  (생성기 파일)", file=sys.stderr)
            sys.exit(1)
        shutil.copy2(src, p["builder"] / name)
    env = dict(os.environ)
    env["NODE_PATH"] = str(repo / "node_modules")
    # 규칙 단일 원천 (2.16-6). 잡 폴더에 규칙 사본을 만들지 않고 리포의 YAML을 가리킨다
    env["HOUSE_RULES"] = str(repo / "house-rules.yaml")
    p["builder"].mkdir(parents=True, exist_ok=True)
    subprocess.run(["node", str(p["deck_js"]), str(p["pptx"])],
                   cwd=p["builder"], env=env, check=True)
    # 6.4 실행 정보. 소스 해시는 이 잡의 입력이므로 매 build에 다시 계산한다.
    # style은 6.4 재현성과 같은 성격이다 — '무엇을 기준으로 만든 잡인가' (2.17).
    meta = dict(repo_versions())
    meta["style"] = style
    meta["source_hashes"] = source_hashes(root)
    meta["stage"] = "BUILT"
    meta["deck_version"] = version
    meta["built_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    meta_update(root, **meta)
    meta_problems = schema_check("metadata", read_json(root / "run_metadata.json"))
    if meta_problems:
        print("schema: run_metadata.json 스키마 위반:")
        for problem in meta_problems:
            print("        " + problem)

    # 미리보기 부산물 (계획서 5절 builder/out/p*.png). 실패해도 build는 성공이다.
    # 로직은 preview.py에 있다 (PIPE 담당). 렌더 판정은 render_check.py가 정본이다.
    meta_update(root, **{k: v for k, v in preview.render_preview(p, version).items() if v})


def run_lint(p: dict[str, Path]) -> tuple[list[dict], str]:
    """lint_deck.js를 돌리고 결과를 파일로 남긴 뒤 이슈를 돌려준다.

    못 돌린 경우(node 없음·스크립트 없음·JSON 아님)를 조용히 넘기지 않는다.
    `lint.error`로 만들어 LINT 게이트를 막는다 — 모르는 상태는 PASS가 아니다 (2.16-7).
    """
    script = Path(__file__).with_name("lint_deck.js")
    target = p["deck_js"]
    payload = {"file": target.name, "status": "ERROR", "error": None, "issues": []}
    if not target.is_file():
        payload["error"] = f"덱 스크립트가 없다: {target}"
    elif not script.is_file():
        payload["error"] = f"lint_deck.js가 없다: {script}"
    else:
        try:
            done = subprocess.run(["node", str(script), str(target), "--json"],
                                  capture_output=True, text=True, check=False)
            payload = json.loads(done.stdout)
        except FileNotFoundError:
            payload["error"] = "node를 찾을 수 없다 (lint_deck.js를 못 돌렸다)"
        except json.JSONDecodeError:
            payload["error"] = f"lint_deck.js가 JSON을 내지 않았다: {done.stdout[:200]}"
    write_json(p["lint"], payload)

    if payload.get("status") == "ERROR":
        return ([{"rule": "lint.error", "slide": 0, "shape": "-",
                  "evidence": payload.get("error") or "lint 수행 불가 (2.16-7)"}], "ERROR")
    out = []
    for it in payload.get("issues", []):
        out.append({"rule": it.get("rule", "lint.raw_call"), "slide": 0,
                    "shape": f"{target.name}:{it.get('line')}",
                    "evidence": f"{it.get('text','')}  → {it.get('message','')}"})
    return out, str(payload.get("status", "ERROR"))


def cmd_review(root: Path, version: int = 1) -> None:
    p = job_paths(root, version)
    if not p["pptx"].exists():
        print(f"누락  : {p['pptx']}", file=sys.stderr)
        sys.exit(1)

    # audit.py는 결정적 정적 검사. exit code가 아니라 결과 파일로 판정한다 (2.16.5).
    # 단일 대상의 --json 출력은 {"status", "results":[{file, status, issues, error}],
    #                          "expected_mismatches"} 꼴이다. 이슈는 results 안에 있다.
    with p["audit"].open("w", encoding="utf-8") as out:
        audit_cmd = [sys.executable, str(Path(__file__).with_name("audit.py")), "--json",
                     "--source-root", str(p["source"])]
        # manifest는 builder/·revision/의 manifest.json을 명시적으로 넘긴다.
        # audit.py 기본값은 pptx와 같은 폴더만 보지만(2.16.5) 잡의 claim 대조는
        # deck.js가 내보낸 manifest를 읽어야 하므로 경로를 확정한다.
        if p["manifest"].exists():
            audit_cmd += ["--manifest", str(p["manifest"])]
        audit_cmd.append(str(p["pptx"]))
        subprocess.run(audit_cmd, stdout=out, check=False)

    # LINT — 잡 스크립트가 헬퍼를 우회했나 (계획서 8절). 검사 대상이 pptx가 아니라
    # deck_v{n}.js라서 audit과 따로 돈다. 2026-09-04에 보류를 풀었다: 게이트 아홉 중
    # 하나가 "미구현"으로 영구 SKIP이면 게이트 표가 실제보다 넓어 보인다 (2.16-7).
    lint_issues, lint_status = run_lint(p)

    # EDITOR 결과(editor_r1.json)가 있으면 검증해 통과분만 합친다.
    # 계획서 6.3: pydantic 검증, 실패/어휘위반은 원문을 로그에 남기고 그 이슈만
    # 버린다. 재시도 트리거는 편집기 응답을 받는 쪽이므로 여기선 검증·로그만 한다.
    editor_issues, editor_log = validate_editor(p, version)

    audit = read_json(p["audit"])
    probe = next(iter(audit.get("results") or []), None)
    if not isinstance(probe, dict):
        # audit.py가 JSON을 만들지 못했다(스택 트레이스 등). 조용한 PASS는 오류다 (2.16.7)
        audit_status, audit_error, audit_issues = "ERROR", "audit.py 결과 JSON이 없다", []
        audit_warnings = []
    else:
        audit_status, audit_error = probe.get("status", "ERROR"), probe.get("error")
        audit_issues = list(probe.get("issues", []))
        # 경고도 받는다. audit이 낸 것을 배관이 안 읽으면 화면에만 남고 사라진다.
        # 2026-09-03 실측: unverified claim 경고가 audit --json에는 있는데
        # issue_register에 없어 게이트도 보고서도 그것을 몰랐다.
        audit_warnings = list(probe.get("warnings", []))

    if audit_status == "ERROR":
        # 이슈가 없는 ERROR는 게이트에서 ALL PASS처럼 보이므로 블로킹용으로 만든다
        audit_issues.append({"rule": "audit.error", "slide": 0, "shape": "-",
                             "evidence": audit_error or "검사 수행 불가 (2.16.7)"})

    issues = audit_issues + lint_issues + editor_issues
    register = {
        "job": root.name,
        "round": version,
        # 무엇을 검사했는지 남긴다. 이게 없으면 게이트가 낡은 판정으로 열린다.
        # 2026-08-30 VERIFY가 찾았다 — 덱을 빈 파일로 바꿔도 gates가 ALL PASS였다.
        "deck": p["pptx"].name,
        "deck_hash": deck_hash(p["pptx"]),
        "audit_status": audit_status,
        # LINT를 돌린 적이 있나. 없으면 게이트는 PASS가 아니라 SKIP이다 (2.16-7).
        # 이 키가 생기기 전에 만들어진 잡은 린트를 받은 적이 없다.
        "lint_status": lint_status,
        # 막지는 않지만 사용자가 알아야 하는 것. 검증을 끈 claim이 여기 남는다
        "warnings": audit_warnings,
        "audit_error": audit_error,
        "editor_kept": len(editor_issues),
        "editor_dropped": len(editor_log),
        "issues": issues,
        "merged_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    write_json(p["register"], register)
    meta_update(root, stage="REVIEWED", audit_round=version)
    print(f"issue : 총 {len(issues)}건 → {p['register'].name}")
    if audit_warnings:
        print(f"경고  : {len(audit_warnings)}건 — 막지는 않지만 사람이 봐야 한다")
        for w in audit_warnings[:3]:
            print(f"        {w.get('rule')}: {str(w.get('evidence'))[:70]}")
    schema_problems = schema_check("issue", register)
    if schema_problems:
        # issue_register가 계약을 어겼다. 게이트가 신뢰할 수 없으니 스키마 위반
        # 이슈를 하나 넣고 게이트가 이 경로를 막게 한다 (pipeline.SCHEMA_VIOLATION)
        register["issues"] = issues + [{
            "rule": "pipeline.schema_violation", "slide": 0, "shape": "-",
            "evidence": "issue_register 스키마 위반: " + "; ".join(schema_problems),
        }]
        write_json(p["register"], register)
        print("schema: issue_register 스키마 위반이 있어 게이트를 막는다:")
        for problem in schema_problems:
            print("        " + problem)
    if editor_log:
        print(f"editor: 통과 {len(editor_issues)}건, 버림 {len(editor_log)}건 → {p['editor'].with_name('editor_log' + str(version) + '.json')}")


# 검토자가 낸 파일. 이름이 셋인 것은 역사적 이유다 — 2026-08-30에 EDITOR와
# CRITIC을 REVIEW 하나로 합쳤는데(prompts/REVIEW.md) 배관은 옛 이름만 봤다.
# 그래서 2026-09-04 잡 007에서 REVIEW가 CRITICAL 3건을 냈는데 게이트는
# "차단 없음 (전부 검사함)"을 냈다. review_lens_cover는 세 이름을 다 보고
# 게이트를 열어 줬는데 정작 지적을 읽는 쪽은 editor_r{N}.json만 봤다 — 최악의 짝이다.
# **두 곳이 같은 목록을 보게 한다.** 목록은 여기 한 군데만 둔다 (2.14).
REVIEWER_FILES = ("review", "editor", "critic")


def reviewer_file(root: Path, version: int) -> Path | None:
    """검토 결과 파일. 없으면 None."""
    for name in REVIEWER_FILES:
        path = root / "review" / f"{name}_r{version}.json"
        if path.exists():
            return path
    return None


def validate_editor(p: dict, version: int) -> tuple[list[dict], list[dict]]:
    """EDITOR 응답을 house-rules 어휘로 검증한다. (통과, 버림)을 반환.

    버림 원문은 review/editor_log{n}.json에 기록한다 (6.3: "원문을 로그에
    남기고 그 이슈만 버린다"). 이슈가 아예 없으면 빈 결과를 돌려준다.
    """
    source = reviewer_file(p["root"], version)
    if source is None:
        return [], []
    try:
        from schemas.editor import validate
        import yaml as _yaml
    except ImportError:
        # 검증기 의존성(pydantic/yaml)이 없으면 그 이슈를 감사 이슈로 만들어 막는다
        log = [{ "raw": {}, "errors": ["schemas/editor.py 검증기 로드 불가 (pydantic/yaml 필요)"] }]
        write_json(p["editor"].with_name(f"editor_log{version}.json"),
                   {"job": p["root"].name, "dropped": log})
        return [], log

    rules = _yaml.safe_load(Path(__file__).resolve().parent.joinpath("house-rules.yaml")
                            .read_text(encoding="utf-8"))
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        log = [{ "raw": {}, "errors": [f"{source.name} JSON 파싱 실패: {error}"] }]
        write_json(p["editor"].with_name(f"editor_log{version}.json"),
                   {"job": p["root"].name, "dropped": log})
        return [], log

    kept, dropped = validate(payload, rules)
    if dropped:
        write_json(p["editor"].with_name(f"editor_log{version}.json"),
                   {"job": p["root"].name, "dropped": dropped})
    # 게이트·라우터 호환: type → rule (gate_of의 ISSUE 분류용)로 승격한다.
    # 가공하지 않고 "editor." 프리픽스로 단일 게이트(ISSUE)에 모인다.
    editor_issues = [{**issue, "rule": f"editor.{issue['type']}"} for issue in kept]
    return list(editor_issues), list(dropped)


def schema_check(kind: str, payload: dict) -> list[str]:
    """BUILDER 소유 schemas/{kind}.py로 파이프라인 산출물을 검증한다.

    리포의 나머지 스키마(issue·decision·metadata)는 dbc 해석기와 같은 계약으로
    만들어진 것이라, orchestrator가 만든 파일을 이 모듈로 통과시키면 형식이
    떨어졌을 때 즉시 드러난다. 검증 실패는 pipeline.SCHEMA_VIOLATION으로
    게이트에 막히게 한다 (아래 cmd_gates/cmd_report).
    """
    try:
        import importlib
        import yaml as _yaml
        module = importlib.import_module(f"schemas.{kind}")
        rules = _yaml.safe_load(Path(__file__).resolve().parent.joinpath("house-rules.yaml")
                                .read_text(encoding="utf-8"))
    except ImportError as error:
        return [f"schemas/{kind} 검증기 로드 불가: {error}"]
    try:
        return module.validate(payload, rules)
    except Exception as error:  # pydantic이 낸 형식 검증 오류가 아니라 예외
        return [f"schemas/{kind} 판정 예외: {type(error).__name__}: {error}"]


# ── 라우터 (계획서 2.7) ─────────────────────────────────────────────
def issue_action(issue: dict) -> str:
    """ACTION이 없는 검사기 이슈의 안전 기본값은 REVIEW_ONLY다.
    사용자를 뜻밖에 세우지 않는 기본값이다. 확정 ACTION은 검사기가 판다."""
    return issue.get("action", "REVIEW_ONLY")


def cmd_render(root: Path, version: int = 1) -> None:
    """GATE 2: 실측 렌더 검사 (render_check.py).

    Windows는 PowerPoint COM, 그 밖은 LibreOffice headless SVG로 잰다
    (CODEX, 2026-09-04). 폰트가 없거나 대체가 감지된 도형은 PASS가 아니라
    SKIP으로 빠진다 — 잰 도형이 하나도 없으면 결과 자체가 SKIP이다 (2.16-7).
    결과.issues는 register의 render_issues로 따로 기록해 게이트가 audit 이슈와
    합쳐 판정한다. render_check.py 실행 파일은 리포 루트에 있다 (담당: Codex).
    """
    p = job_paths(root, version)
    if not p["pptx"].exists():
        print(f"누락  : {p['pptx']}", file=sys.stderr)
        sys.exit(1)

    render_exe = Path(__file__).with_name("render_check.py")
    render_file = root / "review" / f"render_r{version}.json"
    # 스타일을 안 넘기면 render_check가 "style is unknown"으로 ERROR를 낸다.
    # audit과 같이 manifest 경로를 명시한다 — 잡의 스타일은 거기 적혀 있다.
    render_cmd = [sys.executable, str(render_exe), str(p["pptx"]), "--json"]
    if p["manifest"].exists():
        render_cmd += ["--manifest", str(p["manifest"])]
    with render_file.open("w", encoding="utf-8") as out:
        subprocess.run(render_cmd, stdout=out, check=False)

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
    # 무엇을 못 쟀는지 남긴다. 사유가 없으면 게이트가 "환경 탓"으로 뭉뚱그린다.
    render_skips = probe.get("skips", []) if isinstance(probe, dict) else []
    register["render_skips"] = [str(item.get("reason", "")) for item in render_skips][:20]
    register["render_error"] = render_error
    if render_status == "ERROR" and not render_issues:
        # 이슈가 없는 ERROR는 게이트에서 ALL PASS처럼 보이므로 블로킹용 이슈를 만든다.
        # render_check.py는 ERROR일 때 error만 남기고 issues를 비운다 (2.16.7).
        render_issues = [{"rule": "render.error", "slide": 0, "shape": "-",
                          "evidence": render_error or "렌더 검사 수행 불가 (2.16.7)"}]
    register["render_issues"] = render_issues
    stale = [i for i in register.get("issues", []) if not str(i.get("rule", "")).startswith("render.")]
    register["issues"] = stale + list(render_issues)
    write_json(p["register"], register)
    meta_update(root, stage="REVIEWED", render_round=version, render_status=render_status)
    print(f"render: {render_status}  렌더 이슈 {len(render_issues)}건 → {render_file.name}")


def cmd_preflight(root: Path, version: int = 1) -> None:
    """STRUCT 게이트 1단계: 스킬 preflight.py의 [오류]/[경고]를 파일로 남긴다.

    preflight 경로는 house-rules.yaml의 preflight.source에서 읽는다 (규칙 단일
    원천, 2.14). 리포로 복사하지 않는다 — 복사해서 고치면 스킬 원본과 갈라진다
    (2.15). [오류]는 preflight.style_owned의 문구를 담으면 owner=style(스타일
    판정. audit.py가 정본), 아니면 owner=struct다. 게이트 합류는 2단계다.
    못 돌린 경우(pptx 없음·잘못된 경로·파이썬 오류)도 항상 유효한 JSON을 쓴다
    — status=ERROR로 하고 사유를 error에 담는다 (audit.py와 같은 방식).
    """
    p = job_paths(root, version)
    target = p["pptx"]
    payload = {
        "job": root.name,
        "round": version,
        "file": target.name,
        "status": "ERROR",
        "error": None,
        "issues": [],
        "counts": {"errors": 0, "warnings": 0, "ownership": {"style": 0, "struct": 0}},
        "output": "",
    }

    if not target.is_file():
        payload["error"] = f"FileNotFoundError: {target}  (먼저 build)"
        write_json(p["preflight"], payload)
        print(f"preflight: ERROR  {payload['error']}")
        return
    try:
        import yaml as _yaml
        rules = _yaml.safe_load(Path(__file__).resolve().parent.joinpath("house-rules.yaml")
                                .read_text(encoding="utf-8"))
        cfg = rules["preflight"]
        exe = Path(__file__).resolve().parent / cfg["source"]
        style_owned = list(cfg["style_owned"])
    except (ImportError, KeyError, OSError) as error:
        payload["error"] = f"{type(error).__name__}: {error}  (house-rules preflight 절 읽기 실패)"
        write_json(p["preflight"], payload)
        print(f"preflight: ERROR  {payload['error']}")
        return

    if not exe.is_file():
        payload["error"] = f"FileNotFoundError: {exe}  (스킬 preflight 원본)"
        write_json(p["preflight"], payload)
        print(f"preflight: ERROR  {payload['error']}")
        return

    try:
        proc = subprocess.run([sys.executable, str(exe), str(target)],
                              capture_output=True, text=True, check=False)
    except OSError as error:
        payload["error"] = f"{type(error).__name__}: {error}"
        write_json(p["preflight"], payload)
        print(f"preflight: ERROR  {payload['error']}")
        return

    payload["output"] = (proc.stdout or "") + (proc.stderr or "")
    for line in payload["output"].splitlines():
        if line.startswith("[오류]"):
            owner = "style" if any(ph in line for ph in style_owned) else "struct"
            payload["issues"].append({"kind": "오류", "owner": owner, "line": line})
            payload["counts"]["errors"] += 1
            payload["counts"]["ownership"][owner] += 1
        elif line.startswith("[경고]"):
            payload["issues"].append({"kind": "경고", "line": line})
            payload["counts"]["warnings"] += 1

    if proc.returncode == 0:
        payload["status"] = "PASS"
    elif "Traceback" in (proc.stderr or ""):
        # preflight 자체의 파이썬 오류다. 덱 판정이 아니라 도구 실패 (2.16.7).
        payload["status"] = "ERROR"
        payload["error"] = (proc.stderr or "").strip()
    elif proc.returncode == 1:
        payload["status"] = "FAIL"
    else:
        payload["status"] = "ERROR"
        payload["error"] = f"preflight가 종료 코드 {proc.returncode}로 나가 원인을 못 밝혔다"
    write_json(p["preflight"], payload)
    c = payload["counts"]
    print(f"preflight: {payload['status']}  [오류 {c['errors']} / 경고 {c['warnings']} / "
          f"struct {c['ownership']['struct']}]  → {p['preflight'].relative_to(root)}")


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
# 규칙 문자열 → 게이트 맵. 감사기가 이미 FAIL 처리한 항목이면 해당 게이트를 막는다.
# 정확 규칙 이름부터 검사하고, 남는 것은 접두사로 분류한다. 접두사로 잡지 못하면
# HOUSE로 센다기보다 로그로 남겨 새 규칙 누락을 겉으로 드러낸다 (고정값 샐 때).
EXACT_GATE = {
    "claim.source_manifest_pptx": "SOURCE",   # 원천 대조
    "claim.cross_page_consistency": "XREF",   # 페이지 간 지표 일치
    "claim.unregistered_numeric_token": "TOKEN",  # 미등록 숫자 토큰
    # 2026-09-03 신설. 등재를 잊어 UNMAPPED으로 떨어져 있었다 —
    # 막기는 했지만 게이트 표에 엉뚱한 이름이 찍혔다. L12가 게이트 맵에서 난 것이다.
    "claim.source_label_mismatch": "SOURCE",      # 표 라벨이 원천 라벨과 다르다
    "claim.unregistered_chart_series_value": "SOURCE",  # 차트 계열 값이 원천에 없다
    "qa.text_max_ymax_pt": "LAYOUT",          # 각주 y 좌표 (정적 근사)
    # 검사 자체의 실패(2.16.7: 조용한 PASS 금지)는 게이트를 막는 이슈로 승격한다.
    # 사용자 기각(REJ)로 우회될 수 없어야 하므로 ISSUE 게이트에 매핑하되,
    # route/decision 경로를 타지 않는다(아래 cmd_gates에서 id 기준 REJ를 읽는다).
    "audit.error": "ISSUE",    # audit.py 수행 불가
    "render.error": "ISSUE",   # render_check.py 수행 불가
}
PREFIX_GATE = {
    "calc.": "CALC", "token.": "TOKEN",
    "layout.": "LAYOUT", "render.": "LAYOUT",
    "forbidden.": "HOUSE", "fonts.": "HOUSE", "sizes.": "HOUSE",
    "table.": "HOUSE", "zones.": "HOUSE", "notation.": "HOUSE",
    "lint.": "LINT", "editor.": "ISSUE",
    "pipeline.": "ISSUE",  # 파이프라인 산출물의 스키마 위반(생성기·검사기 버그)
    "contract.": "STRUCT",  # preflight.py와 house-rules의 드리프트 감지 (2.18)
}
GATES = ("SOURCE", "CALC", "XREF", "TOKEN", "LAYOUT", "HOUSE", "LINT", "ISSUE", "STRUCT")

# 어떤 검사 규칙도 도달하지 못하는 게이트는 PASS가 아니라 SKIP으로 적는다 (2.16-7,
# BUILDER_TO_PIPE.md 8절). "검사했고 통과"와 "검사한 적 없음"이 구분되지 않으면
# QA_REPORT가 하지도 않은 검사를 통과했다고 말하게 된다. 사유는 여기만 둔다.
# CALC는 CODEX e5eb0c9(`calc.source_manifest`)가 실제 배선해서 정적 SKIP이 아니다.
SKIP_REASONS = {
    # STRUCT: 파일이 없으면(아직 안 돌면) SKIP. 돌았으면 cmd_gates가 struct 건수로 결정한다.
    "STRUCT": "preflight가 아직 안 돌았다 (orchestrator.py <잡> preflight)",
}


def skip_reason(gate: str) -> str:
    """게이트가 SKIP일 이유. SKIP_REASONS에 없으면 환경(render SKIP) 쪽이다."""
    return SKIP_REASONS.get(gate, "render_check가 SKIP을 냈다 (orchestrator.py <잡> render 로 사유를 본다)")


def gate_headline(gates: dict) -> str:
    """게이트 한 줄 요약.

    "ALL PASS"라고만 적으면 건너뛴 게이트가 있어도 전부 검사하고 통과한 것처럼
    읽힌다. 실전 잡 003에서 셋(LAYOUT·LINT·ISSUE)이 SKIP인데 화면에는
    ALL PASS만 떴다. 검사한 것과 안 한 것이 한 단어에 섞이면 안 된다 (2.16-7).
    """
    if gates["blocked"]:
        return "  ".join(gates["blocked"])
    n = len(gates.get("skipped") or [])
    return "차단 없음" + (f" — 다만 {n}개 미검사(SKIP)" if n else " (전부 검사함)")


def gate_of(rule: str) -> str:
    if rule in EXACT_GATE:
        return EXACT_GATE[rule]
    for prefix, gate in PREFIX_GATE.items():
        if rule.startswith(prefix):
            return gate
    # 매핑에 없는 새 검사 규칙은 조용히 HOUSE로 새지 않게 표시한다.
    return "UNMAPPED"


def review_lens_cover(root: Path, version: int) -> tuple[bool, str]:
    """검토가 렌즈 두 개(CONTENT·DESIGN)를 다 보고했나. (통과, 사유)를 돌려준다.

    검토자는 한 명이다. 사람을 늘리는 대신 **출력 형식으로 사각을 막는다.**
    2026-08-30 실전 잡 003에서 규칙 검사는 전부 통과했는데 사용자가 그림을 보고
    결함 넷을 짚었다. 내용 렌즈만 있었고 디자인은 "스크립트가 판정한다"는
    틀린 전제로 아무도 안 봤기 때문이다.

    파일이 없으면 물론이고, **한 렌즈만 적혀 있어도 열어 주지 않는다.**
    지적이 0건인 것과 그 렌즈로 안 본 것은 다르다. 전자는 lenses_covered에
    이름을 적어 "봤고 없다"를 밝히면 된다 (2.16-7).
    """
    for name in REVIEWER_FILES:
        path = root / "review" / f"{name}_r{version}.json"
        if path.exists():
            break
    else:
        return False, "검토가 안 돌았다 — REVIEWER에게 장표 그림을 보여야 한다"
    try:
        payload = read_json(path)
    except (json.JSONDecodeError, OSError) as error:
        return False, f"{path.name}을 읽지 못했다: {error}"

    import yaml as _yaml
    rules = _yaml.safe_load(Path(__file__).resolve().parent
                            .joinpath("house-rules.yaml").read_text(encoding="utf-8"))
    want = set(rules["issues"]["review_lenses"])
    seen = set(payload.get("lenses_covered") or [])
    missing = sorted(want - seen)
    if missing:
        return False, (f"{'·'.join(missing)} 렌즈를 안 봤다 "
                       f"(본 렌즈: {'·'.join(sorted(seen)) or '없음'}) — "
                       "지적 0건이면 lenses_covered에 이름을 적어 밝힌다")
    return True, ""


def cmd_gates(root: Path) -> None:
    register = read_json(root / "review" / "issue_register.json")
    violations = {**{gate: [] for gate in GATES}, "UNMAPPED": []}
    # 사용자가 기각(REJ) 처리한 항목은 ISSUE 게이트를 통과시킨다 (8절:
    # "CRITICAL 0, MAJOR 0 또는 사용자 기각 처리 완료").
    decision = read_json(root / "review" / "user_decision.json")
    decision_schema = schema_check("decision", decision) if decision else []
    if decision_schema:
        # 결정 형식이 어긋나면 게이트가 잘못 열린다. user_decision.json을 무시하고
        # 스키마 위반 이슈로 막는다. 기각이 안 잡히니 차단된 채로 남는다.
        violations["ISSUE"].append("pipeline.schema_violation")
        print("schema: user_decision.json 스키마 위반이 있어 기각을 무시하고 막는다:")
        for problem in decision_schema:
            print("        " + problem)
    rejected = {i.get("id") for i in decision.get("items", []) if i.get("action") == "REJ"} if not decision_schema else set()
    for issue in register.get("issues", []):
        if issue.get("severity") == "MINOR":
            continue  # 8절: MINOR는 비차단, 잔여 건수만 기록
        issue_id = issue.get("id") or issue.get("rule")
        if issue_id in rejected:
            continue
        violations.setdefault(gate_of(issue.get("rule", "")), []).append(issue_id)

    blocked = [g for g in GATES if violations[g]]
    if violations["UNMAPPED"]:
        # gate_of에 없는 새 검사 규칙은 앞으로 판정이 막힌다. 조용히 HOUSE로
        # 빠지거나(HOUSE 차단 표시) 모두 통과로 새치기 못 한다 (2.16.7).
        blocked.append("UNMAPPED")

    # STRUCT: preflight 결과로 판정한다. status(종료 코드)가 아니라 counts.ownership.struct 건수로 본다 (2.18).
    try:
        preflight = read_json(root / "review" / f"preflight_r{register.get('round', 1)}.json")
        pf_status = preflight.get("status")
        ownership = preflight.get("counts")
        struct_owner = (ownership or {}).get("ownership", {}).get("struct") if isinstance(ownership, dict) else None
    except (json.JSONDecodeError, OSError):
        preflight, pf_status, struct_owner = {}, "ERROR", None
    if pf_status is None:
        pass  # 파일이 없다 → 상태 루프가 SKIP을 정한다
    elif pf_status == "ERROR":
        blocked.append("STRUCT")
        violations["STRUCT"].append("preflight 실행 불가: " + str(preflight.get("error", "?")))
    elif not isinstance(struct_owner, int):
        blocked.append("STRUCT")
        violations["STRUCT"].append("preflight 결과 형식 이상")
    elif struct_owner > 0:
        blocked.append("STRUCT")
        violations["STRUCT"].append(f"구조 오류 {struct_owner}건")

    # 세 상태: BLOCKED(위반 있음) / PASS(검사했고 위반 0) / SKIP(검사기가 없거나
    # 이 환경에서 안 돎). 정적 미도달(CALC·LINT)과 맥의 render SKIP(LAYOUT의 진짜
    # 넘침 검사가 안 돎)이 PASS로 오인되어서는 안 된다 (계약 7, BUILDER_TO_PIPE.md 8절).
    # 이 판정이 **지금 이 덱**을 본 것인가.
    #
    # 2026-08-30 VERIFY가 찾은 것 중 제일 무거웠다. cmd_gates는 issue_register만
    # 읽고 그게 어느 파일에서 나왔는지 대조하지 않았다. 표를 6pt로 부숴도,
    # 다른 덱으로 바꿔치기해도, **빈 파일로 만들어도** ALL PASS가 나왔다.
    # 다른 게이트가 아무리 촘촘해도 이 구멍 하나면 전부 무의미해진다.
    now_hash = deck_hash(job_paths(root, register.get("round", 1))["pptx"])
    seen_hash = register.get("deck_hash")
    stale = None
    if now_hash is None:
        stale = "덱 파일이 없다"
    elif not seen_hash:
        stale = "검사 기록에 덱 해시가 없다 (review를 다시 돌려라)"
    elif seen_hash != now_hash:
        stale = "검사한 뒤 덱이 바뀌었다 (review를 다시 돌려라)"

    render_status = (register.get("render_status") or "").upper()
    # 판단(EDITOR·CRITIC)이 돌았나. 안 돌았으면 ISSUE는 PASS가 아니다.
    #
    # 2026-08-30, 실전 잡 003에서 드러났다. editor_r*.json이 없으면
    # validate_editor가 조용히 빈 결과를 돌려주고 ISSUE가 PASS로 찍혔다.
    # 그 PASS는 "봤더니 좋다"가 아니라 "아무도 안 봤다"였다.
    # 사용자가 눈으로 보고 결함 넷을 바로 짚었는데 게이트는 전부 열려 있었다.
    # LAYOUT에서 고친 것과 같은 버그가 제일 중요한 게이트에 있었다 (2.16-7).
    judged, judge_gap = review_lens_cover(root, register.get("round", 1))
    if stale:
        # 낡은 판정으로는 어느 게이트도 열지 않는다. 하나만 막으면 나머지가
        # "검사했고 통과"로 남아 사용자를 오도한다 (2.16-7).
        for gate in GATES:
            if gate not in blocked:
                blocked.append(gate)
            violations[gate].append(f"판정이 지금 덱을 본 것이 아니다: {stale}")

    status = {}
    for gate in GATES:
        if gate in blocked:
            status[gate] = "BLOCKED"
        elif gate == "STRUCT":
            status[gate] = "PASS" if pf_status in ("PASS", "FAIL") else "SKIP"
        elif gate == "ISSUE" and not judged:
            # 검토가 안 돌았거나 렌즈 하나를 안 봤다. 규칙 검사만으로 통과라고
            # 적을 수 없다. house-rules는 바닥이지 기준이 아니다 —
            # 팔레트 안의 색인지는 보지만 두 선이 구분되는지는 못 본다.
            # 사유는 어느 렌즈가 빠졌는지까지 적는다 (review_lens_cover).
            SKIP_REASONS["ISSUE"] = judge_gap
            status[gate] = "SKIP"
        elif gate in SKIP_REASONS:
            status[gate] = "SKIP"
        elif gate == "LINT" and not register.get("lint_status"):
            # 이 잡은 린트를 받은 적이 없다 (lint 배선 2026-09-04 이전에 만들어진
            # register다). 돌린 적 없는 것을 통과로 적지 않는다 — LAYOUT에서
            # 고친 것과 같은 자리다 (2.16-7).
            SKIP_REASONS["LINT"] = "린트를 안 돌렸다 (orchestrator.py <잡> review 를 다시 돌린다)"
            status[gate] = "SKIP"
        elif gate == "LAYOUT" and render_status in ("", "SKIP"):
            skips = register.get("render_skips") or []
            SKIP_REASONS["LAYOUT"] = (
                "render를 아직 안 돌렸다 (orchestrator.py <잡> render)" if not render_status
                else "render가 SKIP — " + (skips[0] if skips else "잰 도형이 없다"))
            # 빈 값 = render를 아예 안 돌렸다. 돌려서 SKIP이 나오면 SKIP인데
            # 안 돌리면 PASS가 되던 구멍이 있었다 — 거꾸로다 (2026-08-30, 실전 잡 003).
            # 넘침 판정의 정본은 render_check.py다. 그것을 안 돌린 채로 LAYOUT을
            # 통과라고 적으면 "검사했고 통과"와 "검사한 적 없음"이 섞인다 (2.16-7).
            status[gate] = "SKIP"
        else:
            status[gate] = "PASS"
    skipped = [g for g in GATES if status[g] == "SKIP"]
    gates = {
        "job": root.name,
        "blocked": blocked,
        "pass": [g for g in GATES if status[g] == "PASS"],
        "skipped": skipped,
        "status": status,
        "violations": violations,
    }
    write_json(root / "review" / "gates.json", gates)
    print("GATE      " + gate_headline(gates))
    warn = register.get("warnings") or []
    if warn:
        print(f"경고      : {len(warn)}건 — " + "; ".join(
            f"{w.get('rule')}" for w in warn[:3]))
    if blocked:
        print("차단      : " + ", ".join(blocked))
    if skipped:
        print("건너뜀    : " + ", ".join(f"{g} ({skip_reason(g)})" for g in skipped))
    if violations["UNMAPPED"]:
        print("미매핑    : " + ", ".join(violations["UNMAPPED"]) +
              "  ← gate_of에 정확히 매핑할 새 검사 규칙")


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
        passed = gates.get("pass") or []
        skipped = gates.get("skipped") or []
        lines.append("PASS    : " + (", ".join(passed) if passed else "없음"))
        lines.append("SKIP    : " + (", ".join(f"{g} ({skip_reason(g)})" for g in skipped) if skipped else "없음"))
        # 막지는 않지만 사용자가 알아야 하는 것. 게이트 화면에는 나오는데
        # 정작 사용자가 받는 문서에 없었다 (2026-09-03). 검사기가 낸 것을
        # 배관이 끝까지 안 나른 것이라 L27과 같은 부류다.
        warn = register.get("warnings") or []
        if warn:
            lines.append("")
            lines.append(f"## 경고 ({len(warn)}건) — 막지 않지만 확인이 필요하다")
            for w in warn:
                lines.append(f"- `{w.get('rule')}` p{w.get('slide', '?')} "
                             f"{str(w.get('evidence', ''))[:120]}")
        if register.get("render_status"):
            lines.append("Render  : " + str(register["render_status"])
                         + (f" — {register.get('render_error')}" if register.get("render_error") else ""))
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
                        choices=("status", "build", "review", "render", "preflight", "route", "gates", "report"))
    parser.add_argument("--version", type=int, default=1,
                        help="검사할 deck 버전 (1=builder, 2=revision)")
    args = parser.parse_args(argv)

    for name in DIRS:
        (args.job_root / name).mkdir(parents=True, exist_ok=True)

    if args.command == "status":
        banner(args.job_root)
    elif args.command == "build":
        cmd_build(args.job_root, args.version)
    elif args.command == "review":
        cmd_review(args.job_root, args.version)
    elif args.command == "render":
        cmd_render(args.job_root, args.version)
    elif args.command == "preflight":
        cmd_preflight(args.job_root, args.version)
    elif args.command == "route":
        cmd_route(args.job_root)
    elif args.command == "gates":
        cmd_gates(args.job_root)
    elif args.command == "report":
        cmd_report(args.job_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())