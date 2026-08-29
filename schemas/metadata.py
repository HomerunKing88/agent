#!/usr/bin/env python3
"""schemas/metadata.py — run_metadata.json 형식 판정 (계획서 6.4).

manifest.json은 결정적이라 타임스탬프를 담지 않는다. 실행 정보는 이 파일이 담는다.
6.4가 이 파일을 둔 이유는 **재현성**이다 — 어떤 규칙·생성기·검사기·프롬프트로 만든
결과인지 남아야 나중에 "왜 그때는 통과했나"를 답할 수 있다.

그래서 판정을 둘로 나눈다.

  validate()      형식 오류. stage가 없다거나 source_hashes가 dict가 아니라거나
  missing_for_reproducibility()  6.4가 요구하는 버전 필드 중 빠진 것

버전 필드는 필수로 걸지 않는다. 지금 orchestrator가 채우지 않기 때문에
전부 FAIL이 되어 판정이 무의미해진다. 대신 무엇이 빠졌는지 이름으로 돌려준다.

`stage` 값의 어휘는 정하지 않는다. 계획서에 목록이 없고 orchestrator가 정하는 값이다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

# 계획서 6.4가 적어 둔 재현성 필드
REPRODUCIBILITY_FIELDS = (
    "job_id",
    "audit_version",
    "audit_git_commit",
    "house_rule_version",
    "template_version",
    "editor_prompt_version",
    "source_hashes",
)


class Metadata(BaseModel):
    model_config = ConfigDict(extra="allow")
    stage: str = Field(min_length=1)
    job_id: str | None = None
    audit_version: str | None = None
    audit_git_commit: str | None = None
    house_rule_version: str | None = None
    template_version: str | None = None
    editor_prompt_version: str | None = None
    source_hashes: dict[str, str] | None = None


def validate(payload: dict, rules: dict) -> list[str]:
    try:
        meta = Metadata.model_validate(payload)
    except ValidationError as error:
        return [f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in error.errors()]

    errors: list[str] = []
    # 규칙 버전이 적혀 있다면 현재 house-rules와 같아야 한다.
    # 다르면 이 잡은 지금 규칙으로 판정된 게 아니다
    if meta.house_rule_version and meta.house_rule_version != rules["version"]:
        errors.append(
            f"house_rule_version {meta.house_rule_version!r} != house-rules {rules['version']!r}")
    for name, digest in (meta.source_hashes or {}).items():
        if not str(digest).startswith("sha256:"):
            errors.append(f"source_hashes[{name}]가 sha256: 로 시작하지 않는다")
    return errors


def missing_for_reproducibility(payload: dict) -> list[str]:
    """6.4가 요구하는 필드 중 빠진 것. 오류가 아니라 재현성 격차다."""
    return [field for field in REPRODUCIBILITY_FIELDS if not payload.get(field)]


def main() -> int:
    parser = argparse.ArgumentParser(description="run_metadata.json 형식 판정")
    parser.add_argument("metadata", type=Path)
    parser.add_argument("--rules", type=Path,
                        default=Path(__file__).resolve().parent.parent / "house-rules.yaml")
    args = parser.parse_args()
    rules = yaml.safe_load(args.rules.read_text(encoding="utf-8"))
    payload = json.loads(args.metadata.read_text(encoding="utf-8"))

    errors = validate(payload, rules)
    print(("PASS " if not errors else "FAIL ") + args.metadata.name)
    for error in errors:
        print(f"  {error}")
    missing = missing_for_reproducibility(payload)
    if missing:
        print(f"  재현성 격차 (6.4): {', '.join(missing)} 없음")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
