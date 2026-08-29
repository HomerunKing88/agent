#!/usr/bin/env python3
"""preview.py — 빌드의 미리보기 부산물 (PIPE 담당). 계획서 5절·11절.

builder/out/p1.png... 를 LibreOffice로 만든다. 사람이 눈으로 보는 배치
미리보기일 뿐이고, 넘침 판정은 render_check.py(집 Windows, GATE 2)가 정본이다.
핵심 글꼴(맑은 고딕·HY헤드라인M)이 빠지면 글자 폭·줄바꿈·넘침을 믿을 수
없다는 사실을 out/preview-note.txt 와 run_metadata에 남긴다 (11절).

orchestrator.py cmd_build에서만 불린다. 실패해도 build를 실패시키지 않는다.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

PREVIEW_FONTS = {"맑은 고딕": ("맑은고딕", "malgungothic"),
                 "HY헤드라인M": ("hy헤드라인m", "hyheadlinem", "hyheadline")}


def soffice_path() -> Path | None:
    if sys.platform == "darwin":
        candidates = [Path("/Applications/LibreOffice.app/Contents/MacOS/soffice"),
                      Path.home() / "Applications/LibreOffice.app/Contents/MacOS/soffice"]
    elif sys.platform == "win32":
        candidates = [Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"),
                           "LibreOffice", "program", "soffice.exe"),
                      Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
                           "LibreOffice", "program", "soffice.exe")]
    else:
        candidates = [Path("/usr/bin/soffice"), Path("/usr/local/bin/soffice")]
    found = next((c for c in candidates if c.exists()), None) or shutil.which("soffice")
    return Path(found) if found else None


def installed_fonts() -> set[str]:
    """설치 글꼴(정규화). 미리보기 신뢰 안내 전용 — 게이트와 무관 (계획서 11절)."""
    roots = {"win32": [Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"],
             "darwin": [Path("/System/Library/Fonts"), Path("/Library/Fonts"),
                        Path.home() / "Library" / "Fonts"]}.get(
        sys.platform, [Path("/usr/share/fonts"), Path("/usr/local/share/fonts")])
    names = set()
    for root in roots:
        if root.is_dir():
            names |= {stem for stem in (p.stem for p in root.iterdir()
                                        if p.suffix.lower() in (".ttf", ".otf", ".ttc"))}
    return {name.casefold().replace(" ", "") for name in names if name}


def render_preview(p: dict, version: int = 1) -> dict:
    """pptx → png 부산물. run_metadata에 합칠 필드를 돌려준다.

    preview_status: ok(그림 생성) | skipped(볼 도구가 없음) | failed(변환 실패)
    """
    exe = soffice_path()
    if exe is None:
        return {"preview_status": "skipped", "preview_reason": "LibreOffice(soffice)가 없다 — 미리보기 건너뜀"}
    outdir = p["builder"] / "out"
    outdir.mkdir(parents=True, exist_ok=True)
    for stale in outdir.glob("*.png"):          # 이전 빌드 잔여물 제거
        stale.unlink(missing_ok=True)
    try:
        subprocess.run([str(exe), "--headless", "--convert-to", "png:impress_png_Export",
                        "--outdir", str(outdir), str(p["pptx"])],
                       check=True, capture_output=True, text=True, timeout=180)
        made = sorted(outdir.glob(f"{p['pptx'].stem}*.png"))
    except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired) as error:
        return {"preview_status": "failed", "preview_reason": f"LibreOffice 변환 실패 ({type(error).__name__})"}
    if not made:
        return {"preview_status": "failed", "preview_reason": "변환은 됐으나 png 산출물이 없다"}
    for index, src in enumerate(made, start=1):
        src.replace(outdir / f"p{index}.png")
    present = installed_fonts()
    absent = [name for name, aliases in PREVIEW_FONTS.items()
              if not any(alias in present for alias in aliases)]
    note = (f"배치는 맞지만 글꼴 결손({', '.join(absent)})이라 글자 폭·줄바꿈·넘침은 못 믿는다 "
            f"(계획서 11절). 넘침 판정은 render_check.py가 정본이다." if absent
            else f"글꼴({', '.join(PREVIEW_FONTS)}) 정상 — 이 미리보기는 믿을 수 있다.")
    outdir.joinpath("preview-note.txt").write_text(note + "\n", encoding="utf-8")
    return {"preview_status": "ok", "preview_fonts_missing": absent, "preview_note": note}