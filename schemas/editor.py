#!/usr/bin/env python3
"""schemas/editor.py — EDITOR 응답 검증 (계획서 6.3, 8단계).

EDITOR는 자유 서술로 답하지 않는다. 이슈 하나가 여덟 필드를 갖춘 객체다.
계획서 6.3: 검증에 실패하면 한 번 재시도하고, 또 실패하면 원문을 로그에 남기고
**그 이슈만** 버린다. 그래서 이 모듈은 전부 아니면 전무로 판정하지 않는다.
`validate()`가 (통과한 이슈, 버려진 이슈+사유)를 나눠 돌려준다.
재시도 횟수와 로그는 orchestrator가 정한다 (담당: PIPE).

어휘는 house-rules.yaml의 `issues` 절에서 읽는다. 여기에 목록을 박지 않는다.

  from schemas.editor import validate
  kept, dropped = validate(json.loads(path.read_text()), rules)

CLI:
  python schemas/editor.py <editor_r1.json> [--rules house-rules.yaml]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

ID_PATTERN = re.compile(r"^[A-Z]-\d{3}$")


class EditorIssue(BaseModel):
    # 모르는 키를 막는다. confidence 같은 필드가 조용히 섞여 들어오면
    # 합성 점수를 쓰지 않기로 한 결정이 무력해진다 (2.9)
    model_config = ConfigDict(extra="forbid")

    id: str
    slide: int = Field(ge=1)
    type: str
    severity: str
    action: str
    finding: str = Field(min_length=1)
    evidence: str = Field(min_length=1)
    proposal: str = Field(min_length=1)


def _check(issue: EditorIssue, rules: dict) -> list[str]:
    cfg = rules["issues"]
    errors = []

    prefix = cfg["id_prefix"]["editor"]
    if not issue.id.startswith(prefix) or not ID_PATTERN.match(issue.id):
        errors.append(f"id {issue.id!r}는 {prefix}NNN 꼴이어야 한다")
    if issue.type not in cfg["editor_types"]:
        errors.append(f"type {issue.type!r}는 EDITOR 담당 밖이다: {cfg['editor_types']}")
    if issue.severity not in cfg["severity"]:
        errors.append(f"severity {issue.severity!r}는 어휘 밖이다: {cfg['severity']}")
    if issue.action not in cfg["action"]:
        errors.append(f"action {issue.action!r}는 어휘 밖이다: {cfg['action']}")
    # 숫자 없는 외부 주장은 등급을 고정한다 (2.6). EDITOR가 올려 잡는 것을 막는다
    if issue.type == "UNSOURCED" and issue.severity != cfg["unsourced_severity"]:
        errors.append(f"UNSOURCED는 severity {cfg['unsourced_severity']} 고정이다")
    return errors


def validate(payload: dict, rules: dict) -> tuple[list[dict], list[dict]]:
    """(통과한 이슈, 버려진 이슈) 를 돌려준다.

    버려진 항목은 `{"raw": 원문, "errors": [...]}` 꼴이다. 원문을 남기는 이유는
    무엇이 왜 버려졌는지 로그에서 확인할 수 있어야 하기 때문이다 (6.3).
    """
    cfg = rules["issues"]
    kept: list[dict] = []
    dropped: list[dict] = []

    raw_issues = payload.get("issues")
    if not isinstance(raw_issues, list):
        return [], [{"raw": payload, "errors": ["최상위에 issues 배열이 없다"]}]

    seen: set[str] = set()
    for raw in raw_issues:
        try:
            issue = EditorIssue.model_validate(raw)
        except ValidationError as error:
            dropped.append({"raw": raw, "errors": [
                f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in error.errors()]})
            continue
        errors = _check(issue, rules)
        if issue.id in seen:
            errors.append(f"id {issue.id!r}가 중복이다")
        if errors:
            dropped.append({"raw": raw, "errors": errors})
            continue
        seen.add(issue.id)
        kept.append(issue.model_dump())

    # 개수 상한 (9절 8단계). 초과분은 버리지 않고 넘긴다 —
    # 조용히 잘라내면 사용자가 못 본 지적이 생긴다. 넘겼다는 사실을 알린다
    for severity, cap in cfg["editor_caps"].items():
        over = [i for i in kept if i["severity"] == severity]
        if len(over) > cap:
            dropped.append({"raw": {"severity": severity, "count": len(over)},
                            "errors": [f"{severity} 지적이 상한 {cap}건을 넘었다 ({len(over)}건). "
                                       f"EDITOR에게 상한 안으로 다시 받는다"]})
    return kept, dropped


def main() -> int:
    parser = argparse.ArgumentParser(description="EDITOR 응답 검증")
    parser.add_argument("editor", type=Path)
    parser.add_argument("--rules", type=Path,
                        default=Path(__file__).resolve().parent.parent / "house-rules.yaml")
    args = parser.parse_args()

    rules = yaml.safe_load(args.rules.read_text(encoding="utf-8"))
    kept, dropped = validate(json.loads(args.editor.read_text(encoding="utf-8")), rules)
    print(f"통과 {len(kept)}건 / 버림 {len(dropped)}건  {args.editor.name}")
    for item in dropped:
        print(f"  버림: {json.dumps(item['raw'], ensure_ascii=False)[:70]}")
        for error in item["errors"]:
            print(f"    {error}")
    return 0 if not dropped else 1


if __name__ == "__main__":
    sys.exit(main())
