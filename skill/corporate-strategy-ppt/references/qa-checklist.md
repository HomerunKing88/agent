# QA 파이프라인 (전달 전 필수)

작업 폴더 기준 명령. 실패 시 생성 스크립트를 고쳐 재생성하고 처음부터 다시 검증한다.

## 1. 구조 검증

```bash
python3 /mnt/skills/public/pptx/scripts/office/validate.py <파일.pptx>
```

## 2. 렌더링 + 시각 검사

```bash
python3 /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf <파일.pptx>
pdftoppm -jpeg -r 150 <파일.pdf> pg
```

- 모든 페이지를 `view`로 실제로 열어 본다. 의심 영역(표 경계, 각주, 라벨 밀집부)은
  PIL crop으로 확대해 재확인:

```python
from PIL import Image
im = Image.open('pg-1.jpg'); w,h = im.size
im.crop((int(w*0.45), int(h*0.28), int(w*0.78), int(h*0.72))).save('seam.jpg')
```

## 3. 좌표 검증 (pdftotext -bbox)

```bash
pdftotext -bbox -f 1 -l 1 <파일.pdf> - | grep -oP 'yMax="[\d.]+"' | sort -t'"' -k2 -rn | head -1
```

- A4 가로 페이지 높이 = **595.2pt**. 텍스트 최하단 yMax ≤ **593pt** 확보(2pt 여유).
- **오탐 주의**: 마스터의 페이지 번호가 ~587pt에 상시 존재한다. 최댓값이 의심되면
  해당 y의 단어를 grep으로 확인해 본문인지 마스터 요소인지 구분한다.
- 요소별 경계: 특정 텍스트가 패널·박스 안에 있는지 단어 좌표로 확인
  (예: 박스 하단 y×72 = pt 한계와 해당 단어의 yMax 비교).
- 겹침: 표 우측 끝(shape.left+width)과 옆 패널 시작 좌표를 python-pptx로 비교.

## 4. 표 폭 정합

```python
for sh in slide.shapes:
    if sh.has_table:
        assert abs(sum(c.width for c in sh.table.columns) - sh.width) < 10000  # EMU
```

## 5. 글자색 검증 (python-pptx로 텍스트를 새로 쓴 경우 필수)

렌더 이미지에서 본문 영역 픽셀을 샘플링해 어두운 글자 픽셀이 실재하는지 확인:

```python
px = list(im.crop(본문영역).getdata())
dark = [c for c in px if sum(c[:3]) < 330]
assert len(dark) > 1000  # 0이면 글자가 배경색에 묻힌 것 (색 미명시 상속 사고)
```

특정 셀 글자색은 텍스트 획 픽셀을 피해 배경 좌표를 샘플링(셀 좌측 여백 지점)한다.

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
