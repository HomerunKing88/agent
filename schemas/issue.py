#!/usr/bin/env python3
"""schemas/issue.py — issue_register.json 형식 판정 (계획서 6.3).

검사기 셋(audit.py, render_check.py, EDITOR)의 결과를 orchestrator가 하나로 합친 파일이다.
합쳐진 이슈는 **모양이 두 갈래**다. 이게 이 모듈이 있는 이유다.

  audit  {rule, slide, shape, evidence}
  editor {id, slide, type, severity, action, finding, evidence, proposal}

둘 중 어느 쪽도 아닌 이슈가 섞이면 라우터와 게이트가 그걸 기본값으로 처리한다.
기본값으로 처리된 이슈는 사용자에게 엉뚱한 게이트 이름으로 보고된다 (2.16-7).
그래서 여기서는 "분류 불가"를 오류로 본다.

어휘는 house-rules.yaml의 `issues` 절에서 읽는다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

AUDIT_KEYS = {"rule", "slide", "shape", "evidence"}


class AuditIssue(BaseModel):
    """audit.py / render_check.py가 내는 결정적 판정. severity·action이 없다."""
    model_config = ConfigDict(extra="forbid")
    rule: str = Field(min_length=1)
    slide: int = Field(ge=0)
    shape: str
    evidence: str


class Register(BaseModel):
    model_config = ConfigDict(extra="allow")   # PIPE가 필드를 늘릴 수 있게 열어 둔다
    job: str
    round: int = Field(ge=1)
    audit_status: str
    issues: list[dict]


def classify(issue: dict) -> str | None:
    """이슈 하나가 어느 검사기에서 왔는지. 모르면 None."""
    if AUDIT_KEYS <= set(issue) and set(issue) <= AUDIT_KEYS:
        return "audit"
    if "type" in issue and "severity" in issue:
        return "editor"
    return None


def validate(payload: dict, rules: dict) -> list[str]:
    cfg = rules["issues"]
    try:
        register = Register.model_validate(payload)
    except ValidationError as error:
        return [f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in error.errors()]

    errors: list[str] = []
    status_vocab = {"PASS", "FAIL", "ERROR", "SKIP"}
    if register.audit_status not in status_vocab:
        errors.append(f"audit_status {register.audit_status!r}는 어휘 밖이다: {sorted(status_vocab)}")
    if payload.get("render_status") and payload["render_status"] not in status_vocab:
        errors.append(f"render_status {payload['render_status']!r}는 어휘 밖이다")

    seen: set[str] = set()
    for index, issue in enumerate(register.issues):
        kind = classify(issue)
        if kind is None:
            errors.append(f"issues[{index}]: audit도 editor도 아닌 모양이다. 키={sorted(issue)}")
            continue
        if kind == "audit":
            try:
                AuditIssue.model_validate(issue)
            except ValidationError as error:
                errors += [f"issues[{index}].{'.'.join(str(x) for x in e['loc'])}: {e['msg']}"
                           for e in error.errors()]
            continue
        # editor 이슈는 schemas/editor.py가 이미 본 형식이다. 여기서는 어휘와 중복만 본다
        for field, vocab in (("type", cfg["type"]), ("severity", cfg["severity"]),
                             ("action", cfg["action"])):
            value = issue.get(field)
            if value is not None and value not in vocab:
                errors.append(f"issues[{index}].{field} {value!r}는 어휘 밖이다: {vocab}")
        issue_id = issue.get("id")
        if issue_id:
            if issue_id in seen:
                errors.append(f"issues[{index}]: id {issue_id!r}가 중복이다")
            seen.add(issue_id)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="issue_register.json 형식 판정")
    parser.add_argument("register", type=Path)
    parser.add_argument("--rules", type=Path,
                        default=Path(__file__).resolve().parent.parent / "house-rules.yaml")
    args = parser.parse_args()
    rules = yaml.safe_load(args.rules.read_text(encoding="utf-8"))
    errors = validate(json.loads(args.register.read_text(encoding="utf-8")), rules)
    print(("PASS " if not errors else "FAIL ") + args.register.name)
    for error in errors:
        print(f"  {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
