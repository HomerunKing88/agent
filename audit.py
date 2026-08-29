#!/usr/bin/env python3
"""Deterministic static PPTX house-rule checks."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import yaml
from pptx import Presentation
from pptx.enum.text import PP_ALIGN
from openpyxl import load_workbook

if sys.version_info < (3, 11):
    raise SystemExit("audit.py requires Python 3.11 or newer (see DEVELOPMENT_PLAN.md section 4)")

from schemas.manifest import validate as validate_manifest

@dataclass(frozen=True)
class Issue:
    rule: str
    slide: int
    shape: str
    evidence: str


def load_rules(path):
    with path.open(encoding="utf-8") as handle:
        rules = yaml.safe_load(handle)
    required = {"fonts", "sizes", "table", "zones", "notation", "forbidden", "palette", "qa"}
    missing = sorted(required - rules.keys())
    if missing:
        raise ValueError(f"house-rules missing sections: {', '.join(missing)}")
    return rules


def style_rules(rules, manifest_path=None):
    """Return the rules for a manifest's style, or the configured default.

    A missing/unknown style is an error: silently falling back to another
    style would produce a PASS against the wrong house standard.
    """
    style = None
    if manifest_path is not None:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        style = payload.get("style")
        if not style:
            raise ValueError("manifest style is required")
    else:
        style = rules.get("default_style")
        if not style:
            raise ValueError("style is unknown: manifest missing and default_style is not configured")
    styles = rules.get("styles", {})
    if style not in styles:
        raise ValueError(f"unknown style {style!r}; expected one of {sorted(styles)}")
    effective = dict(rules)
    effective.update(styles[style])
    return effective


def text_shapes(slide):
    return (shape for shape in slide.shapes if getattr(shape, "has_text_frame", False))


def text(shape):
    return "\n".join(paragraph.text for paragraph in shape.text_frame.paragraphs)


def fonts(text_frame):
    return {
        run.font.name
        for paragraph in text_frame.paragraphs
        for run in paragraph.runs
        if run.font.name
    }


def check_fonts(prs, rules):
    allowed = {rules["fonts"]["heading"], rules["fonts"]["body"]}
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            frames = []
            if getattr(shape, "has_text_frame", False):
                frames.append(shape.text_frame)
            if getattr(shape, "has_table", False):
                frames.extend(cell.text_frame for row in shape.table.rows for cell in row.cells)
            extra = sorted(set().union(*(fonts(frame) for frame in frames)) - allowed) if frames else []
            if extra:
                issues.append(Issue("forbidden.third_font", page, shape.name,
                                    f"허용되지 않은 글꼴: {', '.join(extra)}"))
    return issues


def check_notation(prs, rules):
    forbidden = tuple(rules["notation"]["negative_forbidden"])
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            values = []
            if getattr(shape, "has_text_frame", False):
                values.append(text(shape))
            if getattr(shape, "has_table", False):
                values.extend(cell.text for row in shape.table.rows for cell in row.cells)
            found = sorted({mark for value in values for mark in forbidden if mark in value})
            if found:
                issues.append(Issue("notation.negative_forbidden", page, shape.name,
                                    f"금지 음수 부호: {', '.join(found)}"))
    return issues


def run_color(run):
    try:
        rgb = run.font.color.rgb
        return str(rgb).upper() if rgb is not None else None
    except (AttributeError, TypeError, ValueError):
        return None


def check_negative_red(prs, rules):
    if "negative_red" not in rules["forbidden"]:
        return []
    negative = re.escape(rules["notation"]["negative"])
    pattern = re.compile(rf"{negative}\s*\d")
    red = str(rules["palette"]["red"]).upper()
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            frames = []
            if getattr(shape, "has_text_frame", False):
                frames.append(shape.text_frame)
            if getattr(shape, "has_table", False):
                frames.extend(cell.text_frame for row in shape.table.rows for cell in row.cells)
            for frame in frames:
                for paragraph in frame.paragraphs:
                    for run in paragraph.runs:
                        if pattern.search(run.text) and run_color(run) == red:
                            issues.append(Issue("forbidden.negative_red", page, shape.name,
                                                f"빨강 음수: {run.text!r}"))
    return issues


def check_red_runs_per_line(prs, rules):
    section = "palette_" + "usage"
    maximum = int(rules[section]["red_max_per_line"])
    red = str(rules["palette"]["red"]).upper()
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            frames = []
            if getattr(shape, "has_text_frame", False):
                frames.append(shape.text_frame)
            if getattr(shape, "has_table", False):
                frames.extend(cell.text_frame for row in shape.table.rows for cell in row.cells)
            for frame in frames:
                for line, paragraph in enumerate(frame.paragraphs, 1):
                    count = sum(1 for run in paragraph.runs
                                if run.text.strip() and run_color(run) == red)
                    if count > maximum:
                        issues.append(Issue(
                            section + ".red_max_per_line", page, shape.name,
                            f"{line}번째 문단 빨강 런={count} > {maximum}",
                        ))
    return issues


def minimum_font_size(shape_name, rules, is_table=False):
    sizes = rules["sizes"]
    if is_table:
        return float(sizes["table_body_min_pt"])
    base = shape_name.split("#", 1)[0]
    table = rules["role_min_pt"]
    key = table.get(base)
    if key is None:
        key = table["_claim_shape"] if "/" not in base else table["_default"]
    if key not in sizes:
        raise ValueError(f"role_min_pt[{base!r}] references missing sizes key: {key!r}")
    return float(sizes[key])


def check_font_sizes(prs, rules):
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            frames = []
            if getattr(shape, "has_text_frame", False):
                frames.append((shape.text_frame, False))
            if getattr(shape, "has_table", False):
                frames.extend((cell.text_frame, True) for row in shape.table.rows for cell in row.cells)
            for frame, is_table in frames:
                minimum = minimum_font_size(shape.name, rules, is_table)
                for paragraph in frame.paragraphs:
                    for run in paragraph.runs:
                        if not run.text.strip() or run.font.size is None:
                            continue
                        actual = run.font.size.pt
                        if actual + 0.001 < minimum:
                            issues.append(Issue("sizes.body_min_pt", page, shape.name,
                                                f"{actual:g}pt < 역할별 하한 {minimum:g}pt: {run.text[:30]!r}"))
    return issues


def check_headers(prs, rules):
    if rules["table"]["header_align"] != "center":
        raise ValueError("only table.header_align=center is supported")
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            if not getattr(shape, "has_table", False) or not shape.table.rows:
                continue
            bad = [index for index, cell in enumerate(shape.table.rows[0].cells, 1)
                   if any(p.alignment != PP_ALIGN.CENTER for p in cell.text_frame.paragraphs)]
            if bad:
                issues.append(Issue("table.header_align", page, shape.name,
                                    f"헤더 중앙정렬 위반 셀: {bad}"))
    return issues


def check_footnotes(prs, rules):
    zones = rules["zones"]
    markers = tuple(rules["components"]["footnote_markers"])
    tolerance = rules["qa"]["canvas_overflow_tolerance_in"]
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in text_shapes(slide):
            if not shape.name.startswith("footer/"):
                continue
            paragraphs = [p.text.strip() for p in shape.text_frame.paragraphs if p.text.strip()]
            if not paragraphs or not paragraphs[0].startswith(markers):
                continue
            expected = zones["footnote_bottom_y"] - zones["footnote_line_step"] * len(paragraphs)
            actual = shape.top / rules["units"]["emu_per_inch"]
            if abs(actual - expected) > tolerance:
                issues.append(Issue("zones.footnote_bottom_y", page, shape.name,
                                    f"각주 y={actual:.2f}, 기대값={expected:.2f}"))
    return issues


def estimated_height(shape, rules):
    width_pt = shape.width / rules["units"]["emu_per_inch"] * rules["units"]["pt_per_inch"]
    if width_pt <= 0:
        return math.inf
    lines, max_size = 0, float(rules["sizes"]["body_min_pt"])
    for paragraph in shape.text_frame.paragraphs:
        weighted = 0.0
        for run in paragraph.runs:
            size = run.font.size.pt if run.font.size else max_size
            max_size = max(max_size, size)
            weighted += sum(size * (1.0 if ord(char) > 127 else 0.55) for char in run.text)
        lines += max(1, math.ceil(weighted / width_pt))
    return lines * max_size * 1.15 / rules["units"]["pt_per_inch"]


def check_overflow(prs, rules):
    tolerance = rules["qa"]["canvas_overflow_tolerance_in"]
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in text_shapes(slide):
            if not text(shape).strip():
                continue
            needed = estimated_height(shape, rules)
            available = shape.height / rules["units"]["emu_per_inch"]
            if needed > available + tolerance:
                issues.append(Issue("qa.text_max_ymax_pt", page, shape.name,
                                    f"정적 근사 필요높이={needed:.2f}in, 상자높이={available:.2f}in"))
    return issues


def check_title_right(prs, rules):
    if not rules["zones"]["title_right_clear"]:
        return []
    title, layout = rules["components"]["page_title"], rules["layout"]
    right_start = layout["width"] - 3.1
    y0, y1 = title["y"], title["y"] + title["h"]
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in text_shapes(slide):
            unit = rules["units"]["emu_per_inch"]
            x, y, h = shape.left / unit, shape.top / unit, shape.height / unit
            canonical_title = abs(x - layout["margin_x"]) < 0.01 and abs(y - y0) < 0.01
            if not canonical_title and x >= right_start and y < y1 and y + h > y0:
                issues.append(Issue("zones.title_right_clear", page, shape.name,
                                    f"제목 우상단 텍스트: {text(shape)[:60]}"))
    return issues


def check_table_geometry(prs, rules):
    unit = rules["units"]["emu_per_inch"]
    tolerance = rules["qa"]["colw_tolerance_emu"]
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            if not getattr(shape, "has_table", False):
                continue
            table = shape.table
            if rules["table"]["colw_sum_must_equal_width"]:
                total = sum(column.width for column in table.columns)
                if abs(total - shape.width) > tolerance:
                    issues.append(Issue("table.colw_sum_must_equal_width", page, shape.name,
                                        f"열 합={total}EMU, 표 폭={shape.width}EMU"))
            for row_index, row in enumerate(table.rows, 1):
                two_line = any("\n" in cell.text or "\r" in cell.text for cell in row.cells)
                key = "row_height_2line_min" if two_line else "row_height_min"
                minimum = float(rules["table"][key])
                actual = row.height / unit
                if actual + rules["units"]["epsilon_in"] < minimum:
                    issues.append(Issue(f"table.{key}", page, shape.name,
                                        f"{row_index}행 높이={actual:.2f}in < {minimum:.2f}in"))
    return issues


def check_canvas_and_content(prs, rules):
    unit = rules["units"]["emu_per_inch"]
    tolerance = rules["qa"]["canvas_overflow_tolerance_in"]
    page_width, page_height = rules["layout"]["width"], rules["layout"]["height"]
    content_max = rules["zones"]["content_max_y"]
    content_exempt = {"header/draft_tag"}
    issues = []
    for page, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            x, y = shape.left / unit, shape.top / unit
            right, bottom = x + shape.width / unit, y + shape.height / unit
            if x < -tolerance or y < -tolerance or right > page_width + tolerance or bottom > page_height + tolerance:
                issues.append(Issue("layout.canvas_overflow", page, shape.name,
                                    f"bounds=({x:.2f},{y:.2f},{right:.2f},{bottom:.2f})in"))
            exempt = shape.name in content_exempt or shape.name.startswith("footer/")
            if not exempt and bottom > content_max + tolerance:
                issues.append(Issue("zones.content_max_y", page, shape.name,
                                    f"본문 하단={bottom:.2f}in > {content_max:.2f}in"))
    return issues


def format_number(value, display, rules):
    rounding = display.get("rounding")
    if rounding is None:
        return str(value)
    number = float(value)
    absolute = f"{abs(number):,.{rounding}f}"
    absolute = absolute.replace(",", "\0").replace(".", rules["notation"]["decimal_sep"])
    absolute = absolute.replace("\0", rules["notation"]["thousands_sep"])
    if number < 0:
        return rules["notation"]["negative"] + absolute
    if str(display.get("text", "")).startswith(rules["notation"].get("positive", "+")):
        return rules["notation"].get("positive", "+") + absolute
    return absolute


def cell_value(sheet, ref):
    return sheet[ref].value


def calculate_claim(claim, workbook):
    source, transform = claim["source"], claim["transform"]
    sheet = workbook[source["sheet"]]
    kind = transform["type"]
    if kind == "identity":
        return cell_value(sheet, source["ref"])
    if kind == "sum":
        return sum(cell.value or 0 for row in sheet[transform["range"]] for cell in row)
    if kind == "ratio":
        return cell_value(sheet, transform["numerator"]) / cell_value(sheet, transform["denominator"])
    if kind == "delta":
        return cell_value(sheet, transform["to"]) - cell_value(sheet, transform["from"])
    if kind == "cagr":
        start, end = cell_value(sheet, transform["start"]), cell_value(sheet, transform["end"])
        return (end / start) ** (1 / transform["periods"]) - 1
    if kind == "unverified":
        return None
    raise ValueError(f"unsupported transform: {kind}")


def check_claims(prs, rules, manifest_path, source_root=None):
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    schema_errors = validate_manifest(payload, rules)
    if schema_errors:
        raise ValueError("manifest schema: " + " | ".join(schema_errors))
    claims = payload["claims"]
    issues, changes = [], []
    workbooks = {}
    root = source_root or manifest_path.parent
    for claim in claims:
        shape_id = claim["shape_id"]
        display = str(claim["display"]["text"])
        transform = claim["transform"]["type"]
        placements = claim["placements"]
        for placement in placements:
            page = int(placement["slide"])
            placed_text = str(placement["text"])
            if display not in placed_text:
                issues.append(Issue("claim.cross_page_consistency", page, shape_id,
                                    f"placement={placed_text!r}에 display={display!r} 없음"))
            if page < 1 or page > len(prs.slides):
                issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                                    "placement 슬라이드 없음"))
                continue
            slide = prs.slides[page - 1]
            if placement["type"] == "shape":
                matches = [shape for shape in slide.shapes if shape.name == placement["name"]]
                if len(matches) != 1:
                    issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                                        f"named shape 개수={len(matches)}, 기대값=1"))
                    continue
                shape = matches[0]
                actual_text = text(shape).strip()
                if actual_text != placed_text:
                    issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                                        f"placement={placed_text!r}, pptx={actual_text!r}"))
                check_shape_placement(shape, placement, rules, page, shape_id, issues)
            elif placement["type"] == "cell":
                tables = [shape for shape in slide.shapes
                          if getattr(shape, "has_table", False) and shape.name == placement["table"]]
                if len(tables) != 1:
                    issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                                        f"named table 개수={len(tables)}, 기대값=1"))
                    continue
                try:
                    actual_text = tables[0].table.cell(int(placement["row"]), int(placement["col"])).text
                except IndexError:
                    issues.append(Issue("claim.source_manifest_pptx", page, shape_id, "표 셀 좌표 범위 초과"))
                    continue
                if actual_text != placed_text:
                    issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                                        f"placement={placed_text!r}, pptx cell={actual_text!r}"))
            else:
                raise ValueError(f"claim[{shape_id}] unknown placement type: {placement['type']}")

        source = claim.get("source", {})
        if transform == "unverified":
            continue
        source_path = root / source["file"]
        if not source_path.exists():
            raise FileNotFoundError(f"claim[{shape_id}] source missing: {source_path}")
        digest = "sha256:" + hashlib.sha256(source_path.read_bytes()).hexdigest()
        if source.get("file_hash") != digest:
            issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                                "원천 파일 해시 불일치"))
        if source_path not in workbooks:
            workbooks[source_path] = load_workbook(source_path, data_only=True, read_only=True)
        calculated = calculate_claim(claim, workbooks[source_path])
        expected = format_number(calculated, claim["display"], rules)
        override = claim.get("override")
        if override:
            source_display = expected
            if claim["display"].get("rounding") is None and isinstance(calculated, (int, float)):
                decimal_sep = rules["notation"]["decimal_sep"]
                decimals = len(display.rsplit(decimal_sep, 1)[1]) if decimal_sep in display else 0
                source_display = format_number(
                    calculated, {"rounding": decimals, "text": str(calculated)}, rules
                )
            changes.append({
                "shape_id": shape_id,
                "slide": int(claim.get("slide", 1)),
                "source_value": source_display,
                "override_value": display,
                "reason": str(override["reason"]),
                "author": str(override["author"]),
                "at": str(override["at"]),
            })
        elif expected != display:
            issues.append(Issue("calc.source_manifest", int(claim.get("slide", 1)), shape_id,
                                f"source={expected!r}, manifest={display!r}"))
    for workbook in workbooks.values():
        workbook.close()
    issues.extend(check_numeric_tokens(prs, rules, payload))
    return issues, changes


def check_numeric_tokens(prs, rules, manifest):
    config = rules["numeric_tokens"]
    token_re = re.compile(config["pattern"])
    context_patterns = [re.compile(item["pattern"]) for item in config["global_text_whitelist"]]
    job_allowed = set()
    for item in manifest.get("token_whitelist", []):
        job_allowed.add((int(item["slide"]), str(item["token"])))

    registered = set()
    for claim in manifest["claims"]:
        for placement in claim["placements"]:
            registered.update((int(placement["slide"]), match.group(0))
                              for match in token_re.finditer(str(placement["text"])))

    issues, emitted = [], set()
    for page, slide in enumerate(prs.slides, 1):
        containers = []
        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False):
                containers.append((shape.name, text(shape).strip()))
            if getattr(shape, "has_table", False):
                for row_index, row in enumerate(shape.table.rows):
                    for col_index, cell in enumerate(row.cells):
                        containers.append((f"{shape.name}[{row_index},{col_index}]", cell.text.strip()))
        for location, full_text in containers:
            for match in token_re.finditer(full_text):
                token = match.group(0)
                if (page, token) in registered or (page, token) in job_allowed:
                    continue
                if any(pattern.fullmatch(token) for pattern in context_patterns):
                    continue
                key = (page, location, token)
                if key not in emitted:
                    emitted.add(key)
                    issues.append(Issue("claim.unregistered_numeric_token", page, location,
                                        f"등록되지 않은 숫자 토큰: {token!r}"))
    return issues


def check_shape_placement(shape, placement, rules, page, shape_id, issues):
    unit = rules["units"]["emu_per_inch"]
    tolerance = rules["units"]["bounds_tolerance_emu"]
    actual = {"x": shape.left, "y": shape.top, "w": shape.width, "h": shape.height}
    for key, value in placement["bounds"].items():
        expected = round(float(value) * unit)
        if abs(actual[key] - expected) > tolerance:
            issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                                f"bounds.{key} manifest={expected}EMU, pptx={actual[key]}EMU"))
    runs = [run for paragraph in shape.text_frame.paragraphs for run in paragraph.runs if run.text]
    spec = placement["font"]
    if spec.get("face") and any(run.font.name != spec["face"] for run in runs):
        issues.append(Issue("claim.source_manifest_pptx", page, shape_id, "font.face 불일치"))
    if spec.get("size") is not None and any(
            run.font.size is None or abs(run.font.size.pt - float(spec["size"])) > 0.01 for run in runs):
        issues.append(Issue("claim.source_manifest_pptx", page, shape_id, "font.size 불일치"))
    if any(bool(run.font.bold) != bool(spec.get("bold")) for run in runs):
        issues.append(Issue("claim.source_manifest_pptx", page, shape_id, "font.bold 불일치"))
    align_map = {None: "left", PP_ALIGN.LEFT: "left", PP_ALIGN.CENTER: "center",
                 PP_ALIGN.RIGHT: "right", PP_ALIGN.JUSTIFY: "justify"}
    actual_align = align_map.get(shape.text_frame.paragraphs[0].alignment)
    if actual_align != placement.get("align", "left"):
        issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                            f"align manifest={placement.get('align')}, pptx={actual_align}"))
    anchor = str(shape.text_frame.vertical_anchor).split()[0].lower()
    anchor_map = {"middle": "middle", "top": "top", "bottom": "bottom"}
    actual_valign = anchor_map.get(anchor, anchor)
    if actual_valign != placement.get("valign", "middle"):
        issues.append(Issue("claim.source_manifest_pptx", page, shape_id,
                            f"valign manifest={placement.get('valign')}, pptx={actual_valign}"))


def audit(path, rules, manifest_path=None, source_root=None):
    rules = style_rules(rules, manifest_path)
    prs = Presentation(str(path))
    checks = (check_fonts, check_notation, check_negative_red, check_red_runs_per_line, check_font_sizes,
              check_headers, check_footnotes,
              check_overflow, check_title_right, check_table_geometry,
              check_canvas_and_content)
    issues = [issue for check in checks for issue in check(prs, rules)]
    changes = []
    if manifest_path:
        claim_issues, changes = check_claims(prs, rules, manifest_path, source_root)
        issues.extend(claim_issues)
    issues.sort(key=lambda item: (item.slide, item.rule, item.shape, item.evidence))
    return {"file": path.name, "status": "FAIL" if issues else "PASS",
            "issues": [asdict(issue) for issue in issues], "changes": changes}


def audit_safe(path, rules, manifest_path=None, source_root=None):
    try:
        return audit(path, rules, manifest_path, source_root)
    except Exception as error:
        return {
            "file": path.name,
            "status": "ERROR",
            "issues": [],
            "changes": [],
            "error": f"{type(error).__name__}: {error}",
        }


def verify(results, expected_path):
    payload = json.loads(expected_path.read_text(encoding="utf-8"))
    expected = {payload["golden"]["file"]: payload["golden"].get("static_expected", "PASS")}
    expected.update({item["file"]: item.get("static_expected", item["expected"])
                     for item in payload["fixtures"]})
    actual = {item["file"]: item["status"] for item in results}
    return [f"{name}: expected {status}, got {actual.get(name, 'MISSING')}"
            for name, status in expected.items()
            if status != "DEFERRED" and actual.get(name) != status]


def path_default_manifest(pptx_path):
    candidate = pptx_path.with_name("manifest.json")
    return candidate if candidate.exists() else None


def aggregate_status(results):
    priority = {"PASS": 0, "SKIP": 1, "FAIL": 2, "ERROR": 3}
    return max((item["status"] for item in results), key=priority.__getitem__)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path)
    parser.add_argument("--rules", type=Path, default=Path(__file__).with_name("house-rules.yaml"))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--source-root", type=Path)
    args = parser.parse_args(argv)
    paths = sorted(args.target.glob("*.pptx")) if args.target.is_dir() else [args.target]
    if not paths:
        error = f"no pptx files found: {args.target}"
        if args.json:
            print(json.dumps({
                "status": "ERROR",
                "results": [{
                    "file": str(args.target),
                    "status": "ERROR",
                    "issues": [],
                    "changes": [],
                    "error": error,
                }],
                "expected_mismatches": [],
            }, ensure_ascii=False, indent=2))
        else:
            print(error, file=sys.stderr)
        return 2
    rules = load_rules(args.rules)
    expected_path = args.target / "expected_results.json" if args.target.is_dir() else None
    verifying_fixtures = bool(expected_path and expected_path.exists())
    manifest_by_file = {}
    if verifying_fixtures:
        expected_payload = json.loads(expected_path.read_text(encoding="utf-8"))
        manifest_by_file = {
            item["file"]: args.target / item["manifest"]
            for item in expected_payload["fixtures"] if item.get("manifest")
        }
        golden = expected_payload["golden"]
        if golden.get("manifest"):
            manifest_by_file[golden["file"]] = args.target / golden["manifest"]
    elif args.manifest:
        manifest_by_file[paths[0].name] = args.manifest
    elif len(paths) == 1:
        default_manifest = path_default_manifest(paths[0])
        if default_manifest:
            manifest_by_file[paths[0].name] = default_manifest
    results = [audit_safe(path, rules, manifest_by_file.get(path.name), args.source_root)
               for path in paths]
    mismatches = verify(results, expected_path) if verifying_fixtures else []
    payload_status = ("PASS" if not mismatches else "FAIL") if verifying_fixtures else aggregate_status(results)
    payload = {
        "status": payload_status,
        "results": results,
        "expected_mismatches": mismatches,
    }
    if verifying_fixtures:
        payload["fixture_match"] = not mismatches
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for result in results:
            print(f"{result['status']:4} {result['file']}")
            if result.get("error"):
                print(f"  audit.error: {result['error']}")
            for issue in result["issues"]:
                print(f"  p{issue['slide']} {issue['rule']}: {issue['evidence']}")
            for change in result.get("changes", []):
                print(f"  CHANGE p{change['slide']} {change['shape_id']}: "
                      f"{change['source_value']!r} -> {change['override_value']!r} "
                      f"({change['reason']}, {change['author']}, {change['at']})")
        if verifying_fixtures:
            print("EXPECTED MATCH" if not mismatches else "EXPECTED MISMATCH")
            for mismatch in mismatches:
                print(f"  {mismatch}")
    if verifying_fixtures:
        return 0 if not mismatches else 1
    if any(result["status"] == "ERROR" for result in results):
        return 2
    return 1 if any(result["status"] == "FAIL" for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
