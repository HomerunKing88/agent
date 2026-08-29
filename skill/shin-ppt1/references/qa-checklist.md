# QA 파이프라인 (전달 전 필수)

1~7번은 shin-ppt와 같다. shin-ppt1 전용은 8번(골격)과 9번(테마)이다.
작업 폴더 기준 명령. 실패 시 생성 스크립트를 고쳐 재생성하고 처음부터 다시 검증한다.

## 0. 산출 전 자체 점검

`anti-slop.md`의 다섯 항목을 먼저 본다. 코드를 다 쓰고 렌더하기 전이다.

1. 이 페이지에 accent가 몇 군데 찍혔나. 둘 이상이면 하나로 줄인다
2. 큰 숫자가 표 밖에 떠 있나
3. 하단에 1인치 이상 비었나
4. 병렬 항목이 넷 이상인 블록이 있나
5. 문안에 대구식 수사나 서술형 어미가 있나

## 0. 먼저 `build.sh`로 돌린다

```bash
./build.sh <생성스크립트>.js <산출파일명>.pptx
```

0~5단계(설치 확인 → 생성 → preflight → 렌더 → 지면 밖 검사 → 산출)를 순서대로 돌리고,
하나라도 걸리면 산출 폴더에 파일을 내보내지 않는다. **아래 절차는 build.sh가 이미 돌린
것들의 상세 설명이거나, 자동화할 수 없어 사람이 봐야 하는 것들이다.**

자동으로 걸러지는 것: 구조 20가지, 레이아웃 여백, 지면 밖, 렌더 실패.
**사람이 봐야 하는 것: 문안, 수치 해석, 밀도, 강조 위치.**
`build_render/pg-*.jpg`를 전부 연다. 이 단계는 생략하지 않는다.

## 1. 구조 검증

```bash
python3 /mnt/skills/public/pptx/scripts/office/validate.py <파일.pptx>
```

## 2. 렌더링 + 시각 검사

```bash
python3 /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf <파일.pptx>
pdftoppm -jpeg -r 110 <파일.pdf> pg
```

모든 페이지를 `view`로 실제로 열어 본다. 의심 영역(표 우측 끝, 각주, 라벨 밀집부)은
PIL crop으로 확대해 재확인한다.

```python
from PIL import Image
im = Image.open('pg-1.jpg'); w,h = im.size
im.crop((int(w*0.45), int(h*0.28), int(w*0.78), int(h*0.72))).save('seam.jpg')
```

## 3. 좌표 검증

```bash
pdftotext -bbox -f 1 -l 1 <파일.pdf> - | grep -oP 'yMax="[\d.]+"' | sort -t'"' -k2 -rn | head -1
```

- A4 가로 페이지 높이 = **595.2pt**. 텍스트 최하단 yMax ≤ **593pt** 확보.
- **오탐 주의**: 마스터의 페이지 번호가 ~587pt에 상시 존재한다.
- 겹침: 표 우측 끝(shape.left+width)과 옆 패널 시작 좌표를 python-pptx로 비교.

## 4. 표 폭 정합

```python
for sh in slide.shapes:
    if sh.has_table:
        assert abs(sum(c.width for c in sh.table.columns) - sh.width) < 10000  # EMU
```

## 5. 수치 정합 (표시값 기준)

합계·계 행은 **어떻게 산출했는지 각주에 밝힌다.** 단순평균인지 가중평균인지 적지 않으면
회의에서 재현이 안 된다. 반올림 때문에 합이 안 맞아 단수조정을 걸었다면
**어느 항목에 몇 %p를 걸었는지** 각주에 적는다.

합계 행이 있으면 **표시값끼리 더해서** 맞는지 확인한다. 원본 값으로는 맞고 표시값으로는
안 맞는 경우가 실무에서 가장 자주 나온다.

```python
rows = [1240, 860, -180]
assert sum(rows) == 1920                      # 합계 표시값
pct = [64.6, 44.8, -9.4]
assert abs(sum(pct) - 100.0) < 0.05           # 비중 표시값
```

## 6. 수치 갱신 작업 시: 구수치 잔존 스캔

```python
stale = ['41.0%', '63.5%', ...]  # 교체 전 표시값 전부
for slide in prs.slides:
    texts = 모든 shape/table 텍스트 수집
    assert not [s for s in stale if s in "\n".join(texts)]
```

핵심 신규 수치가 실제로 렌더에 존재하는지도 pdftotext로 확인한다
(단어 분리 주의: "36.9%로"는 "36.9"로 검색).

## 7. 페이지 경계 밖 도형 검사

```python
for sh in slide.shapes:
    r, b = (sh.left+sh.width)/914400, (sh.top+sh.height)/914400
    assert r <= W+0.01 and b <= H+0.01
```

## 8. 골격 검증

### 8-1. 글씨 크기 하한

표 본문은 11.5pt 미만 금지(기본 12.5pt), 각주를 뺀 나머지는 10pt 미만 금지다.

```python
from pptx import Presentation
from pptx.util import Pt
prs = Presentation('<파일.pptx>')
tbl_bad, txt_bad = [], []
for i, sl in enumerate(prs.slides, 1):
    for sh in sl.shapes:
        if sh.has_table:
            for ri, r in enumerate(sh.table.rows):
                if ri == 0: continue          # 헤더는 본문-0.5pt가 설계값
                for c in r.cells:
                    for pa in c.text_frame.paragraphs:
                        for run in pa.runs:
                            if run.font.size and run.font.size.pt < 11.5:
                                tbl_bad.append((i, run.text[:12], run.font.size.pt))
        elif sh.has_text_frame:
            for pa in sh.text_frame.paragraphs:
                for run in pa.runs:
                    sz = run.font.size.pt if run.font.size else None
                    if sz and sz < 10 and sz != 9:      # 9pt는 각주
                        txt_bad.append((i, run.text[:12], sz))
assert not tbl_bad, tbl_bad
assert not txt_bad, txt_bad
```

### 8-1b. 글씨 크기 하드코딩 스캔 (생성 스크립트 대상)

```bash
grep -nE 'fontSize: [0-9]' <생성스크립트.js>
```

결과가 나오면 전부 `TS.*` 키로 바꾼다. 숫자로 박아두면 그 자리만 위계가 어긋난다.

### 8-1c. 글씨 대 블록 비율

표 행 높이가 `글씨(pt) ÷ 24 + 0.20` 이상인지 본다. 12.5pt면 0.72다.
렌더 이미지에서 셀 안이 비어 보이면 행 높이를 줄이거나 글씨를 키운다.

### 8-2. 골격 규칙

- 상단 요약박스가 페이지마다 **정확히 1개** 있는지
- 하단 시사점 행이 **없는지**(강조 메시지 박스는 페이지당 1개 이내)
- 각주 y가 `8.14 - 0.15 × 줄수`인지, 각주 마감선이 그보다 0.12 위인지
- 하우스 팔레트(0D4D79·FFC000)가 섞여 들어오지 않았는지

```bash
unzip -p <파일.pptx> 'ppt/slides/slide*.xml' | grep -oE '(0D4D79|FFC000)' | sort | uniq -c
```

### 8-3. 폰트 지정

HY헤드라인M은 **페이지 제목과 상단 요약박스에만** 쓰였는지 확인한다. 나머지는 맑은 고딕이고,
**글꼴은 두 벌뿐이다.** 셋째 글꼴이 하나라도 있으면 preflight 15번이 잡는다.

```python
from collections import Counter
c = Counter()
for sl in prs.slides:
    for sh in sl.shapes:
        if sh.has_text_frame:
            for pa in sh.text_frame.paragraphs:
                for run in pa.runs:
                    if run.text.strip(): c[run.font.name] += 1
print(c)   # HY헤드라인M은 슬라이드당 2(제목·요약박스), 나머지는 전부 맑은 고딕
```

### 8-4. 표 정렬

**1행(머리글)과 1열은 중앙정렬이다.** preflight 16번이 강제한다.
숫자 열과 짧은 값 열도 중앙정렬이고, 셀 안에서 줄바꿈되는 긴 서술문 열만 좌측정렬한다.
`numAlign: "right"`를 연 표라면 숫자가 셀 오른쪽 벽에 붙지 않았는지 렌더에서 확인한다.

### 8-5. 모서리 일관성

한 덱에서 `rect`와 `roundRect`가 섞여 있으면 안 된다. 단, 표·마감선·차트 막대는
언제나 `rect`이므로 카드류만 본다.

```bash
unzip -p <파일.pptx> 'ppt/slides/slide*.xml' | grep -o 'prst="round\?Rect"' | sort | uniq -c
```

`useCorners("square")`로 만들었으면 roundRect가 0이어야 하고,
`soft`·`round`로 만들었으면 카드가 있는 페이지마다 roundRect가 나와야 한다.

### 8-6. 박스 개수

한 페이지에 테두리 있는 카드가 여덟 개를 넘으면 균일한 격자로 보인다.

```python
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE
prs = Presentation('<파일.pptx>')
for i, sl in enumerate(prs.slides, 1):
    n = sum(1 for sh in sl.shapes
            if sh.shape_type == 1 and getattr(sh, 'line', None) and sh.line.fill.type == 1)
    if n > 8: print(i, '카드', n, '— 줄이거나 bare 처리 검토')
```

### 8-7. 아이콘

아이콘이 도식 카드나 테두리 있는 블록 **안에** 있는지 확인한다.
문자 글리프 배지(₩ ◆ ● ▲ ★)가 없어야 한다.

## 9. 테마 검증 (shin-ppt1 전용)

### 9-1. 팔레트 혼입

한 덱에 테마가 섞여 있으면 안 된다. 슬라이드 XML에서 지면색을 뽑아 전부 같은지 본다.

```bash
unzip -p <파일.pptx> 'ppt/slides/slide*.xml' | grep -oE 'bg1|<a:srgbClr val="[0-9A-F]{6}"' \
  | grep -oE '[0-9A-F]{6}' | sort | uniq -c | sort -rn | head -20
```

쓰지 않은 테마의 accent가 나오면(예: report로 만들었는데 `1F3A63`이 보이면) 색 값을
호출부에 직접 쓴 곳이 있다는 뜻이다. 그 자리를 `C.*`로 바꾼다.

### 9-2. 하드코딩 스캔 (생성 스크립트 대상)

```bash
grep -nE '"[0-9A-Fa-f]{6}"' <생성스크립트.js> | grep -v 'template.js'
```

결과가 나오면 전부 `C.*` 역할 키로 바꾼다. 이게 남아 있으면 테마 전환이 그 페이지에서만
동작하지 않는다.

### 9-3. 지면색 적용

`tpl.addSlide()`를 쓰지 않고 `pres.addSlide()`를 직접 부르면 paper에서 지면색이
안 깔린다. 렌더 이미지의 모서리 픽셀을 찍어 확인한다.

```python
im = Image.open('pg-3.jpg')
assert im.getpixel((5, 5))[:3] != (255, 255, 255)   # paper 테마일 때
```

### 9-4. 계열색 순서

다계열 막대가 여러 페이지에 있으면 같은 계열이 같은 색인지 확인한다.
`barsGroup`은 `C.series` 순서를 그대로 쓰므로, 호출부에서 series 배열의 **순서를 바꾸지
않았는지**만 보면 된다.

## 10. 편집 가능성 검증

받는 사람이 숫자를 고칠 수 있어야 한다. 도형으로 그린 막대는 이 검사에 걸리지 않으므로
**수치 페이지를 만들었다면 아래 세 항목을 반드시 확인한다.**

### 10-1. 차트마다 엑셀 워크시트가 붙었는지

```bash
unzip -l <파일.pptx> | grep -cE 'charts/chart[0-9]+\.xml$'
unzip -l <파일.pptx> | grep -cE 'embeddings/.*\.xlsx$'
```

두 수가 같아야 한다. 워크시트가 없으면 "데이터 편집"이 열리지 않는다.

### 10-2. 워크시트의 값이 장표 수치와 같은지

```bash
mkdir -p /tmp/xl && cd /tmp/xl && unzip -o <파일.pptx> 'ppt/embeddings/*' >/dev/null
python3 -c "
import glob, openpyxl
for f in sorted(glob.glob('ppt/embeddings/*.xlsx')):
    ws = openpyxl.load_workbook(f).active
    print(f.split('/')[-1], [[c.value for c in r] for r in ws.iter_rows()][:4])
"
```

### 10-3. 표가 네이티브 표인지

도형 위에 텍스트를 얹은 가짜 표가 섞이지 않았는지 본다.

```python
from pptx import Presentation
prs = Presentation('<파일.pptx>')
for i, sl in enumerate(prs.slides, 1):
    print(i, '표', sum(1 for sh in sl.shapes if sh.has_table),
             '차트', sum(1 for sh in sl.shapes if sh.has_chart))
```

수치 페이지인데 표도 차트도 0이면 전부 도형으로 그린 것이다. 다시 만든다.

### 10-4. 누적 차트의 데이터 라벨 위치

`validate.py`가 잡아 주지만 직접도 확인한다. 누적 막대에서 `dLblPos="outEnd"`는
파워포인트가 거부한다. `ctr`·`inEnd`·`inBase`만 쓴다.

```bash
unzip -p <파일.pptx> 'ppt/charts/chart*.xml' | grep -o 'dLblPos val="[a-zA-Z]*"' | sort | uniq -c
```
