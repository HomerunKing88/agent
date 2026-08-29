#!/usr/bin/env python3
"""schemas/decision.py — user_decision.json 형식 판정 (계획서 6단계 완료 조건).

사용자가 폰 슬랙 버튼으로 내린 결정이 이 파일에 적재된다.
게이트는 여기서 `REJ`인 항목을 ISSUE 게이트에서 빼 준다 — 즉 이 파일이
사용자를 대신해 게이트를 여는 유일한 경로다. 형식이 틀리면 결정이 조용히 무시된다.

어휘(`ACC`/`REJ`)는 house-rules.yaml의 `issues.decision_action`에서 읽는다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class DecisionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    action: str
    note: str = ""


class Decision(BaseModel):
    model_config = ConfigDict(extra="allow")
    job: str = Field(min_length=1)
    user: str = Field(min_length=1)
    at: str = Field(min_length=1)
    items: list[DecisionItem]


def validate(payload: dict, rules: dict) -> list[str]:
    vocab = rules["issues"]["decision_action"]
    try:
        decision = Decision.model_validate(payload)
    except ValidationError as error:
        return [f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in error.errors()]

    errors: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(decision.items):
        if item.action not in vocab:
            errors.append(f"items[{index}].action {item.action!r}는 어휘 밖이다: {vocab}")
        if item.id in seen:
            errors.append(f"items[{index}]: id {item.id!r}가 중복이다")
        seen.add(item.id)
    # 최상위 choice가 있으면 items와 어긋나면 안 된다. 어긋나면 어느 쪽이 정본인지 알 수 없다
    choice = payload.get("choice")
    if choice:
        if choice not in vocab:
            errors.append(f"choice {choice!r}는 어휘 밖이다: {vocab}")
        elif any(item.action != choice for item in decision.items):
            errors.append(f"choice {choice!r}와 items의 action이 어긋난다")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="user_decision.json 형식 판정")
    parser.add_argument("decision", type=Path)
    parser.add_argument("--rules", type=Path,
                        default=Path(__file__).resolve().parent.parent / "house-rules.yaml")
    args = parser.parse_args()
    rules = yaml.safe_load(args.rules.read_text(encoding="utf-8"))
    errors = validate(json.loads(args.decision.read_text(encoding="utf-8")), rules)
    print(("PASS " if not errors else "FAIL ") + args.decision.name)
    for error in errors:
        print(f"  {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
