#!/usr/bin/env python3
"""schemas/manifest.py — manifest.json 형식의 단일 판정처 (계획서 4단계, 6.2).

audit.py와 orchestrator.py가 각자 손으로 형식을 검사하면 검증이 두 벌이 된다.
두 벌이 되면 한쪽만 고쳐졌을 때 조용히 갈라진다 (2.14와 같은 이유).
형식 판정은 여기서만 한다. 내용 판정(원천 재계산, 좌표 대조)은 audit.py 몫이다.

**규칙 값을 이 파일에 두지 않는다.** transform 어휘, kind 목록, override 필수 필드,
화이트리스트 필드는 전부 house-rules.yaml에서 읽는다. 그래서 구조는 pydantic 모델로,
어휘는 `check_vocabulary()`로 나뉘어 있다. 어휘가 YAML에서 오기 때문에
정적 모델만으로는 표현할 수 없다.

  from schemas.manifest import Manifest, validate
  errors = validate(json.loads(path.read_text()), rules)   # [] 이면 형식 통과

CLI:
  python schemas/manifest.py <manifest.json> [--rules house-rules.yaml]

`fixtures/07_manifest.json`은 FAIL이 정답이다. 결함 07(페이지 간 지표 불일치)은
manifest 자체가 앞뒤가 안 맞게 만들어진 것이라, 원천 파일이나 pptx 없이 여기서 걸린다.
나머지 픽스처 manifest와 잡 manifest는 PASS다.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal, Union

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Strict(BaseModel):
    # 모르는 키가 들어오면 막는다. 오타 난 필드가 조용히 무시되면
    # 검사기가 없는 값을 기본값으로 읽고 통과시킨다 (2.16-7의 조용한 PASS)
    model_config = ConfigDict(extra="forbid")


class Bounds(Strict):
    x: float
    y: float
    w: float
    h: float


class Font(Strict):
    face: str
    size: float | None = None
    bold: bool = False


class ShapePlacement(Strict):
    """값이 도형 하나에 찍힌 경우. name이 pptx XML의 도형 name과 같다."""
    type: Literal["shape"]
    slide: int = Field(ge=1)
    name: str = Field(min_length=1)
    # 그 도형에 찍힌 전체 문자열. display.text와 다를 수 있다 ("평균 10.0" vs "10.0")
    text: str
    bounds: Bounds
    font: Font
    align: str
    valign: str


class CellPlacement(Strict):
    """값이 표 셀에 찍힌 경우. 표는 도형 하나라 셀에 이름을 줄 수 없다 (2.16-1)."""
    type: Literal["cell"]
    slide: int = Field(ge=1)
    table: str = Field(min_length=1)
    row: int = Field(ge=0)
    col: int = Field(ge=0)
    text: str


Placement = Annotated[Union[ShapePlacement, CellPlacement], Field(discriminator="type")]


class Display(Strict):
    text: str
    unit: str | None = None
    rounding: int | None = None


class Source(Strict):
    file: str | None = None
    file_hash: str | None = None
    sheet: str | None = None
    ref: str | None = None
    # 이 값이 어느 항목의 것인지 가리키는 셀 (예: 제품명이 든 B18).
    # 선택이다 — 없으면 audit이 라벨 대조를 건너뛴다 (manifest.label_ref_optional)
    label_ref: str | None = None


class Claim(Strict):
    slide: int = Field(ge=1)
    shape_id: str = Field(min_length=1)
    kind: str
    # 비어 있으면 검사기가 XML에서 찾을 대상이 없다는 뜻이다 (2.16-7)
    placements: list[Placement] = Field(min_length=1)
    display: Display
    source: Source
    # transform과 override는 어휘가 YAML에 있어 여기서는 dict로 받고
    # check_vocabulary()가 판정한다
    transform: dict
    override: dict | None = None


class Manifest(Strict):
    schema_version: int
    house_rule_version: str
    # 어느 스킬로 만든 장표인가 (계획서 2.17). 검사기는 이 값으로 styles[style]을 읽는다.
    # 없거나 어휘 밖이면 틀린 기준으로 판정하게 되므로 오류다 (2.16-7).
    style: str
    template_version: str
    token_whitelist: list[dict] = []
    # 차트 계열의 원천 범위. 네이티브 차트 값은 claim에 안 걸리므로 이것이 없으면
    # audit이 "시트 어딘가에 있나"까지만 본다 (LESSONS L38).
    # 선택이다 — 없으면 audit이 시트 전체 대조로 떨어지고 경고를 남긴다
    chart_series: list[dict] = []
    claims: list[Claim]


# ── 어휘 판정 (house-rules.yaml에서 읽는다) ──────────────────────────
def check_vocabulary(manifest: Manifest, rules: dict) -> list[str]:
    mf = rules["manifest"]
    errors: list[str] = []

    if manifest.schema_version != mf["schema_version"]:
        errors.append(
            f"schema_version {manifest.schema_version} != house-rules {mf['schema_version']}")
    if manifest.style not in rules.get("styles", {}):
        errors.append(
            f"style {manifest.style!r}는 house-rules의 styles에 없다: {sorted(rules.get('styles', {}))}")
    if manifest.house_rule_version != rules["version"]:
        errors.append(
            f"house_rule_version {manifest.house_rule_version!r} != house-rules {rules['version']!r}")

    # 화이트리스트 필드는 numeric_tokens 절에 있다 (검사기가 쓰는 어휘라 그쪽에 뒀다)
    wl_fields = rules["numeric_tokens"]["job_whitelist_fields"]
    for item in manifest.token_whitelist:
        missing = [k for k in wl_fields if not item.get(k)]
        if missing:
            errors.append(f"token_whitelist{item}: {', '.join(missing)} 누락")

    seen: dict[str, str] = {}
    for claim in manifest.claims:
        cid = claim.shape_id
        if cid in seen:
            errors.append(f"claim[{cid}] shape_id가 중복이다")
        seen[cid] = claim.display.text

        if claim.kind not in mf["kinds"]:
            errors.append(f"claim[{cid}] kind {claim.kind!r}는 어휘 밖이다: {mf['kinds']}")

        errors += _check_transform(cid, claim, mf)
        errors += _check_override(cid, claim, mf)

        # 도형 이름 규약 (2.16-1). 값 도형 이름은 shape_id로 시작한다
        prefix = mf["shape_name"]["claim_prefix"] + cid
        for p in claim.placements:
            if isinstance(p, ShapePlacement) and not p.name.startswith(prefix):
                errors.append(f"claim[{cid}] 도형 이름 {p.name!r}이 규약과 다르다 (기대 접두 {prefix!r})")
            if claim.display.text not in p.text:
                errors.append(
                    f"claim[{cid}] placement.text {p.text!r}에 display.text {claim.display.text!r}가 없다")
    return errors


def _check_transform(cid: str, claim: Claim, mf: dict) -> list[str]:
    tf = claim.transform
    ttype = tf.get("type")
    spec = mf["transforms"].get(ttype)
    if spec is None:
        return [f"claim[{cid}] transform {ttype!r}은 어휘 밖이다: {sorted(mf['transforms'])}"]

    errors = []
    missing = [k for k in spec if not tf.get(k)]
    if missing:
        errors.append(f"claim[{cid}] transform {ttype!r}에 {', '.join(missing)}가 없다")
    extra = sorted(set(tf) - {"type"} - set(spec))
    if extra:
        errors.append(f"claim[{cid}] transform {ttype!r}에 어휘 밖 인자: {', '.join(extra)}")

    # 근거는 transform 종류가 정한다 (계획서 6.2)
    if mf["source_required"] and ttype != "unverified":
        if not claim.source.file or not claim.source.sheet:
            errors.append(f"claim[{cid}] src/sheet가 없다. 근거가 없으면 unverified를 쓴다")
    if ttype in mf["source_ref_required_for"] and not claim.source.ref:
        errors.append(f"claim[{cid}] transform {ttype!r}의 근거 셀 ref가 없다")
    return errors


def _check_override(cid: str, claim: Claim, mf: dict) -> list[str]:
    ov = claim.override
    if ov is None:
        return []
    errors = []
    missing = [k for k in mf["override_fields"] if not ov.get(k)]
    if missing:
        errors.append(f"claim[{cid}] override에 {', '.join(missing)}가 없다 (2.16-8)")
    if ov.get("value") is not None and str(ov["value"]) != claim.display.text:
        errors.append(f"claim[{cid}] override.value가 display.text와 다르다")
    at = ov.get("at")
    if at:
        try:
            when = datetime.fromisoformat(str(at).replace("Z", "+00:00"))
        except ValueError:
            errors.append(f"claim[{cid}] override.at이 ISO-8601이 아니다: {at!r}")
        else:
            if when.tzinfo is None:
                errors.append(f"claim[{cid}] override.at에 타임존이 없다: {at!r}")
    return errors


def validate(payload: dict, rules: dict) -> list[str]:
    """형식 오류를 문자열 목록으로 돌려준다. 빈 목록이면 통과다.

    예외를 던지지 않는다. 호출부가 ERROR로 묶어 결과 파일에 적어야 하기 때문이다 (2.16-5).
    """
    try:
        manifest = Manifest.model_validate(payload)
    except ValidationError as error:
        return [f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in error.errors()]
    return check_vocabulary(manifest, rules)


def main() -> int:
    parser = argparse.ArgumentParser(description="manifest.json 형식 판정")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--rules", type=Path,
                        default=Path(__file__).resolve().parent.parent / "house-rules.yaml")
    args = parser.parse_args()

    rules = yaml.safe_load(args.rules.read_text(encoding="utf-8"))
    errors = validate(json.loads(args.manifest.read_text(encoding="utf-8")), rules)
    if not errors:
        print(f"PASS {args.manifest.name}")
        return 0
    print(f"FAIL {args.manifest.name}")
    for error in errors:
        print(f"  {error}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
