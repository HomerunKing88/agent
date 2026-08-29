#!/usr/bin/env python3
"""
preflight.py — 파워포인트가 거부하는 구조 오류를 산출 전에 잡는다.

    python3 preflight.py <파일.pptx> --fix     # 고칠 수 있는 건 고치고 다시 검사
    python3 preflight.py <파일.pptx>           # 검사만

**왜 필요한가**
LibreOffice는 관대해서 깨진 파일도 열고 렌더한다. 파워포인트는 거부하고
"복구가 필요합니다"를 띄운다. 그래서 렌더 이미지를 눈으로 보는 것만으로는
파워포인트에서만 나는 오류를 잡을 수 없다. 이 스크립트가 그 자리를 메운다.

**종료 코드**  0 이상 없음 / 1 오류(전달 금지) / 2 사용법 오류
경고(WARN)는 종료 코드에 영향을 주지 않는다.

**--fix 로 고치는 것**
  - 슬라이드 도형 ID 중복 재부여

검사 항목은 CHECKS 목록 참고. 미디어(동영상·오디오)가 든 슬라이드는 도형 ID가
미디어 rId와 묶여 있어 ID 재부여를 건너뛴다.
"""
import collections
import re
import shutil
import sys
import zipfile
from xml.etree import ElementTree as ET

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"

CNVPR = re.compile(r'(<p:cNvPr\s+id=")(\d+)(")')
MEDIA = re.compile(r"<a:(video|audio)File\b|action=\"ppaction://media\"")
SLIDE = re.compile(r"ppt/slides/slide\d+\.xml")
EMU = 914400.0

CHECKS = """
1  모든 XML 파트가 파싱되는가
2  [Content_Types]에 모든 파트의 형식이 선언됐는가
3  .rels의 Id가 중복되지 않는가
4  .rels가 가리키는 내부 파트가 실제로 존재하는가
5  파트가 참조하는 r:id가 해당 .rels에 있는가
6  슬라이드 도형 ID가 중복되지 않는가          ← 표를 넣으면 여기서 깨진다
7  spTree 루트 그룹의 ID가 1인가
8  표의 열 수와 각 행의 칸 수가 맞는가
9  표의 열 너비 합이 표 틀 너비와 맞는가
10 차트마다 엑셀 워크시트가 연결됐는가
11 누적 차트의 데이터 라벨 위치가 유효한가
12 도형이 슬라이드 경계 안에 있는가
13 표 본문 글씨가 11.5pt 이상인가
14 각주를 뺀 글씨가 10pt 이상인가
15 글꼴이 맑은 고딕·HY헤드라인M 두 벌뿐인가
16 표의 1행과 1열이 중앙정렬인가
17 하우스 팔레트(딥블루·골드)가 섞여 들어오지 않았는가
18 한 덱에서 테마를 섞지 않았는가
19 본문이 각주 영역을 침범하지 않는가
20 빈 텍스트 상자가 남아 있지 않은가
"""

# 하우스 스타일(corporate-strategy-ppt) 색. shin 계열에 섞이면 안 된다
HOUSE = {"0D4D79", "FFC000"}
ALLOW_MIXED = [False]

# 허용 글꼴 두 벌. 셋째 글꼴이 들어오면 오류다
FONTS_OK = {"맑은 고딕", "HY헤드라인M"}


class Report:
    def __init__(self):
        self.err = []
        self.warn = []

    def e(self, where, msg):
        self.err.append(f"[오류] {where}: {msg}")

    def w(self, where, msg):
        self.warn.append(f"[경고] {where}: {msg}")


def rels_path(part):
    i = part.rfind("/")
    return part[:i] + "/_rels/" + part[i + 1:] + ".rels"


def check(path, rep):
    z = zipfile.ZipFile(path)
    names = set(z.namelist())
    parsed = {}

    # 1. XML 파싱
    for n in sorted(names):
        if n.endswith(".xml") or n.endswith(".rels"):
            try:
                parsed[n] = ET.fromstring(z.read(n))
            except ET.ParseError as ex:
                rep.e(n, f"XML 파싱 실패 — {ex}")

    # 2. Content_Types
    ct = parsed.get("[Content_Types].xml")
    if ct is None:
        rep.e("[Content_Types].xml", "없음")
    else:
        defaults = {e.get("Extension", "").lower() for e in ct.findall(f"{{{CT}}}Default")}
        overrides = {e.get("PartName") for e in ct.findall(f"{{{CT}}}Override")}
        for n in sorted(names):
            if n.endswith("/"):                      # 디렉터리 엔트리는 파트가 아니다
                continue
            if n.startswith("_rels/") or "/_rels/" in n or n == "[Content_Types].xml":
                continue
            ext = n.rsplit(".", 1)[-1].lower() if "." in n else ""
            if "/" + n not in overrides and ext not in defaults:
                rep.e("[Content_Types].xml", f"{n}의 형식 선언이 없음 (확장자 .{ext})")

    # 3·4. 관계 파일
    rel_ids = {}
    for n in sorted(names):
        if not n.endswith(".rels"):
            continue
        root = parsed.get(n)
        if root is None:
            continue
        if n == "_rels/.rels":                       # 패키지 루트 관계 파일
            base, base_dir = "", ""
        else:
            base = n.replace("/_rels/", "/").rsplit(".rels", 1)[0]
            base_dir = base.rsplit("/", 1)[0] if "/" in base else ""
        ids, seen = {}, set()
        for e in root.findall(f"{{{PR}}}Relationship"):
            rid, tgt, mode = e.get("Id"), e.get("Target", ""), e.get("TargetMode", "")
            if rid in seen:
                rep.e(n, f"Id 중복: {rid}")
            seen.add(rid)
            ids[rid] = tgt
            if mode == "External":
                continue
            # 경로 정규화. "/"로 시작하면 패키지 루트 기준이다
            parts = (tgt if tgt.startswith("/") else base_dir + "/" + tgt).split("/")
            stack = []
            for seg in parts:
                if seg in ("", "."):
                    continue
                if seg == "..":
                    if stack:
                        stack.pop()
                else:
                    stack.append(seg)
            resolved = "/".join(stack)
            if resolved not in names:
                rep.e(n, f"{rid}이 가리키는 {resolved}가 패키지에 없음")
        rel_ids[base] = ids

    # 5. r:id 참조 무결성
    for n in sorted(names):
        if not n.endswith(".xml") or n == "[Content_Types].xml":
            continue
        raw = z.read(n).decode("utf-8", "replace")
        used = set(re.findall(r'r:(?:id|embed|link|pict|dm|lo|qs|cs)="([^"]+)"', raw))
        if not used:
            continue
        have = set(rel_ids.get(n, {}))
        for rid in sorted(used - have):
            rep.e(n, f"{rid}을 참조하는데 관계 파일에 없음")

    # 6·7·8·9·12·13·14. 슬라이드
    slides = sorted((n for n in names if SLIDE.fullmatch(n)),
                    key=lambda s: int(re.findall(r"\d+", s)[0]))
    pres = parsed.get("ppt/presentation.xml")
    sw = sh = None
    if pres is not None:
        sz = pres.find(f"{{{P}}}sldSz")
        if sz is not None:
            sw, sh = int(sz.get("cx")) / EMU, int(sz.get("cy")) / EMU

    for n in slides:
        raw = z.read(n).decode("utf-8", "replace")
        tag = n.rsplit("/", 1)[-1]

        # 6. ID 중복
        ids = CNVPR.findall(raw)
        cnt = collections.Counter(i for _, i, _ in ids)
        dup = sorted((k for k, v in cnt.items() if v > 1), key=int)
        if dup:
            rep.e(tag, f"도형 ID 중복 {dup} — preflight.py --fix 로 해소")
        if "0" in cnt:
            rep.e(tag, "도형 ID 0이 있음")

        # 7. spTree 루트
        m = re.search(r"<p:nvGrpSpPr><p:cNvPr\s+id=\"(\d+)\"", raw)
        if m and m.group(1) != "1":
            rep.e(tag, f"spTree 루트 그룹 ID가 {m.group(1)} (1이어야 함)")

        root = parsed.get(n)
        if root is None:
            continue

        # 8·9. 표
        for gf in root.iter(f"{{{P}}}graphicFrame"):
            tbl = gf.find(f".//{{{A}}}tbl")
            if tbl is None:
                continue
            grid = tbl.find(f"{{{A}}}tblGrid")
            cols = grid.findall(f"{{{A}}}gridCol") if grid is not None else []
            ncol = len(cols)
            for ri, tr in enumerate(tbl.findall(f"{{{A}}}tr")):
                ntc = len(tr.findall(f"{{{A}}}tc"))
                if ntc != ncol:
                    rep.e(tag, f"표 {ri + 1}행의 칸 수 {ntc} != 열 수 {ncol}")
                if tr.get("h") is None:
                    rep.w(tag, f"표 {ri + 1}행에 높이 지정이 없음")
            ext = gf.find(f".//{{{A}}}ext")
            if ext is not None and ncol:
                cx = int(ext.get("cx"))
                total = sum(int(c.get("w")) for c in cols)
                if abs(total - cx) > 10000:
                    rep.e(tag, f"표 열 너비 합 {total / EMU:.3f}in != 표 폭 {cx / EMU:.3f}in")

        # 12. 경계
        if sw:
            for sp in list(root.iter(f"{{{P}}}sp")) + list(root.iter(f"{{{P}}}graphicFrame")) + list(root.iter(f"{{{P}}}pic")):
                off = sp.find(f".//{{{A}}}off")
                ex = sp.find(f".//{{{A}}}ext")
                if off is None or ex is None:
                    continue
                r_ = (int(off.get("x")) + int(ex.get("cx"))) / EMU
                b_ = (int(off.get("y")) + int(ex.get("cy"))) / EMU
                if r_ > sw + 0.02 or b_ > sh + 0.02:
                    rep.w(tag, f"도형이 지면 밖 (우 {r_:.2f} / 하 {b_:.2f}, 지면 {sw:.2f}×{sh:.2f})")

        # 13·14. 글씨 크기
        for gf in root.iter(f"{{{P}}}graphicFrame"):
            tbl = gf.find(f".//{{{A}}}tbl")
            if tbl is None:
                continue
            for ri, tr in enumerate(tbl.findall(f"{{{A}}}tr")):
                if ri == 0:
                    continue          # 머리글은 본문 - 0.5pt가 설계값
                for rpr in tr.iter(f"{{{A}}}rPr"):
                    szv = rpr.get("sz")
                    if szv and int(szv) < 1150:
                        rep.e(tag, f"표 본문 글씨 {int(szv) / 100}pt (하한 11.5pt)")
        for sp in root.iter(f"{{{P}}}sp"):
            for rpr in sp.iter(f"{{{A}}}rPr"):
                szv = rpr.get("sz")
                if szv and int(szv) < 1000 and int(szv) != 900:
                    rep.w(tag, f"본문 글씨 {int(szv) / 100}pt (각주 9pt 외에는 10pt 이상)")

        # 16. 표 1행·1열 중앙정렬
        for gf in root.iter(f"{{{P}}}graphicFrame"):
            tbl = gf.find(f".//{{{A}}}tbl")
            if tbl is None:
                continue
            trs = tbl.findall(f"{{{A}}}tr")

            def algn(tc):
                pr = tc.find(f".//{{{A}}}pPr")
                return pr.get("algn") if pr is not None else None

            for ci, tc in enumerate(trs[0].findall(f"{{{A}}}tc")):
                if algn(tc) != "ctr":
                    rep.e(tag, f"표 머리글 {ci + 1}번째 칸이 중앙정렬이 아님 ({algn(tc) or '좌측(기본)'})")
            for ri, tr in enumerate(trs):
                tcs = tr.findall(f"{{{A}}}tc")
                if tcs and algn(tcs[0]) != "ctr":
                    rep.e(tag, f"표 {ri + 1}행 1열이 중앙정렬이 아님 ({algn(tcs[0]) or '좌측(기본)'})")

        # 19. 각주 영역 침범
        foot_top = None
        for sp in root.iter(f"{{{P}}}sp"):
            txt = "".join(t.text or "" for t in sp.iter(f"{{{A}}}t"))
            off = sp.find(f".//{{{A}}}off")
            if txt.strip().startswith("※") and off is not None:
                yv = int(off.get("y")) / EMU
                foot_top = yv if foot_top is None else min(foot_top, yv)
        if foot_top is not None:
            for sp in list(root.iter(f"{{{P}}}sp")) + list(root.iter(f"{{{P}}}graphicFrame")):
                off, ex = sp.find(f".//{{{A}}}off"), sp.find(f".//{{{A}}}ext")
                if off is None or ex is None:
                    continue
                h_ = int(ex.get("cy")) / EMU
                if h_ < 0.05:                      # 마감선 같은 얇은 선은 제외
                    continue
                top_ = int(off.get("y")) / EMU
                if top_ >= foot_top - 0.01:        # 각주 자신
                    continue
                if top_ + h_ > foot_top + 0.02:
                    rep.e(tag, f"본문이 각주 영역을 침범 (하단 {top_ + h_:.2f} > 각주 상단 {foot_top:.2f})")
                    break

        # 20. 빈 텍스트 상자
        for sp in root.iter(f"{{{P}}}sp"):
            tb = sp.find(f".//{{{P}}}txBody")
            if tb is None:
                continue
            runs = list(sp.iter(f"{{{A}}}t"))
            if runs and not "".join(t.text or "" for t in runs).strip():
                rep.w(tag, "빈 텍스트 상자가 있음")
                break

    # 17·18. 팔레트 혼입과 테마 혼용
    pages = collections.Counter()
    for n in slides:
        raw = z.read(n).decode("utf-8", "replace")
        tag = n.rsplit("/", 1)[-1]
        found = HOUSE & set(re.findall(r'val="([0-9A-F]{6})"', raw))
        if found:
            rep.e(tag, f"하우스 팔레트 {sorted(found)}가 섞여 있음")
        m = re.search(r"<p:bg>.*?srgbClr val=\"([0-9A-F]{6})\"", raw, re.S)
        if m:
            pages[m.group(1)] += 1
    if len(pages) > 1:
        if ALLOW_MIXED[0]:
            rep.w("패키지", f"지면색이 여러 개 {dict(pages)} — 견본이라 허용됨")
        else:
            rep.e("패키지", f"지면색이 여러 개 — 한 덱에서 테마를 섞었다 {dict(pages)}. "
                            "견본이라면 --allow-mixed-themes")

    # 15. 글꼴
    used = collections.Counter()
    for n in sorted(names):
        if SLIDE.fullmatch(n) or re.fullmatch(r"ppt/charts/chart\d+\.xml", n):
            for t in re.findall(r'typeface="([^"]+)"', z.read(n).decode("utf-8", "replace")):
                used[t] += 1
    for t, c in used.items():
        if t not in FONTS_OK and not t.startswith("+"):
            rep.e("글꼴", f"허용되지 않은 글꼴 {t!r} {c}곳 — 맑은 고딕·HY헤드라인M만 쓴다")

    # 10·11. 차트
    charts = sorted(n for n in names if re.fullmatch(r"ppt/charts/chart\d+\.xml", n))
    for n in charts:
        tag = n.rsplit("/", 1)[-1]
        rp = rels_path(n)
        targets = list(rel_ids.get(n, {}).values())
        if not any(t.lower().endswith(".xlsx") for t in targets):
            rep.e(tag, "연결된 엑셀 워크시트가 없음 — 데이터 편집이 열리지 않는다")
        raw = z.read(n).decode("utf-8", "replace")
        grouping = set(re.findall(r'<c:grouping val="([a-zA-Z]+)"', raw))
        pos = set(re.findall(r'<c:dLblPos val="([a-zA-Z]+)"', raw))
        if grouping & {"stacked", "percentStacked"}:
            bad = pos - {"ctr", "inEnd", "inBase"}
            if bad:
                rep.e(tag, f"누적 차트에 쓸 수 없는 라벨 위치 {sorted(bad)} (ctr·inEnd·inBase만 가능)")
        if "<c:pieChart>" in raw or "<c:doughnutChart>" in raw:
            bad = pos - {"ctr", "inEnd", "outEnd", "bestFit"}
            if bad:
                rep.e(tag, f"원형 차트에 쓸 수 없는 라벨 위치 {sorted(bad)}")

    # 차트 수 == 워크시트 수
    xl = [n for n in names if n.startswith("ppt/embeddings/") and n.lower().endswith(".xlsx")]
    if charts and len(xl) != len(charts):
        rep.e("패키지", f"차트 {len(charts)}개인데 워크시트 {len(xl)}개")

    z.close()


def fix_ids(path, rep):
    """슬라이드 도형 ID를 1부터 다시 매긴다. 고친 슬라이드 수를 반환한다."""
    src = path + ".bak"
    shutil.copyfile(path, src)
    fixed = 0
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zout:
        for it in zin.infolist():
            data = zin.read(it.filename)
            if SLIDE.fullmatch(it.filename):
                xml = data.decode("utf-8")
                ids = [i for _, i, _ in CNVPR.findall(xml)]
                dup = [k for k, v in collections.Counter(ids).items() if v > 1]
                if dup:
                    if MEDIA.search(xml):
                        rep.w(it.filename, "미디어가 있어 ID 재부여를 건너뜀 — 수동 확인 필요")
                    else:
                        n = [0]

                        def sub(m):
                            n[0] += 1
                            return m.group(1) + str(n[0]) + m.group(3)

                        xml = CNVPR.sub(sub, xml)
                        data = xml.encode("utf-8")
                        fixed += 1
            zout.writestr(it, data)
    return fixed


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    do_fix = "--fix" in sys.argv[2:]
    ALLOW_MIXED[0] = "--allow-mixed-themes" in sys.argv[2:]

    if do_fix:
        pre = Report()
        n = fix_ids(path, pre)
        if n:
            print(f"수정: 슬라이드 {n}장의 도형 ID를 다시 매김")
        for w in pre.warn:
            print(w)

    rep = Report()
    check(path, rep)

    for line in rep.err:
        print(line)
    for line in rep.warn:
        print(line)

    if rep.err:
        print(f"\n실패 — 오류 {len(rep.err)}건. 전달하지 말 것.")
        return 1
    print(f"\n통과 — 오류 없음{f' (경고 {len(rep.warn)}건)' if rep.warn else ''}.")
    if do_fix:
        print(f"원본은 {path}.bak 에 있음. 확인 후 지울 것.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
