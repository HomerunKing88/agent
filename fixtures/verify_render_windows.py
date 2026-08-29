#!/usr/bin/env python3
"""Verify the render gate against golden and overflow fixtures on Windows."""
from __future__ import annotations

import json
import platform
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO))

import render_check  # noqa: E402


def main() -> int:
    if platform.system() != "Windows":
        print("SKIP: native Windows + Microsoft PowerPoint가 필요합니다.")
        return 3

    rules = render_check.load_rules(REPO / "house-rules.yaml")
    golden = render_check.run(FIXTURES / "00_golden.pptx", rules)
    overflow = render_check.run(FIXTURES / "05_text_overflow.pptx", rules)

    payload = {"golden": golden, "overflow": overflow}
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if golden["status"] != "PASS":
        print(f"ERROR: golden expected PASS, got {golden['status']}", file=sys.stderr)
        return 1
    if overflow["status"] != "FAIL":
        print(f"ERROR: overflow fixture expected FAIL, got {overflow['status']}", file=sys.stderr)
        return 1
    rules_found = {issue["rule"] for issue in overflow["issues"]}
    expected = {"render.text_overflow", "render.unexpected_wrap"}
    if not rules_found & expected:
        print(f"ERROR: overflow evidence missing; got {sorted(rules_found)}", file=sys.stderr)
        return 1

    print("RENDER FIXTURE MATCH: golden PASS / defect 05 FAIL")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
