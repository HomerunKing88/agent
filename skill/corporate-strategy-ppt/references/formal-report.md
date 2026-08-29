# 공식 보고서 양식: 표지 + Executive Summary

정식 커버 문서(회장·임원 보고)용 회사 공식 양식. 로고·건물 사진·레이아웃이 포함되어
있어 **코드로 재현하지 않고 `assets/formal_template.pptx`를 복사해 편집**한다.

## 공식 색상 팔레트 (양식 레이아웃에 내장된 브랜드 스와치)

| 헥사코드 | RGB | 용도 |
|---|---|---|
| **0D4D79** | 13.77.121 | 브랜드 딥블루 — 표지 밴드, 제목 요소, 표 라벨 셀 |
| **602800** | 96.40.0 | 다크 브라운 — 보조 프레임 색 (서머리 박스 실물 테두리는 632D00) |
| **FFC000** | 255.192.0 | 앰버 — 강조 |
| **FFDC6D** | 255.220.109 | 라이트 앰버 — 보조 강조·배경 |
| **FFF2CC** | 255.242.204 | 크림 틴트 — 옅은 배경 |

키워드 강조 빨강은 **FF0000**. 테마 폰트: 라틴 "맑은 고딕", 본문 한글은 +mn-ea
(테마 상속, 명시하지 않는다). 제목 전용 폰트는 **HY헤드라인M**.

## 표지 (슬라이드 1)

레이아웃이 배경을 제공하므로 슬라이드에서 편집할 것은 두 가지뿐:

- **제목 텍스트박스** @ (2.5, 3.44, 7.72×0.54): HY헤드라인M **32pt** 흰색,
  네이비 밴드(레이아웃: 1.75, 2.64, 9.53×2.12, 0D4D79) 위에 놓임.
  긴 제목은 32pt 한 줄 유지 가능한 길이로(약 20자 이내), 초과 시 부제 줄 분리 권장
- **일자/보고/작성 표** @ (7.62, 5.93, 3.64×1.38): 3행 2열,
  라벨 셀(일자·보고·작성) 네이비 배경+흰 글씨 / 값 셀 흰 배경

레이아웃 고정 요소(건드리지 않음): 우상단 true friend 로고, 좌측 건물 사진,
캔버스 밖(-1.44in)의 색상 스와치 5개(팔레트 참조용 — 삭제 금지).

## Executive Summary (슬라이드 2)

- 제목 "Executive Summary" HY헤드라인M 16pt @ (0.65, 0.55).
  제목 아래 3분절 라인은 레이아웃 제공
- **본문 박스** @ (0.65, 1.26, 10.59×6.3), 테두리 **632D00** 다크 브라운, 배경 옅은 회색
- 본문 문법: `[대괄호 섹션 제목]` → `(라벨) 서술문` 반복 → 마지막 `[시사점]`
  - 본문 **14pt bold 검정(000000을 런에 명시)** — 색 미명시 시 밝은 색 상속 사고 발생
  - 핵심 키워드만 **FF0000 bold**, 줄당 1개 이내
  - 보조 수치는 **11pt** 괄호로 문장 끝에
  - 폰트는 지정하지 않는다(+mn-ea 테마 상속)
- 양식에 든 샘플 본문과 예시 표 2개는 삭제하고 새로 쓴다

## 편집 절차 (python-pptx)

```python
from pptx import Presentation
from pptx.util import Pt
from pptx.dml.color import RGBColor
p = Presentation('formal_template.pptx')

# 표지: 제목 런 교체(서식 보존 위해 첫 런에 전체 텍스트, 나머지 런 비움), 표 값 셀 교체
title_tf = p.slides[0].shapes[0].text_frame
runs = title_tf.paragraphs[0].runs
runs[0].text = '새 제목'
for r in runs[1:]: r.text = ''
tbl = p.slides[0].shapes[1].table   # rows: 일자/보고/작성, col 1이 값

# 서머리: 예시 표 삭제 → 본문 박스 문단 재구성
s2 = p.slides[1]; shapes = list(s2.shapes)
for sh in shapes[2:]:               # 예시 표들
    sh._element.getparent().remove(sh._element)
tf = shapes[1].text_frame
for para in list(tf.paragraphs[1:]): para._p.getparent().remove(para._p)
tf.paragraphs[0].clear()

BLACK, RED = RGBColor(0,0,0), RGBColor(0xFF,0,0)
def addp(runs, first=False, before=0, after=2):
    para = tf.paragraphs[0] if first else tf.add_paragraph()
    para.space_before = Pt(before); para.space_after = Pt(after)
    for t, sz, red in runs:
        r = para.add_run(); r.text = t
        r.font.size = Pt(sz); r.font.bold = True
        r.font.color.rgb = RED if red else BLACK   # 색 명시 필수
# 섹션 제목: addp([('[섹션]',14,False)], after=3)  본문: 14pt, 보조: 11pt
```

## 검증 유의점

- 박스 하단 = 1.26+6.3 = 7.56in = **544.3pt**. 본문 마지막 잉크가 이 안에 있어야 함
- pdftotext -bbox 최댓값 ~587pt는 **마스터 페이지 번호**이므로 오탐 (qa-checklist 참조)
- 렌더 픽셀 검증으로 본문이 검정으로 실재하는지 확인(어두운 픽셀 수 > 0)
