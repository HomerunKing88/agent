"""Generate the golden deck and eight deterministic defect fixtures."""
from __future__ import annotations

import json
import hashlib
import subprocess
from pathlib import Path

from openpyxl import Workbook


HERE = Path(__file__).resolve().parent
GENERATOR = HERE / "golden_deck.js"
SHIN_GENERATOR = HERE / "shin_deck.js"
SHIN_DEFECTS = {
    "S01": {"name": "table_too_small", "rule": "sizes.body_min_pt"},
    "S02": {"name": "third_font", "rule": "forbidden.third_font"},
    "S03": {"name": "negative_triangle", "rule": "notation.negative_forbidden"},
}

EXPECTED = {
    "01": {"name": "third_font", "rule": "forbidden.third_font", "stage": 3, "static_expected": "FAIL"},
    "02": {"name": "negative_triangle", "rule": "notation.negative_forbidden", "stage": 3, "static_expected": "FAIL"},
    "03": {"name": "table_header_left_align", "rule": "table.header_align", "stage": 3, "static_expected": "FAIL"},
    "04": {"name": "footnote_position", "rule": "zones.footnote_bottom_y", "stage": 3, "static_expected": "FAIL"},
    "05": {"name": "text_overflow", "rule": "qa.text_max_ymax_pt", "stage": 5, "static_expected": "FAIL"},
    "06": {"name": "source_value_mismatch", "rule": "calc.source_manifest", "stage": 4, "static_expected": "FAIL"},
    "07": {"name": "cross_page_metric_mismatch", "rule": "audit.error", "stage": 4, "expected": "ERROR", "static_expected": "ERROR"},
    "08": {"name": "title_top_right_not_clear", "rule": "zones.title_right_clear", "stage": 3, "static_expected": "FAIL"},
    "09": {"name": "unregistered_numeric_token", "rule": "claim.unregistered_numeric_token", "stage": 4, "static_expected": "FAIL"},
    "10": {"name": "table_row_too_short", "rule": "table.row_height_min", "stage": 3, "static_expected": "FAIL"},
    "11": {"name": "content_bottom_overflow", "rule": "zones.content_max_y", "stage": 3, "static_expected": "FAIL"},
    "12": {"name": "negative_red", "rule": "forbidden.negative_red", "stage": 3, "static_expected": "FAIL"},
    "13": {"name": "body_text_too_small", "rule": "sizes.body_min_pt", "stage": 3, "static_expected": "FAIL"},
    "14": {"name": "override_logged", "rule": "claim.override", "stage": 4, "expected": "PASS", "static_expected": "PASS"},
    "15": {"name": "red_runs_per_line", "rule": "palette_usage.red_max_per_line", "stage": 3, "static_expected": "FAIL"},
}


def generate(output: Path, defect_id: str | None = None) -> None:
    command = ["node", str(GENERATOR), str(output)]
    if defect_id:
        command.append(defect_id)
    subprocess.run(command, cwd=HERE.parent, check=True)


def generate_shin(defect: str | None = None) -> None:
    stem = "shin_golden" if defect is None else f"shin_{defect}_{SHIN_DEFECTS[defect]['name']}"
    subprocess.run(
        ["node", str(SHIN_GENERATOR), str(HERE / f"{stem}.pptx"), str(HERE / f"{stem}_manifest.json")]
        + ([defect] if defect else []),
        cwd=HERE.parent, check=True,
    )


def make_claim_inputs(defect_id: str) -> None:
    claim_ids = {"00", "06", "07", "09", "14"}
    if defect_id not in claim_ids:
        manifest = {
            "schema_version": 1,
            "style": "corporate-strategy-ppt",
            "house_rule_version": "2026.08",
            "template_version": "fixture-1",
            "token_whitelist": [
                {"slide": 1, "token": token, "reason": "기준 장표 공통 고정 토큰"}
                for token in ("1,000", "-100", "100", "2026", "2026.08", "08", "29")
            ],
            "claims": [],
        }
        (HERE / f"{defect_id}_manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return
    source_name = f"{defect_id}_source.xlsx"
    source_path = HERE / source_name
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "실적"
    sheet["B2"] = 1000
    workbook.save(source_path)
    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()

    if defect_id == "06":
        displays = ["8,421"]
    elif defect_id == "07":
        displays = ["1,000", "1,001"]
    elif defect_id == "14":
        displays = ["1,100"]
    else:
        displays = ["1,000"]
    placements = [
        {
            "slide": slide, "type": "shape", "name": "CLAIM_REVENUE", "text": value,
            "bounds": {"x": 6.05, "y": 3.2, "w": 1.4, "h": 0.35},
            "font": {"face": "맑은 고딕", "size": 10, "bold": False},
            "align": "left", "valign": "top",
        }
        for slide, value in enumerate(displays, 1)
    ]
    claim = {
        "slide": 1,
        "shape_id": "CLAIM_REVENUE",
        "kind": "numeric",
        "placements": placements,
        "display": {"text": displays[0], "unit": "억원", "rounding": 0},
        "source": {
            "file": source_name,
            "file_hash": f"sha256:{digest}",
            "sheet": "실적",
            "ref": "B2",
        },
        "transform": {"type": "identity"},
    }
    if defect_id == "14":
        claim["override"] = {
            "value": "1,100",
            "reason": "이사회 승인 조정 후 수치",
            "author": "fixture-user",
            "at": "2026-08-29T12:00:00+09:00",
        }
    manifest = {
        "schema_version": 1,
        "style": "corporate-strategy-ppt",
        "house_rule_version": "2026.08",
        "template_version": "fixture-1",
        "token_whitelist": [
            {"slide": slide, "token": "-100", "reason": "음수 표기 정적 검사 기준값"}
            for slide in range(1, len(displays) + 1)
        ],
        "claims": [claim],
    }
    (HERE / f"{defect_id}_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    generate(HERE / "00_golden.pptx")
    make_claim_inputs("00")
    generate_shin()
    for defect in SHIN_DEFECTS:
        generate_shin(defect)
    for defect_id, expected in EXPECTED.items():
        generate(HERE / f"{defect_id}_{expected['name']}.pptx", defect_id)
        make_claim_inputs(defect_id)

    payload = {
        "schema_version": 1,
        "golden": {"file": "00_golden.pptx", "expected": "PASS", "manifest": "00_manifest.json"},
        "fixtures": [
            {
                "id": defect_id,
                "file": f"{defect_id}_{expected['name']}.pptx",
                "expected": "FAIL",
                **expected,
                "manifest": f"{defect_id}_manifest.json",
            }
            for defect_id, expected in EXPECTED.items()
        ] + [{
            "id": "shin-golden",
            "file": "shin_golden.pptx",
            "expected": "PASS",
            "static_expected": "PASS",
            "manifest": "shin_golden_manifest.json",
        }, *[{
            "id": f"shin-{defect.lower()}",
            "file": f"shin_{defect}_{meta['name']}.pptx",
            "expected": "FAIL",
            "static_expected": "FAIL",
            "rule": meta["rule"],
            "stage": 3,
            "manifest": f"shin_{defect}_{meta['name']}_manifest.json",
        } for defect, meta in SHIN_DEFECTS.items()]],
    }
    (HERE / "expected_results.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
