#!/usr/bin/env python3
"""e2e_check.py — 잡 한 바퀴 회귀 검사 (생성기 ↔ 검사기 ↔ 오케스트레이터).

`fixtures/`는 pptx 한 장을 audit.py에 물리는 검사다. 이 파일은 그 위의 이음매를 본다.
잡 폴더를 만들고 `orchestrator.py build → review → route → gates → report`를 돌린 뒤
결과 파일을 확인한다. 오늘까지 나온 통합 버그는 전부 이 경로에서만 보였다.

  manifest valign 기본값        생성기가 pptxgenjs와 다른 값을 적었다
  칩 보조설명 캔버스 이탈         고정 폭이 우측 칼럼에서 판형을 넘었다
  게이트 오배선                  EDITOR 지적이 HOUSE로 떨어졌다
  미등록 숫자 토큰 오탐           더미 문구의 맨숫자가 잡혔다

실적 수치를 쓰지 않는다. 원천은 더미(0과 10)로 만들고 임시 폴더에서만 돈다.

  python e2e_check.py            # 통과하면 exit 0
  python e2e_check.py --keep     # 잡 폴더를 지우지 않는다 (실패 조사용)
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml
from openpyxl import Workbook

REPO = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO))
from schemas.decision import validate as validate_decision      # noqa: E402
from schemas.issue import validate as validate_issue            # noqa: E402
from schemas.manifest import validate as validate_manifest      # noqa: E402
from schemas.metadata import validate as validate_metadata      # noqa: E402


class Failed(Exception):
    pass


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f"  — {detail}" if detail and not ok else ""))
    if not ok:
        raise Failed(label)


def orch(job: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(REPO / "orchestrator.py"), str(job), *args],
                          capture_output=True, text=True)


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def make_job(root: Path) -> Path:
    """deck.js가 참조하는 시트·셀을 갖춘 더미 잡 폴더."""
    job = root / "job_e2e_000"
    (job / "source").mkdir(parents=True)
    (job / "builder").mkdir()
    shutil.copy2(REPO / "deck.js", job / "builder" / "deck_v1.js")

    book = Workbook()
    perf = book.active
    perf.title = "실적"
    for row in range(5, 10):
        for col in "CDE":
            perf[f"{col}{row}"] = 0
    peer = book.create_sheet("동종")
    for col in "CDEFG":
        peer[f"{col}12"] = 10
    book.save(job / "source" / "source.xlsx")
    return job


EDITOR_MAJOR = {"issues": [{
    "id": "E-001", "slide": 1, "type": "STRUCTURE", "severity": "MAJOR", "action": "USER_DECISION",
    "finding": "e2e 회귀용 지적", "evidence": "p1", "proposal": "사용자가 정한다"}]}


def run(job: Path, rules: dict) -> None:
    print("\n[1] 정상 잡 — 전 구간이 돌고 게이트가 열린다")
    result = orch(job, "build")
    check("build", result.returncode == 0, result.stderr.strip()[-200:])

    manifest = read(job / "builder" / "manifest.json")
    check("manifest 형식", not validate_manifest(manifest, rules),
          "; ".join(validate_manifest(manifest, rules)[:2]))
    check("claim에 좌표가 있다", all(c["placements"] for c in manifest["claims"]))
    check("버전 세 개가 박혔다",
          all(manifest.get(k) for k in ("schema_version", "house_rule_version", "template_version")))

    metadata = read(job / "run_metadata.json")
    check("run_metadata 형식", not validate_metadata(metadata, rules))

    check("review", orch(job, "review").returncode == 0)
    register = read(job / "review" / "issue_register.json")
    check("issue_register 형식", not validate_issue(register, rules),
          "; ".join(validate_issue(register, rules)[:2]))
    check("audit PASS", register.get("audit_status") == "PASS", str(register.get("audit_error")))
    check("이슈 0건", not register.get("issues"),
          json.dumps(register.get("issues", [])[:2], ensure_ascii=False))

    check("route", orch(job, "route").returncode == 0)
    orch(job, "gates")
    gates = read(job / "review" / "gates.json")
    check("게이트 전부 통과", not gates.get("blocked"), str(gates.get("violations")))

    print("\n[2] EDITOR MAJOR 지적 — ISSUE 게이트가 막는다 (HOUSE가 아니라)")
    (job / "review" / "editor_r1.json").write_text(
        json.dumps(EDITOR_MAJOR, ensure_ascii=False), encoding="utf-8")
    orch(job, "review")
    orch(job, "gates")
    gates = read(job / "review" / "gates.json")
    check("ISSUE가 막힌다", gates.get("blocked") == ["ISSUE"], str(gates.get("blocked")))

    print("\n[3] 사용자 기각 — 게이트가 열린다")
    decision = {"job": job.name, "user": "e2e", "at": "2026-08-29 00:00:00",
                "choice": "REJ", "items": [{"id": "E-001", "action": "REJ", "note": ""}]}
    (job / "review" / "user_decision.json").write_text(
        json.dumps(decision, ensure_ascii=False), encoding="utf-8")
    check("user_decision 형식", not validate_decision(decision, rules))
    orch(job, "gates")
    gates = read(job / "review" / "gates.json")
    check("기각 후 게이트가 열린다", not gates.get("blocked"), str(gates.get("blocked")))

    print("\n[4] manifest 변조 — 감사 필드를 뭉개면 ERROR")
    path = job / "builder" / "manifest.json"
    tampered = read(path)
    claim = tampered["claims"][0]
    claim["override"] = {"value": claim["display"]["text"], "reason": "조정", "at": "어제"}
    path.write_text(json.dumps(tampered, ensure_ascii=False), encoding="utf-8")
    check("schemas가 잡는다", bool(validate_manifest(tampered, rules)))
    orch(job, "review")
    register = read(job / "review" / "issue_register.json")
    check("audit이 ERROR를 낸다", register.get("audit_status") == "ERROR",
          str(register.get("audit_status")))

    print("\n[5] 보고서가 나온다")
    orch(job, "report")
    check("QA_REPORT.md", (job / "final" / "QA_REPORT.md").exists())
    check("CHANGELOG.md", (job / "final" / "CHANGELOG.md").exists())


def main() -> int:
    parser = argparse.ArgumentParser(description="잡 한 바퀴 회귀 검사")
    parser.add_argument("--keep", action="store_true", help="잡 폴더를 지우지 않는다")
    args = parser.parse_args()

    rules = yaml.safe_load((REPO / "house-rules.yaml").read_text(encoding="utf-8"))
    root = Path(tempfile.mkdtemp(prefix="deck-e2e-"))
    try:
        run(make_job(root), rules)
    except Failed as error:
        print(f"\nE2E FAIL — {error}")
        print(f"잡 폴더: {root}")
        return 1
    finally:
        if args.keep:
            print(f"\n잡 폴더: {root}")
        else:
            shutil.rmtree(root, ignore_errors=True)
    print("\nE2E PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
