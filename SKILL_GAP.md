# 스킬 격차 — 파이프라인이 기본 스킬이 아닌 쪽으로 지어져 있다

발견 2026-08-29. **사용자 결정이 나기 전까지 규칙 값을 바꾸지 않는다.**

## 무슨 일인가

`skill/`에 스킬이 둘 들어왔다.

| 스킬 | 언제 쓰나 |
|---|---|
| `corporate-strategy-ppt` | 회사양식. 지정했을 때 |
| `shin-ppt1` | **지정이 없을 때의 기본** |

리포의 `house-rules.yaml` `template.js` `audit.py` `fixtures/`는 **전부
`corporate-strategy-ppt`에서 왔다.** 계획서 1단계가 그 스킬의 `design-system.md`와
`qa-checklist.md`에서 수치를 옮긴 것이다. 기본으로 쓸 스킬은 반영된 적이 없다.

## 얼마나 다른가

`shin-ppt1`의 SKILL.md에 이렇게 적혀 있다.

> 하우스 스타일(corporate-strategy-ppt)의 **배너·칩·크림박스 문법은 가져오지 않는다.**

우리 `template.js`의 주력 헬퍼가 정확히 그 셋이다.

글자 크기도 다르다.

| | 리포 `house-rules.yaml` | `shin-ppt1` |
|---|---|---|
| 페이지 제목 | 17pt | **19pt** |
| 표 본문 | 9pt | **12.5pt** |
| 불릿 본문 | 10pt | **12pt** |

**지금 `audit.py`로 `shin-ppt1` 장표를 검사하면 전부 FAIL 난다.** 반대도 마찬가지다.
`sizes` 절 하나로 두 스타일을 동시에 만족시킬 수 없다.

구성 요소도 다르다. `shin-ppt1`의 `template.js`는 1032줄에 헬퍼가 40개가 넘는다.
리포에 없는 것들: `eyebrow` `summary` `msgBox` `sub` `flow` `stack` `branch`
`matrix` `timeline` `compare` `tree` `chevron` `swimlane` `funnel` `heat` `gantt`
`lineTrend`. 테마 4종(report·mono·paper·dense)을 갈아끼우는 `useTheme`도 있다.
자체 검사기 `preflight.py`와 일괄 실행 `build.sh`도 따로 있다.

## 왜 지금까지 안 보였나

`skill/` 폴더가 비어 있었다. 계획서 2.15가 "스킬 폴더는 배포본, 원본은 리포"라고
정해 놓았지만 실제 파일이 리포에 들어온 적이 없다. 연습 잡을 만들어 사용자가
"템플릿이 완벽하게 적용되지 않았다"고 하기 전까지 격차가 드러나지 않았다.

연습 잡을 먼저 돌리기로 한 판단이 이걸 찾았다. 실제 잡이었으면 더 늦게 알았다.

## 정해야 할 것 (사용자)

1. **두 스타일을 다 지원하나, 기본 하나만 하나.**
   다 지원하면 `house-rules.yaml`이 스타일별로 갈라져야 한다. 지금은 절 하나에
   값이 하나씩만 있다. `audit.py`도 어느 스타일로 검사할지 알아야 한다.
2. **`shin-ppt1`이 기본이면 지금 것을 어떻게 하나.**
   `corporate-strategy-ppt` 기준으로 만든 픽스처 14종과 검사 규칙이 전부
   그 스타일 전용이 된다. 버리지 않고 스타일 태그를 붙이는 쪽이 맞아 보인다.
3. **`shin-ppt1`의 자체 검사기(`preflight.py`)와 우리 `audit.py`의 관계.**
   둘이 겹치면 판정이 갈라진다 (계획서 2.14가 막으려는 상태다).
   흡수할지, `preflight.py`를 그대로 부를지 정해야 한다.

## 그때까지

- `house-rules.yaml`의 규칙 값을 바꾸지 않는다.
- `fixtures/`를 새로 만들지 않는다.
- `audit.py`에 새 규칙을 넣지 않는다.
- 스타일과 무관한 작업(배관, 미리보기, 스키마)은 계속해도 된다.
