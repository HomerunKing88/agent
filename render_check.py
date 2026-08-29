#!/usr/bin/env python3
"""PowerPoint COM render checks for real text bounds and wrapping (Windows only)."""
from __future__ import annotations

import argparse
import json
import platform
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class RenderIssue:
    rule: str
    slide: int
    shape: str
    evidence: str


def load_rules(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        rules = yaml.safe_load(handle)
    for section in ("fonts", "qa", "units"):
        if section not in rules:
            raise ValueError(f"house-rules missing section: {section}")
    return rules


def result(file: Path, status: str, issues=(), skips=(), error=None) -> dict:
    payload = {
        "file": file.name,
        "status": status,
        "issues": [asdict(issue) for issue in issues],
        "skips": list(skips),
    }
    if error:
        payload["error"] = error
    return payload


def installed_font_names(winreg) -> set[str]:
    locations = (
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
    )
    names = set()
    for hive, key_name in locations:
        try:
            with winreg.OpenKey(hive, key_name) as key:
                index = 0
                while True:
                    try:
                        name, value, _ = winreg.EnumValue(key, index)
                    except OSError:
                        break
                    names.add(str(name).casefold())
                    names.add(Path(str(value)).stem.casefold())
                    index += 1
        except OSError:
            continue
    return names


def font_available(font: str, installed: set[str]) -> bool:
    target = font.casefold()
    return any(target in candidate for candidate in installed)


def iter_shapes(collection):
    """Yield top-level, grouped, and table-cell shapes."""
    for index in range(1, collection.Count + 1):
        shape = collection.Item(index)
        yield shape
        if int(shape.Type) == 6:  # msoGroup
            yield from iter_shapes(shape.GroupItems)
        try:
            has_table = bool(shape.HasTable)
        except Exception:
            has_table = False
        if has_table:
            table = shape.Table
            for row in range(1, table.Rows.Count + 1):
                for col in range(1, table.Columns.Count + 1):
                    yield table.Cell(row, col).Shape


def shape_name(shape) -> str:
    try:
        return str(shape.Name)
    except Exception:
        return "<unnamed>"


def text_font_names(text_range) -> set[str]:
    names = set()
    try:
        for index in range(1, text_range.Runs().Count + 1):
            name = str(text_range.Runs(index).Font.Name).strip()
            if name:
                names.add(name)
    except Exception:
        name = str(text_range.Font.Name).strip()
        if name:
            names.add(name)
    return names


def explicit_line_count(value: str) -> int:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    return max(1, len(normalized.split("\n")))


def inspect_presentation(presentation, rules, missing_heading: bool):
    qa = rules["qa"]
    tolerance_pt = rules["qa"]["canvas_overflow_tolerance_in"] * rules["units"]["pt_per_inch"]
    issues, skips = [], []
    for slide_index in range(1, presentation.Slides.Count + 1):
        slide = presentation.Slides.Item(slide_index)
        for shape in iter_shapes(slide.Shapes):
            try:
                if not bool(shape.HasTextFrame) or not bool(shape.TextFrame2.HasText):
                    continue
                frame = shape.TextFrame2
                text_range = frame.TextRange
                value = str(text_range.Text)
                if not value.strip():
                    continue
            except Exception:
                continue

            name = shape_name(shape)
            fonts = text_font_names(text_range)
            if missing_heading and rules["fonts"]["heading"] in fonts:
                skips.append({"slide": slide_index, "shape": name,
                              "reason": f"heading font missing: {rules['fonts']['heading']}"})
                continue

            left = float(text_range.BoundLeft)
            top = float(text_range.BoundTop)
            width = float(text_range.BoundWidth)
            height = float(text_range.BoundHeight)
            right, bottom = left + width, top + height
            shape_left, shape_top = float(shape.Left), float(shape.Top)
            shape_right = shape_left + float(shape.Width)
            shape_bottom = shape_top + float(shape.Height)

            exceeded = []
            if left < shape_left - tolerance_pt:
                exceeded.append("left")
            if top < shape_top - tolerance_pt:
                exceeded.append("top")
            if right > shape_right + tolerance_pt:
                exceeded.append("right")
            if bottom > shape_bottom + tolerance_pt:
                exceeded.append("bottom")
            if exceeded:
                issues.append(RenderIssue(
                    "render.text_overflow", slide_index, name,
                    f"bounds=({left:.1f},{top:.1f},{right:.1f},{bottom:.1f})pt, "
                    f"shape=({shape_left:.1f},{shape_top:.1f},{shape_right:.1f},{shape_bottom:.1f})pt, "
                    f"exceeded={','.join(exceeded)}",
                ))
            if bottom > float(qa["text_max_ymax_pt"]):
                issues.append(RenderIssue(
                    "render.page_text_ymax", slide_index, name,
                    f"text ymax={bottom:.1f}pt > {qa['text_max_ymax_pt']}pt",
                ))

            rendered_lines = int(text_range.Lines().Count)
            explicit_lines = explicit_line_count(value)
            if rendered_lines > explicit_lines:
                issues.append(RenderIssue(
                    "render.unexpected_wrap", slide_index, name,
                    f"명시 {explicit_lines}행, 렌더 {rendered_lines}행",
                ))
    issues.sort(key=lambda item: (item.slide, item.rule, item.shape, item.evidence))
    return issues, skips


def run(path: Path, rules: dict) -> dict:
    if platform.system() != "Windows":
        return result(path, "SKIP", skips=[{"reason": "PowerPoint COM requires native Windows"}])
    try:
        import pythoncom
        import win32com.client
        import winreg
    except ImportError as error:
        return result(path, "SKIP", skips=[{"reason": f"pywin32 unavailable: {error}"}])

    installed = installed_font_names(winreg)
    body_font = rules["fonts"]["body"]
    heading_font = rules["fonts"]["heading"]
    if not font_available(body_font, installed):
        return result(path, "SKIP", skips=[{"reason": f"body font missing: {body_font}"}])
    missing_heading = not font_available(heading_font, installed)

    app = presentation = None
    pythoncom.CoInitialize()
    try:
        app = win32com.client.DispatchEx("PowerPoint.Application")
        presentation = app.Presentations.Open(str(path.resolve()), True, False, False)
        issues, skips = inspect_presentation(presentation, rules, missing_heading)
        return result(path, "FAIL" if issues else "PASS", issues, skips)
    except Exception as error:
        return result(path, "ERROR", error=f"{type(error).__name__}: {error}")
    finally:
        if presentation is not None:
            try:
                presentation.Close()
            except Exception:
                pass
        if app is not None:
            try:
                app.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pptx", type=Path)
    parser.add_argument("--rules", type=Path, default=Path(__file__).with_name("house-rules.yaml"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        if not args.pptx.is_file():
            raise FileNotFoundError(args.pptx)
        payload = run(args.pptx, load_rules(args.rules))
    except Exception as error:
        payload = result(args.pptx, "ERROR", error=f"{type(error).__name__}: {error}")

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"{payload['status']} {payload['file']}")
        for issue in payload["issues"]:
            print(f"  p{issue['slide']} {issue['rule']}: {issue['evidence']}")
        for skip in payload["skips"]:
            where = f"p{skip['slide']} {skip['shape']}: " if "slide" in skip else ""
            print(f"  SKIP {where}{skip['reason']}")
        if payload.get("error"):
            print(f"  render.error: {payload['error']}")
    return {"PASS": 0, "FAIL": 1, "ERROR": 2, "SKIP": 3}[payload["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
