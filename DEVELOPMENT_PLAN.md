# PPT 검토 파이프라인 개발계획

작성 2026-08-27

## 0. 이 문서의 용도

Claude Code 세션 시작 시 최초로 읽는 문서다. 설계 배경과 확정 사항, 아직 정하지 않은 것을 담았다.
이 문서에 적힌 결정을 뒤집는 제안을 하기 전에는 반드시 근거를 제시하고 사용자 확인을 받는다.
문서와 코드가 어긋나면 문서를 고친다. 코드가 문서보다 앞서 나가지 않는다.

---

## 1. 목적

한국투자증권 경영전략실에서 쓰는 1page 보고 PPT를 코드(pptxgenjs)로 생성한 뒤,
검토와 수정 의견 취합을 자동화한다.

해결하려는 문제는 두 가지다.

- 매번 같은 지적을 반복해서 받는다. 폰트, 표 정렬, 음수 표기, 각주 위치 등 규칙 위반이 계속 재발한다.
- 20페이지 장표의 숫자를 사람이 원천자료와 눈으로 대조하는 데 시간이 든다.

자동화 대상이 아닌 것도 명확히 해 둔다. 무엇을 보고할지, 어떤 페이지를 넣고 뺄지는 사용자가 정한다.
시스템은 검수를 하고, 의사결정은 사용자가 한다.

---

## 2. 확정된 설계 결정

아래는 검토를 거쳐 확정된 사항이다. 각 항목의 괄호 안은 그렇게 정한 이유다.

### 2.1 검사보다 예방

규칙 위반은 검사로 잡기 전에 생성 단계에서 막는다.
`template.js` 헬퍼가 이미 규칙을 담고 있으므로, 새 primitive를 만드는 대신
헬퍼를 우회하는 raw 호출을 린트로 검출한다.
(장표를 자유롭게 그린 뒤 검사로 잡으면 수정 루프가 계속 발생한다)

### 2.2 검사기는 결정적으로

좌표, 폰트, 색, 정렬, 각주 위치, 숫자 대조는 스크립트가 판정한다.
LLM에게 매번 물으면 느리고 비싸고 판정이 흔들린다.
Codex의 역할은 검사 대상이 아니라 검사기 저자다.

### 2.3 정적 검사와 렌더 검사를 분리

PPTX XML만으로는 실제 텍스트 넘침과 줄바꿈을 확정할 수 없다.
폰트가 대체되면 글자 폭이 달라져 배치가 바뀐다.

```
GATE 1  static    커밋마다 실행. 좌표, 폰트 지정, 색, 표 정렬, 각주 y, 금지영역, 숫자 대조
GATE 2  render    발송 직전 1회. PowerPoint COM으로 텍스트 실측 경계 조회
```

GATE 2는 HY헤드라인M과 맑은 고딕이 설치된 Windows + PowerPoint 환경을 전제한다.

### 2.4 manifest는 코드가 방출한다

손으로 쓰면 실제 장표와 어긋난다. `deck.js`에서 값을 찍는 지점에 헬퍼를 끼워 부산물로 내보낸다.
manifest에는 값이 아니라 근거 좌표를 적는다. 값을 적으면 장표와 같은 오류를 물려받는다.

대조는 세 지점을 모두 비교한다.

```
SOURCE  ↔  MANIFEST  ↔  FINAL PPTX
```

manifest와 source만 비교하면 장표에 8,421이 찍혀 있어도 PASS가 나온다.

### 2.5 transform 어휘는 닫아 둔다

`identity`, `sum`, `ratio`, `delta`, `cagr` 다섯 개만 둔다.
여기 안 들어가는 값은 `unverified`로 표시하고 근거를 사람이 한 줄 적는다.
(일반 수식 평가기를 만들기 시작하면 스프레드시트 엔진을 다시 쓰게 된다)

### 2.6 등록되지 않은 숫자 검출은 토큰 단위로

장표에 렌더된 모든 숫자 토큰은 등록된 claim이거나 화이트리스트여야 한다.
화이트리스트는 페이지 번호, 단위 표기, 연도 축 라벨 등이다.

문장 단위 사실성 스캔은 하지 않는다.
경영진 보고 장표의 개조식 문장은 형태상 거의 전부 단정형이고 실제로는 사용자의 판단이다.
판단에는 원천이 없다. 의미 기반 스캔은 페이지당 수십 건을 뱉고 두 번째 잡부터 아무도 안 읽는다.

숫자 없는 외부 사실(경쟁사 지위, 제도 시행일, 인용)은 EDITOR가
"출처 미표기 외부 주장" 한 개 카테고리로 잡고 등급은 MINOR로 둔다.

### 2.7 SEVERITY와 ACTION을 분리

두 개는 다른 차원이다. 숫자 오류는 CRITICAL이지만 사용자 승인이 필요 없다.
페이지 통합은 MAJOR지만 사용자가 판단해야 한다.

```
SEVERITY   CRITICAL | MAJOR | MINOR
ACTION     AUTO_FIX | USER_DECISION | REVIEW_ONLY
```

사용자에게 넘기는 것은 ACTION이 USER_DECISION인 항목만이다.

### 2.8 override 경로

원천 파일이 구버전이거나 장표 숫자가 조정 후 수치인 경우가 실제로 자주 있다.
manifest에 `override: { value, reason }`를 두고, override가 붙은 항목은
불일치가 나도 FAIL이 아니라 CHANGELOG에 사유와 함께 기록만 한다.

### 2.9 점수를 산출하지 않는다

Quality Score 94/100 같은 합성 점수는 쓰지 않는다. 근거가 없고 판단에 도움이 안 된다.
이슈의 `confidence` 소수점도 쓰지 않는다. LLM이 내는 확신도는 교정된 값이 아니다.
결정적 검사는 PASS/FAIL, 판단성 지적은 severity만 쓴다.

### 2.10 Domain Authority

다수결로 정하지 않는다. 영역별로 최종 권한을 고정한다.

| 영역 | 최종 권한 |
|---|---|
| 원천 수치, 계산, 합계, 출처 | audit.py (스크립트 판정) |
| 겹침, 마진, 폰트, 색, 좌표 | audit.py (스크립트 판정) |
| 하우스 규칙 위반 | audit.py (스크립트 판정) |
| 문장, 명확성, 논리 흐름, 정보밀도 | EDITOR |
| 페이지 삭제·통합·순서 변경 | 사용자 |
| 브리프에 없는 보고 맥락 | 사용자 |
| 실제 수정 실행 | BUILDER |

### 2.11 R2는 분쟁이 있을 때만

결정적 FAIL에 반론을 시킬 이유가 없다.
BUILDER가 EDITOR 지적에 이의를 제기했을 때만 R2가 발생하고,
그때도 에이전트끼리 토론시키지 않는다. 양쪽 입장을 사용자에게 보내고 버튼으로 정한다.

```
E-017 이견

EDITOR   p7과 p8 논지 중복, 통합 제안
BUILDER  p8은 브리프에서 별도 요청된 항목

[EDITOR안] [BUILDER안] [보류]
```

사용자가 아는 맥락을 두 에이전트는 모른다.

### 2.12 EDITOR는 컨텍스트를 격리한다

EDITOR에게 주는 것은 브리프, 원천자료, 렌더된 PDF뿐이다.
제작 과정, 설계 의도, 이전 수정 대화는 주지 않는다.
잡마다 새 세션을 연다. 재사용하면 앞 잡의 맥락이 남아 격리가 깨진다.

### 2.13 오케스트레이션 프레임워크를 지금 도입하지 않는다

노드 6개, 분기 3갈래, 동시 호출 2개, 주 2~3회 실행, 사용자 1명 규모다.
직접 짜면 400줄 안쪽이다. 프레임워크가 250줄을 줄여 주는 대신
의존성과 학습곡선과 디버깅 난이도가 붙는다.

승인 대기 중 상태 보존(checkpoint, interrupt)도 필요 없다.
슬랙 Socket Mode는 이벤트 구동이라 대기 중 떠 있어야 하는 프로세스가 없고,
상태는 이미 잡 폴더에 디스크로 남는다. 잡 폴더 자체가 체크포인트다.

재검토 시점을 정해 둔다. `orchestrator.py`가 400줄을 넘어가거나,
잡을 여러 개 동시에 돌려야 하거나, 재시도와 추적이 실제로 필요해지면 그때 검토한다.

`pydantic`(pydantic-ai 아님)은 쓴다. EDITOR 응답 스키마를 강제하는 데 필요하다.

### 2.14 house-rules.yaml을 단일 원천으로 둔다

폰트 목록, 각주 y좌표, 표 본문 최소 pt, 금지 영역이
`template.js`와 `audit.py` 두 곳에 각각 적히면 생성기와 검사기가 다른 규칙을 믿게 된다.
값은 YAML 한 곳에 두고 양쪽이 읽는다. 구현 순서상 이것이 첫 번째다.

### 2.17 스타일 두 벌을 지원한다 (확정 2026-08-29)

스킬이 둘이고 둘 다 쓴다.

| 스킬 | 언제 |
|---|---|
| `shin-ppt1` | **기본.** 특별히 지시하지 않으면 이것 |
| `corporate-strategy-ppt` | "경전실 양식으로" 라고 지정했을 때 |

지금까지 리포는 `corporate-strategy-ppt` 한 벌만 알고 있었다. 계획서 1단계가 그 스킬의
수치를 옮긴 것이고, 기본으로 쓸 스킬은 반영된 적이 없다. 격차는 `SKILL_GAP.md`에 있다.

**두 스타일은 수치가 겹치지 않는다.** 표 본문 9pt 대 12.5pt, 제목 17 대 19.
`shin-ppt1`은 `배너·칩·크림박스 문법을 가져오지 않는다`고 자기 정의문에 적어 두었다.
하나의 `sizes` 절로 둘을 동시에 만족시킬 수 없다.

#### 자르는 선 — 파이프라인 어휘와 스타일 규칙

`house-rules.yaml`을 통째로 두 벌로 만들지 않는다. 절반은 스타일과 무관하다.

```
스타일 무관 (그대로 최상위에 둔다)
  units  notation  numeric_tokens  manifest  issues  unenforced  version
    → 단위 환산, 도형 이름 규약, claim 스키마, 이슈 어휘.
      생성기와 검사기를 잇는 계약이지 스타일이 아니다.

스타일별 (styles.<이름> 아래로 내린다)
  layout  fonts  sizes  role_min_pt  palette  palette_usage
  table  zones  components  charts  limits  forbidden  qa
    → 판형, 글꼴, 크기, 색, 표, 금지. 스킬이 다르면 다른 값이다.
```

이 선을 그은 이유는 2.14와 같다. 계약을 스타일별로 두 벌 두면 생성기와 검사기가 갈라진다.
반대로 스타일 규칙을 한 벌로 두면 어느 스킬로 만든 장표인지 검사기가 알 수 없다.

#### 스타일은 manifest가 들고 다닌다

어느 스킬로 만든 장표인지 검사기가 알아야 한다. 버전 전파(2.16-6)와 같은 이유다.

```json
{ "schema_version": 1, "style": "shin-ppt1",
  "house_rule_version": "2026.08", "template_version": "..." }
```

`audit.py`는 `styles[manifest.style]`을 읽어 검사한다. `style`이 없거나 어휘 밖이면 ERROR다.
스타일을 모르는 채로 통과시키면 틀린 기준으로 낸 PASS가 된다 (2.16-7).

#### 생성기는 두 벌이다

스킬마다 `scripts/template.js`가 이미 있고 서로 다르다.
`corporate-strategy-ppt`는 188줄, `shin-ppt1`은 1032줄에 헬퍼가 40개가 넘는다.
하나로 합치지 않는다. 합치면 어느 스킬의 문법인지 호출부에서 알 수 없게 된다.

대신 **claim·도형 이름·manifest 방출(2.16 계약)을 두 생성기에 모두 넣는다.**
그게 검사기가 붙을 수 있는 유일한 지점이다. 지금은 리포의 `template.js`에만 있다.

#### 픽스처와 검사

픽스처는 스타일 태그를 붙인다. 기존 14종은 `corporate-strategy-ppt` 전용이 된다. 버리지 않는다.
`shin-ppt1`용 픽스처는 새로 만든다.

`shin-ppt1`은 자체 검사기 `preflight.py`를 갖고 있다. `audit.py`와 겹치면 판정이 갈라진다.
어느 쪽이 정본인지 정해야 한다 — 미결로 둔다 (10절).

### 2.18 preflight.py와 audit.py의 관계 (확정 2026-08-29)

`shin-ppt1` 스킬이 자체 검사기 `preflight.py`(421줄)를 갖고 있다.
`audit.py`와 겹치면 판정이 갈라진다 — 2.14가 막으려는 상태다. 무엇을 검사하는지 전수로 비교했다.

| | preflight.py | audit.py |
|---|---|---|
| 성격 | **파일 구조** 검사기 | **하우스 규칙** 검사기 |
| XML 파싱, Content_Types, 관계 Id | 있음 | 없음 |
| 도형 ID 중복·0, 빈 텍스트 상자 | 있음 | 없음 |
| 차트↔엑셀 연결, 표 행 높이·칸 수 | 있음 | 없음 |
| claim 3자 대조, 숫자 토큰 | 없음 | 있음 |
| 각주 좌표, 역할별 pt, 캔버스 이탈 | 없음 | 있음 |
| 음수 표기, 게이트 판정 | 없음 | 있음 |
| **허용 글꼴 2종** | 있음 | 있음 |
| **표 열 너비 합** | 있음 | 있음 |

**둘은 층이 다르다. 흡수하지 않는다.**

`preflight.py`는 pptx가 **파일로서 멀쩡한가**를 본다 — 파워포인트가 열 수 있는지, 도형 ID가
중복되지 않는지, 차트에 엑셀이 붙어 있는지. `audit.py`는 그 파일이 **하우스 규칙을 지켰는가**를 본다.
전자가 깨지면 후자는 판정할 대상 자체가 없다. 순서가 있는 것이지 겹치는 것이 아니다.

#### 겹치는 범위 — 처음 분석이 얕았다 (정정 2026-08-30)

처음에는 오류 메시지만 훑고 "겹치는 것은 허용 글꼴과 표 열 너비 합 둘뿐"이라고 적었다.
`preflight.py` 머리에 검사 20개가 번호로 적혀 있는 것을 나중에 봤다. **실제로는 일곱이다.**

```
1~12, 20   구조·규격        스타일과 무관하다
           XML 파싱 / Content_Types / rels Id·참조 / 도형 ID 중복 /
           spTree 루트 ID / 표 칸 수·열 너비 / 차트 엑셀 연결 /
           누적 차트 라벨 / 슬라이드 경계 / 빈 텍스트 상자
13~19      shin 하우스 규칙   corporate 장표에 적용하면 안 된다
           13 표 본문 11.5pt   14 각주 외 10pt   15 글꼴 2종
           16 표 1행·1열 중앙정렬   17 하우스 팔레트 혼입
           18 테마 혼용   19 본문이 각주 영역 침범
```

`13 표 본문 11.5pt`가 문제를 드러냈다. corporate 장표는 표 본문이 9pt다.
`preflight.py`를 그대로 돌리면 **정상 장표가 오류 7건을 받는다.**
2026-08-30 STRUCT 게이트 1차에서 실제로 그렇게 나왔다.

열 너비 허용 오차는 양쪽 다 10000 EMU로 같다.

문제는 `preflight.py`가 값을 코드에 갖고 있다는 것이다.

```python
FONTS_OK = {"맑은 고딕", "HY헤드라인M"}   # preflight.py:68
```

`house-rules.yaml`이 바뀌면 `audit.py`만 따라가고 `preflight.py`는 옛 값으로 통과를 내준다.
2.15가 경계한 상태 그대로다 — "검사기가 조용히 옛 규칙으로 통과를 내주는 상태".

#### 정한 것

1. **`preflight.py`를 그대로 쓴다.** 다시 만들지 않는다. 파일 구조 검사는 audit이 안 하는 일이고
   스킬 저자가 이미 만들어 둔 것이다.
2. **STRUCT 게이트는 1~12·20만 본다.** 13~19는 shin 하우스 규칙이라 스타일을 타고,
   `audit.py`가 `styles[style]`을 읽어 이미 판정한다. 두 벌로 두면 갈라진다 (2.14).
   버리는 것이 아니라 **소유를 나누는 것**이다 — 구조는 preflight, 규칙은 audit.
   어느 번호를 STRUCT로 볼지는 `house-rules.yaml`에 둔다. 코드에 박으면
   `preflight.py`가 검사를 늘렸을 때 조용히 빠진다.
3. **게이트를 하나 더 둔다.** 8절 표에 `STRUCT`를 넣는다. 파일 구조가 깨진 pptx는
   하우스 규칙을 논할 단계가 아니다. 순서상 가장 앞이다.
4. **`preflight.py`는 스킬 원본을 그대로 부른다.** 리포로 옮겨 고치면 스킬과 갈라진다.
   `skill/shin-ppt1/scripts/preflight.py`를 경로로 부르고, 결과 파일을 orchestrator가 합친다
   (2.16-5: 게이트는 결과 파일로 판정한다).

#### 남는 위험

`preflight.py`가 코드에 든 값으로 판정하는 한 갈라질 여지는 남는다.
스킬을 고치는 것은 이 리포의 일이 아니므로, **갈렸을 때 드러나게** 하는 쪽으로 둔다 —
같은 대상에 대해 두 검사기가 다른 판정을 내면 orchestrator가 그것을 이슈로 올린다.
조용히 한쪽만 믿지 않는다.

### 2.15 리포와 잡 폴더를 분리한다

리포에는 규칙과 검사 코드만 둔다. 실적 수치가 든 잡은 리포 밖에 두고 커밋하지 않는다.

스킬 파일이 구버전으로 되돌아가 반영해 둔 규칙이 통째로 사라진 일이 반복해서 있었다.
`audit.py`와 `house-rules.yaml`이 같은 방식으로 유실되면
검사기가 조용히 옛 규칙으로 통과를 내주는 상태가 된다. 지금보다 위험하다.
스킬 폴더는 배포본으로 두고 원본은 git 리포에 둔다.

### 2.16 생성기↔검사기 연결 계약 (확정 2026-08-29)

Codex(audit.py)와 Claude(template.js)가 병렬로 만들면 서로 다른 연결 규격을 믿게 된다.
아래 계약은 어느 쪽이 먼저 구현하든 지켜야 하는 불변 사항이다.

1. **shape 명명 계약** — 모든 헬퍼와 `claim()`이 만드는 도형에 name을 붙인다.
   `manifest.shape_id` ↔ XML shape name이 대조 키다. 표는 shape_id + (행, 열)로 셀까지 참조한다.
2. **claim() 우선 구현** — `claim()`+manifest 방출 → claim 기반 픽스처 재생성 → audit.py 순서로 만든다.
   06/07 결함은 manifest가 있어야만 3자 대조가 가능하므로 지금의 `golden_deck.js`는 4단계에서 다시 쓴다.
3. **manifest에 근거 좌표** — 6.2의 `display.text`만으로는 XML과 대조할 수 없다.
   `bounds{x,y,w,h}`, 폰트, 정렬을 포함해 `check.shape_id`가 뭘 비교할지 확정한다.
4. **단위·오차 규약** — inch(생성기)/EMU(XML)/pt(COM) 환산 상수와 허용 오차를
   house-rules.yaml에 둔다. `deck.js`의 `1e-9` 같은 epsilon도 YAML로 옮긴다.
5. **결과 종합** — audit.py·lint_deck.js·EDITOR는 각자 결과 파일을 내고
   orchestrator가 `issue_register.json`으로 머지한다. gate 판정은 exit code가 아니라 결과 파일로 결정한다.
6. **버전 전파** — 생성기는 template.js 버전, claim 스키마 버전, house-rules version을
   manifest와 픽스처에 함께 새긴다. 규칙이 바뀔 때 "무엇을 기준으로 만든 것인지"를 보존한다.
7. **검사기 실패 상태** — PASS/FAIL 외에 ERROR(검사 불가: 파일 누락·스키마 위반·XML 이상)와
   SKIP(폰트 미설치 등 조건 미충족)를 둔다. manifest가 가리키는 요소를 찾지 못하면 FAIL이다.
   조용한 PASS는 오류로 간주한다.
8. **override 감사** — `override.value` + `override.reason`에 작성자·시각을 붙여
   "출처가 진짜 구버전"인지 "숨김 수정"인지 구분 가능하게 한다.

생성기 쪽 이행 상태 (2026-08-29):
1·3·6 완료 — `template.js` 전 헬퍼가 도형에 name을 붙이고, manifest가 `placements`와
버전 세 개를 방출한다. 형식은 6.2에 적었다.
4 완료 — `units` 절 신설(`emu_per_inch` `pt_per_inch` `emu_per_pt` `epsilon_in`
`bounds_round_in` `bounds_tolerance_emu`). `deck.js`의 `1e-9`는 `units.epsilon_in`으로 옮겼다.
8 완료 — `override_fields` 넷을 생성 단계에서 강제한다. 6.2 참조.
2는 이행 순서라 해당 없고, 5·7은 검사기·오케스트레이터 쪽이다(둘 다 반영됨).

---

## 3. 참여자와 권한

| 이름 | 실행 위치 | 담당 | 제한 |
|---|---|---|---|
| Claude BUILDER | Claude Code, 리포 폴더 | 제작, 수정 반영, 미수용 사유 제시 | 자기 결과물 승인 불가 |
| Claude EDITOR | claude.ai 새 대화 | 메시지, 논리, 표현, 정보밀도, 구조 제안 | 제작 과정 미열람, 수정 직접 불가 |
| Codex | Codex CLI, 같은 리포 폴더 | audit.py 작성·유지, 계산형 claim의 원천 셀 매핑 | 표현·디자인 의견 금지 |
| PIPE | opencode, 같은 리포 폴더 | orchestrator.py, slack_bot.py 작성·유지 | 규칙 값 판단·표현 의견 금지 |
| audit.py | 로컬 | 결정적 판정 | |
| orchestrator.py | 로컬 | 진행, 라우팅, 게이트 판정 | AI 아님 |
| 사용자 | 폰 슬랙 | 구조 변경 승인, 최종 승인 | |

에이전트 셋이 같은 파일을 동시에 고치면 충돌한다. 담당 파일을 나눈다.

```
BUILDER (Claude Code)  template.js, deck.js, schemas/, prompts/, e2e_check.py,
                       relay.sh, ask.sh, opencode.json
Codex                  audit.py, render_check.py, fixtures/
PIPE                   orchestrator.py, slack_bot.py, preview.py
공동                    house-rules.yaml, requirements.txt (변경 시 나머지 둘에게 알림)
인계                    HANDOFF.md (작업 큐. 누구나 자기 줄을 고친다)
```

**작업 브랜치는 `main` 하나다 (확정 2026-08-30).**

원래는 접두사로 나누기로 했다(BUILDER `claude/*`, Codex `codex/*`, PIPE `pipe/*`).
실제로는 한 번도 쓰이지 않았다 — 코덱스·PIPE 커밋 15건이 전부 한 브랜치에 있었고
`codex/*`·`pipe/*` 브랜치는 만들어진 적이 없다.

당연한 결과다. **체크아웃이 하나라 세 브랜치를 동시에 둘 수 없다** (3.1).
한 명이 `git switch`를 하면 나머지 둘의 HEAD도 같이 움직인다.
접두사 규칙은 worktree를 나눴을 때 성립하는 것인데 우리는 안 나눴다.

그래서 규칙을 현실에 맞춘다.

- 셋 다 `main`에서 일한다. 누구 작업인지는 **브랜치가 아니라 커밋이 구분한다** —
  자기 담당 파일만 이름으로 지정해 커밋하므로 파일 경계가 곧 소유 경계다.
- 브랜치를 따로 파야 할 일이 생기면 **사용자에게 알리고** 만든다.
  그때는 셋이 함께 옮긴다. 혼자 옮기면 나머지 둘이 딸려 간다.

### 3.0 BUILDER가 감독한다 (확정 2026-08-29)

사용자는 폰에서 **BUILDER에게만** 지시한다. BUILDER가 CODEX·PIPE에게 일을 시키고 결과를 확인한다.
사용자가 세 세션을 번갈아 열어 결과를 옮기던 일이 사라진다.

```
폰 ──Remote Control──► 맥북 BUILDER ──┬─ ./ask.sh CODEX "..."  → codex exec
                                      └─ ./ask.sh PIPE  "..."  → opencode run
```

**BUILDER는 판정하지 않는다. 전달한다.**
3절 표의 "Claude BUILDER — 자기 결과물 승인 불가"는 그대로 살아 있다.
BUILDER가 지시하고 BUILDER가 검수하면 그 제한이 무너지므로, 통과 판정은 사람도 BUILDER도 아닌
**스크립트가 한다**.

| 판정 | 누가 |
|---|---|
| 하우스 규칙·숫자·좌표 | `audit.py` (2.10 그대로) |
| 이음매·회귀 | `e2e_check.py` |
| 형식 | `schemas/` |
| 게이트 종합 | `orchestrator.py` |
| 무엇을 만들지·페이지 구성 | **사용자** (2.10 그대로) |

BUILDER가 하는 일은 지시를 옮기고, 스크립트 결과를 읽어 다음 지시를 정하고,
아래 목록에 해당하면 폰으로 올리는 것이다. "괜찮아 보인다"로 통과시키지 않는다.

**폰으로 올려야 하는 것 (BUILDER가 무인으로 결정하지 않는다)**

- 브랜치 전환·생성, `git push`, 이력 되감기
- 파일 삭제, `house-rules.yaml` 변경, 계획서 확정 사항 변경
- 담당 파일 경계 변경, 에이전트 추가·제거
- 실적 수치가 든 잡 폴더를 다루는 모든 작업
- 에이전트끼리 판단이 갈려 한쪽을 골라야 할 때 (2.11 그대로 — 토론시키지 않고 사용자에게 올린다)

**승인은 BUILDER가 전담한다 (확정 2026-08-30).**

CODEX·PIPE가 창에서 묻는 승인은 BUILDER가 처리한다. 사용자는 폰에 있어 창을 못 본다.
기준을 적어 둔다. 머릿속에만 있으면 세션이 바뀔 때 흔들린다.

**바로 승인한다**
- 자기 담당 파일만 이름으로 지정한 커밋. 목록을 눈으로 확인하고 승인한다
- 읽기·검사 명령 (`audit.py`, `e2e_check.py`, `git diff`, 잡 폴더 review)
- 추천안이 붙은 선택지. 근거가 이상하지 않으면 추천 쪽으로
- 공동 파일(`house-rules.yaml`) 수정. 단 **무엇을 왜 바꾸는지 diff를 먼저 본다**

**사용자에게 올린다**
- `git push`, 브랜치 전환·생성, 이력 되감기, 파일 삭제
- 계획서 확정 사항 변경, 담당 경계 변경
- 실적 수치가 든 잡 폴더를 다루는 작업
- 에이전트끼리 판단이 갈려 한쪽을 골라야 할 때 (2.11)

**승인 전에 확인한다**
커밋 승인은 파일 목록만 보고 누르지 않는다. `git status --short`와 필요하면 `git diff`를
본다. 오늘 실제로 남의 미커밋 작업이 섞일 뻔한 자리가 있었다.

**승인을 미루지 않는다**
지시를 넣고 자기 작업에 몰두하면 상대가 `blocked`로 멈춰 있는 것을 놓친다.
오늘 세 번 그랬다. **작업 하나가 끝날 때마다 창 상태를 먼저 본다.**

### 3.5 에이전트에게 일을 시키는 법 (2026-08-30)

오늘 실제로 겪은 것에서 나온 규칙이다.

**작게 쪼개서 시킨다.**
PIPE에 STRUCT 게이트를 한 번에 시켰더니 40분이 지나도 안 끝나 중단해야 했다.
큰 일은 두 단계로 나눈다 — 만들고 결과 파일까지 쓰기, 그다음 합류.
중간 산출이 커밋되면 중단해도 잃는 것이 없다.

**판단이 필요하면 먼저 묻게 한다.**
"고치기 전에 의견을 달라"고 하면 근거를 정리해 온다. 코덱스가 화이트리스트 앵커 건에서
"앵커를 풀면 다른 숫자까지 우회한다"는 것을 짚어 냈다. 바로 고치라고 했으면 못 봤을 판단이다.

**확인 조건을 지시에 넣는다.**
"오탐을 없애라"만 시키면 검사를 꺼서 없앨 수도 있다.
"결함 09가 계속 잡히는지 반드시 확인해라"를 같이 넣는다.

**남의 담당은 시키지 않는다.**
경계를 넘는 일이 필요하면 `HANDOFF.md`에 인계를 남기게 한다.
BUILDER도 남의 파일을 고치라고 시킬 권한은 없다.

**인계를 남기기 전에 이미 해결됐는지 본다.**
셋이 동시에 일하면 상대가 고친 것을 모르고 인계를 남긴다.
오늘 다섯 건 중 넷이 그랬다. 큐에 넣기 전에 현재 상태를 확인한다.

**미커밋을 남기고 끝내지 않는다.**
워킹트리에 자기 변경을 남겨 두면 다음 사람이 그것을 자기 커밋에 딸려 넣는다.
커밋하든 되돌리든 한 쪽으로 끝낸다.

**사용자 입력이 필요할 때 (확정 2026-08-29).**
사용자는 맥북 앞에 없다. CODEX·PIPE가 승인 프롬프트에서 멈추면 **아무도 답할 수 없다.**
그래서 입력은 언제나 이 경로로 흐른다.

```
에이전트가 막힘 → BUILDER가 받음 → 폰으로 올림 → 사용자 입력 → BUILDER가 다시 지시
```

에이전트는 사용자를 기다리지 않는다. 막히면 멈추고 BUILDER에게 돌려준다.
`ask.sh`는 응답 없는 호출을 상한 시간에서 끊고 "사용자 입력 필요"로 보고한다.
무한정 매달려 있으면 폰에서는 그냥 조용한 것과 구분되지 않는다.

**무인 승인 수위.** 어느 에이전트에게도 전면 승인을 주지 않는다.
`codex`는 `--sandbox workspace-write --approve-for-me`로 리포 밖을 못 나가고,
`opencode`는 리포의 `opencode.json` `permission`이 담당 파일 경계를 강제한다
(`orchestrator.py`·`slack_bot.py` 외 편집은 ask, `push`·`switch`·`rm`은 deny).
`opencode run --auto`는 쓰지 않는다. 그걸 켜면 permission이 무의미해진다.
문서로만 있던 담당 경계를 기계가 강제하게 만든 것이다.

### 3.3 감독 통로 (herdr 창. 확정 2026-08-29)

**띄워 둔 herdr 창에 지시를 넣는다. 헤드리스 프로세스를 새로 띄우지 않는다.**

처음에는 `codex exec` / `opencode run`으로 새 프로세스를 띄웠다. 잘못된 방식이었다.
사용자가 창을 띄워 놓고 보는데 그 창은 전혀 안 움직였고, 8분 동안 돌고 있는지
죽었는지 알 방법이 없었다. 감독이 목적인데 정작 볼 수가 없었다.

```
./ask.sh CODEX "..."       codex 창에 지시를 넣는다
./ask.sh PIPE --dry "..."  보낼 프롬프트만 확인
./relay.sh                 HANDOFF 큐 상태만 본다
```

`ask.sh`는 지시 앞에 담당 경계와 "커밋 전에 e2e를 돌려라"를 붙인다.
지시만 던지면 세션 규칙 파일을 안 읽고 남의 파일을 건드린다.

밑에서 쓰는 herdr 명령이다. 대상은 이름이 아니라 **pane id**다.

```
herdr agent list                     창과 pane id
herdr agent get <pane>               상태: idle / working / blocked
herdr agent read <pane>              창 출력
herdr agent prompt <pane> "<지시>"    지시 넣기
herdr agent wait <pane> --until idle 끝날 때까지 대기
```

**창에서 돌면 승인 프롬프트가 화면에 뜬다.** 이게 핵심이다.
첫 지시에서 codex가 `blocked`로 멈췄는데, 커밋 승인을 기다리는 화면이었다.
사용자가 창에서 승인해 통과했다. 헤드리스였으면 그냥 매달려 있었을 것이다.
그래서 `ask.sh`에 있던 상한 시간(`ASK_TIMEOUT`)을 뺐다 — 안 보이는 프로세스를
다루려고 넣었던 장치다.

지시 뒤 회귀도 스크립트가 바로 돌리지 않는다. 창의 에이전트는 비동기라
스크립트가 끝난 시점에는 아직 일하는 중이다. `idle`이 된 뒤에 돌린다.

**병렬 배분 (확정 2026-08-29)**

- **편집·검사는 병렬로 해도 된다.** 담당 파일이 안 겹치면 안전하다.
  2026-08-29 확인: codex가 `audit.py`를 고치는 동안 BUILDER의 `ask.sh` 수정이
  미커밋으로 워킹트리에 있었는데 건드리지 않고 자기 파일만 스테이징했다.
- **커밋은 한 번에 하나.** `git add` → `git commit`이 두 단계라 원자적이지 않다.
  둘이 동시에 하면 `index.lock`으로 실패하거나, 더 나쁘게 **A가 add한 직후
  B가 commit하면 A의 파일이 B의 커밋에 딸려 들어간다.** 실패는 보이지만 이건 조용히 섞인다.
  BUILDER가 순서를 잡는다. 한쪽이 `idle`이 된 뒤 다음을 보낸다.
- **공동 파일이 걸리면 병렬 금지.** `house-rules.yaml` `requirements.txt`
  계획서 `HANDOFF.md`. 작업 순서 1번이 이미 "한 번에 한 쪽만"이다.

### 3.4 파일 반환 경로 (확정 2026-08-29)

만든 장표가 사용자에게 닿는 길은 셋이다. 목적이 다르므로 섞어 쓰지 않는다.

| 경로 | 무엇 | 언제 |
|---|---|---|
| **BUILDER가 직접 보냄** | 대화창에 파일 카드로 올린다 | 중간 확인. "지금까지 만든 거 보여줘" |
| **구글 드라이브** | 잡 폴더가 `G:\내 드라이브\deck-qa-jobs\`에 있어 윈도우 PC가 동기화한다 | 실제 잡의 **정본** |
| **슬랙** | 봇이 FINAL을 스레드에 올린다 (6단계) | 결정 버튼과 함께 오는 **최종본** |

- 1번은 보내는 것이지 두는 것이 아니다. **정본은 언제나 잡 폴더다.**
  중간 확인용으로 보낸 파일을 최종본으로 착각하면 어느 것이 맞는지 알 수 없게 된다.
  보낼 때 어느 버전인지(`deck_v1` / `deck_v2` / `FINAL`) 함께 말한다.
- 2번은 파일을 옮기는 게 아니라 원래 거기 있는 것이다. 윈도우 PC 앞이면 이게 제일 빠르다.
- 3번만 결정 버튼이 붙는다. 게이트를 여는 사용자 결정은 여기서만 나온다 (6단계 완료 조건).
  1번으로 받은 파일에 "좋다"고 답해도 `user_decision.json`에 적히지 않는다.

2026-08-29 확인: 맥북에서 만든 pptx를 폰·PC 어느 쪽 대화창에서도 받을 수 있다.

### 3.1 셋이 체크아웃 하나를 공유한다 (확정 2026-08-29)

worktree를 나누지 않는다. 셋이 `/Users/shin/Desktop/agent` 한 폴더를 같이 쓴다.
설정이 늘지 않는 대신 다음 두 가지를 지켜야 서로의 작업이 섞이지 않는다.

- **커밋은 자기 담당 파일만 이름으로 지정해서 한다.** `git add .`, `git commit -a`를 쓰지 않는다.
  워킹트리에는 항상 다른 둘의 미커밋 작업이 같이 있다.
- **브랜치를 바꾸지 않는다.** 체크아웃이 하나라 `git switch`가 나머지 둘의 HEAD도 같이 옮긴다.
  기본은 `main`이고, 다른 브랜치가 필요하면 사용자에게 알리고 셋이 함께 옮긴다.
- **커밋 전에 `python e2e_check.py`를 돌린다.** 잡 한 바퀴를 실제로 돌려 이음매를 본다.
  `fixtures/`는 pptx 한 장을 audit.py에 물리는 검사이고, 이건 그 위의 생성기↔검사기↔오케스트레이터다.
  지금까지 나온 통합 버그 넷(manifest valign 기본값, 칩 캔버스 이탈, 게이트 오배선,
  숫자 토큰 오탐)은 **전부 이 경로에서만 보였다.** 실적 수치를 쓰지 않고 임시 폴더에서만 돈다.

### 3.2 PIPE 세션 규칙

**PIPE는 opencode다** (확인 2026-08-29). `orchestrator.py`와 `slack_bot.py`를 맡는다.
2026-08-29에 BUILDER에서 넘겼다.

opencode와 Codex CLI가 **둘 다 `AGENTS.md`를 읽는다.** 그래서 그 파일 머리에
"너는 누구인가" 표를 뒀다. opencode는 자기를 PIPE로 판별하고 Codex 담당 파일을 건드리지 않는다.

- **세션을 시작하면 `HANDOFF.md`에서 자기 앞 미완 항목을 먼저 처리한다.**
  처리하면 `[x]`로 바꾸고 커밋 해시를 적는다. `TO:USER` 항목은 건드리지 않는다.

- `template.js`, `deck.js`, `audit.py`, `render_check.py`, `fixtures/`를 건드리지 않는다.
- `house-rules.yaml`은 공동 파일이다. 고치면 나머지 둘에게 알린다. 한 번에 한 쪽만 고친다.
- 규칙 값을 코드에 두지 않는다. 판정 기준이 필요하면 `house-rules.yaml`에서 읽는다.
- 배관은 판정하지 않는다. 게이트 판정은 검사기가 낸 **결과 파일**로 하고
  exit code로 하지 않는다 (2.16-5). 합성 점수를 만들지 않는다.
- 7절 상한을 지킨다. `orchestrator.py`가 검사기 전체(`audit.py` + `render_check.py`)보다
  커지면 멈추고 프레임워크 도입을 사용자와 상의한다 (7절 상한 재설정 참조).
- manifest.json 형식이 2026-08-29에 바뀌었다 (6.2). 항목에 `placements` 배열이 생겼고
  파일 머리에 `schema_version`·`house_rule_version`·`template_version`이 박힌다.
  현재 `orchestrator.py`는 경로만 들고 있고 내용을 파싱하지 않아 영향이 없다.
  게이트가 manifest를 읽게 되면 이 형식을 본다.

---

## 4. 실행 환경

회사 PC는 설치도 슬랙도 막혀 있어 파이프라인에서 제외한다.
모든 실행은 집 Windows PC에서 이뤄진다.

```
집 PC (Windows)
  Git for Windows  →  Claude Code (네이티브, WSL 아님)  →  Node 18+  →  Python 3.11+
  pip: python-pptx, openpyxl, pyyaml, pywin32, slack_bolt, pydantic
  npm: pptxgenjs, js-yaml   (js-yaml은 template.js가 house-rules.yaml을 읽는 데 쓴다.
                             audit.py의 pyyaml과 대칭)

폰
  개인 슬랙 워크스페이스, #deck-review 채널
```

WSL을 쓰지 않는 이유는 pywin32로 PowerPoint COM을 잡을 수 없기 때문이다.
경로가 `/mnt/c/...`와 `C:\...`로 갈라지면서 잡 폴더 참조도 어긋난다.

리포를 구글 드라이브 등 동기화 폴더 안에 두지 않는다.
`.git`은 수백 개의 작은 파일을 계속 고쳐 쓰는데 동기화 클라이언트가 인덱스나 오브젝트를 깨뜨린다.

### 4.1 착수 전 확인 (사용자)

- [ ] 집 PC에 PowerPoint가 설치돼 있는가
- [ ] 집 PC에 HY헤드라인M이 설치돼 있는가 (한컴오피스가 있으면 대개 함께 설치됨)
- [ ] 회사 PC에서 폰으로 파일을 옮기는 경로가 무엇인가

HY헤드라인M이 없으면 제목 계열의 넘침 검사만 제외한다.
맑은 고딕은 Windows 기본이라 표와 본문 검사는 그대로 된다.

---

## 5. 폴더 구조

```
C:\dev\deck-qa\                    git 리포. 실적 수치 없음
  DEVELOPMENT_PLAN.md              이 문서
  CLAUDE.md                        세션 규칙 (Claude Code)
  AGENTS.md                        세션 규칙 (Codex CLI)
  house-rules.yaml                 규칙 단일 원천
  schemas/
    manifest.py                    manifest.json 형식 판정
    issue.py                       issue_register.json
    decision.py                    user_decision.json
    metadata.py                    run_metadata.json + 재현성 격차
    editor.py                      EDITOR 응답 (6.3)
  prompts/
    EDITOR.md                      8단계 프롬프트. 버전을 run_metadata에 기록한다
  audit.py                         정적 검사
  render_check.py                  PowerPoint COM 검사
  lint_deck.js                     raw 호출 검출
  template.js                      생성 헬퍼 (원본. 스킬 폴더는 배포본)
  deck.js                          장표 골격. 잡마다 builder/deck_v1.js로 복사해 채운다
  orchestrator.py
  slack_bot.py
  fixtures/
    golden_deck.js
    make_fixtures.py
    expected_results.json
  skill/                           .skill 패키징 소스
  .gitignore                       jobs/ 제외

G:\내 드라이브\deck-qa-jobs\job_20260828_001\   git 밖. 실적 수치 있음 (구글 드라이브)
  source/     source.xlsx  brief.md
  builder/    deck_v1.js  deck_v1.pptx  deck_v1.pdf  out/p*.png  manifest.json
  review/     editor_r1.json  audit_r1.json  issue_register.json  user_decision.json
  revision/   deck_v2.js  deck_v2.pptx
  final/      deck_FINAL.pptx  QA_REPORT.md  CHANGELOG.md
  run_metadata.json
```

---

## 6. 데이터 규격

### 6.1 house-rules.yaml

기존 스킬의 `design-system.md`와 `qa-checklist.md`에 흩어져 있는 수치를 한 장으로 모은다.
담을 항목은 최소 다음과 같다. 아래는 골격 예시이고, **확정 값은 리포의 `house-rules.yaml`이다.**

```yaml
fonts:
  heading: HY헤드라인M        # 페이지 제목, 요약 배너
  body: 맑은 고딕              # 본문, 표, 차트 라벨, 각주
  allowed_count: 2             # 셋째 글꼴 금지

sizes:
  body_min_pt: 10
  table_body_min_pt: 8.5       # 스킬 문서 실측: 표 본문 8.5~9.5pt
  footnote_pt: 8
  chart_label_pt: 7.5          # 축·평균선 라벨. 값 라벨은 8.5

table:
  default_align: center
  long_text_col_align: left
  header_align: center         # 긴 서술문 열이어도 헤더는 중앙
  row_height_min: 0.33

notation:
  negative: "-"                # △ 금지
  unit_label: "[단위: 억원]"    # 괄호 표기 금지

zones:
  title_right_clear: true      # 제목 우상단 비움
  footnote_bottom_y: 7.70      # 바닥 기준, 줄수에 따라 자동
  content_max_y: 7.78

limits:
  parallel_items_max: 3
  diagrams_per_page_max: 3

forbidden:
  - marker_on_conclusion_line  # ⇒ 결론 줄 앞 ▸
  # 원형 배지(지름 0.34in + 글리프)는 금지가 아니라 표준이다. 확정 2026-08-28
```

### 6.2 manifest

```json
{
  "slide": 12,
  "shape_id": "FY26_NIBT",
  "kind": "numeric",
  "display": { "text": "8,412", "unit": "억원", "rounding": 0 },
  "source": {
    "file": "source.xlsx",
    "file_hash": "sha256:...",
    "sheet": "실적",
    "ref": "G22"
  },
  "transform": { "type": "identity" }
}
```

transform 예시:

```json
{ "type": "sum",   "range": "G22:G28" }
{ "type": "cagr",  "start": "G22", "end": "K22", "periods": 4 }
{ "type": "ratio", "numerator": "G22", "denominator": "G30" }
```

override가 붙은 경우:

```json
{
  "override": {
    "value": "8,500",
    "reason": "이사회 승인 조정 후 수치",
    "author": "shin",
    "at": "2026-08-29T10:00:00+09:00"
  }
}
```

구현 2026-08-29 (2.16-8). 네 필드가 다 있어야 한다.
`value`+`reason`만으로는 "출처가 진짜 구버전"인지 "숨김 수정"인지 가릴 수 없다.
필수 필드는 `house-rules.yaml`의 `manifest.override_fields`에 있고 생성기와 검사기가 같이 읽는다.
`at`은 **조정을 결정한 시각**이며 호출부가 적는다. 타임존이 없으면 생성 단계에서 막힌다.
빌드 시각을 자동으로 넣지 않는 이유는 manifest가 비결정적이 되어 회귀 비교가 깨지기 때문이다.
override가 붙은 항목은 원천과 달라도 FAIL이 아니라 `changes`에 기록된다.

방출 헬퍼는 `template.js`에 넣는다.

```js
const v = claim(8412, {
  type: 'numeric',
  src: 'source.xlsx', sheet: '실적', ref: 'G22',
  unit: '억원', id: 'FY26_NIBT'
});
```

구현 2026-08-29. `claim()`은 **찍을 문자열을 돌려준다**(위 예에서 `"8,412"`).
호출부는 그 문자열을 그대로 장표에 그린다. 값을 따로 포맷하면 manifest와 장표가 갈라진다.
`slide` 번호는 손으로 적지 않는다. `newPres()`가 `addSlide()`를 가로채 세고,
`claim()`이 그 번호를 받는다. 그래서 값은 슬라이드가 열린 뒤에 만들어야 한다.

방출 파일은 claim 배열을 감싼 형태다. 타임스탬프를 넣지 않는다 —
같은 입력이면 같은 파일이어야 픽스처 회귀 비교가 성립한다. 실행 정보는 `run_metadata.json`이 담는다.

```json
{ "house_rule_version": "2026.08", "claims": [ { ...위 형식... } ] }
```

transform 어휘와 필수 인자는 `house-rules.yaml`의 `manifest.transforms`에 둔다.
`template.js`가 이 목록으로 호출을 막고 `audit.py`가 같은 목록으로 재계산한다 (2.14와 같은 이유).
생성 단계에서 막는 것(계획서 2.1): 어휘 밖 transform, 필수 인자 누락, 근거 없는 값,
사유 없는 override, △ 표기, **같은 id를 다른 값으로 등록**(게이트 XREF를 생성 시점에 앞당김).

확정 2026-08-29. 2.5가 예시하지 않았던 두 가지를 정했다.

- `unverified`는 transform의 **여섯 번째 type**이다. 별도 필드로 두지 않는다.
  필수 인자는 `note` 하나이고, 사람이 근거를 한 줄 적는다. 값 하나에 필드 한 벌만 붙는다.
- `delta`의 필수 인자는 `from`, `to` 두 셀이다. cagr의 `start`/`end`와 같은 꼴이다.

구현 2026-08-29 (2.16-1·3·6). manifest 항목에 **근거 좌표**를 붙였다.
`display.text`만으로는 XML의 어느 도형인지 특정할 수 없어 3자 대조가 성립하지 않았다.

```json
{
  "slide": 1,
  "shape_id": "FY26_NIBT",
  "kind": "numeric",
  "placements": [
    {
      "slide": 1, "type": "shape", "name": "FY26_NIBT", "text": "8,412",
      "bounds": { "x": 6.05, "y": 3.20, "w": 1.40, "h": 0.35 },
      "font": { "face": "맑은 고딕", "size": 10, "bold": false },
      "align": "center", "valign": "middle"
    }
  ],
  "display": { "text": "8,412", "unit": "억원", "rounding": 0 }
}
```

- `placements`는 **배열**이다. 같은 지표가 여러 장에 찍히면 항목은 하나, 좌표가 여럿이다.
  비어 있으면 검사기가 대조할 도형이 없다는 뜻이므로 `deck.js`가 pptx를 만들지 않고 죽는다 (2.16-7).
- `type: "shape"` — `name`이 pptx XML의 도형 name과 같다. `bounds`는 inch, 자릿수는
  `units.bounds_round_in`. `text`는 그 도형에 실제로 찍힌 전체 문자열이라
  `display.text`와 다를 수 있다(라벨을 앞에 붙인 경우: `"평균 10.0"`).
- `type: "cell"` — 표는 도형 하나라 셀마다 이름을 줄 수 없다.
  `{ "type": "cell", "table": "table/perf", "row": 1, "col": 4, "text": "+0.0" }`처럼
  표 이름 + (행, 열)로 참조한다.

도형 이름 규약은 `house-rules.yaml`의 `manifest.shape_name`에 있다.
값 도형은 `shape_id` 그대로, 구조 도형은 `헬퍼/역할`(예: `banner/text`, `col_chart/bar`).
한 슬라이드에서 이름이 겹치면 `#2`가 붙는다. `template.js`의 헬퍼는 `s.addShape`/`s.addText`를
직접 부르지 않고 이름을 붙이는 통로만 쓴다 — 이름 없는 도형을 만들 수 없게 막은 것이다.

방출 파일에는 버전 세 개가 함께 박힌다 (2.16-6).

```json
{
  "schema_version": 1,
  "house_rule_version": "2026.08",
  "template_version": "2026.08.29",
  "token_whitelist": [
    { "slide": 1, "token": "-100", "reason": "브리프 원문 인용. 산출값 아님" }
  ],
  "claims": [ { "...": "위 형식" } ]
}
```

### 6.3 issue

```
ID        E-017            (E=Editor, A=Audit)
SLIDE     6
TYPE      MESSAGE | LOGIC | DENSITY | STRUCTURE | UNSOURCED
          | SOURCE | CALC | LAYOUT | HOUSE_RULE
SEVERITY  CRITICAL | MAJOR | MINOR
ACTION    AUTO_FIX | USER_DECISION | REVIEW_ONLY
FINDING   사례 나열만 있고 당사 전략상 함의가 없음
EVIDENCE  p6 본문 4행, 결론 행 부재
PROPOSAL  제목을 결론형으로, 우측에 시사점 열 추가
```

audit이 내는 결정적 검사 결과:

```
ID       A-018
SLIDE    9
TYPE     SOURCE
CHECK    manifest[FY26_NIBT] vs 실적!G22 vs pptx
DECK     8,421
SOURCE   8,412
RESULT   FAIL
ACTION   AUTO_FIX
```

EDITOR는 자유 서술로 답하지 않는다. pydantic 모델로 검증하고,
실패하면 한 번 재시도하고 또 실패하면 원문을 로그에 남기고 그 이슈만 버린다.

### 6.4 run_metadata.json

```json
{
  "job_id": "job_20260828_001",
  "audit_version": "1.0.0",
  "audit_git_commit": "f84ab31",
  "house_rule_version": "2026.08",
  "template_version": "...",
  "editor_prompt_version": "1.0",
  "source_hashes": { "source.xlsx": "sha256:..." },
  "stage": "awaiting_user_decision"
}
```

이 파일이 있는 이유는 **재현성**이다. 어떤 규칙·생성기·검사기·프롬프트로 만든 결과인지
남아야 나중에 "왜 그때는 통과했나"를 답할 수 있다.
`schemas/metadata.py`의 `missing_for_reproducibility()`가 빠진 필드를 이름으로 돌려준다.
버전 필드를 필수로 걸지는 않았다 — 지금 orchestrator가 채우지 않아 전부 FAIL이 되면
판정이 무의미해진다. 격차를 보이게 두고 채우는 것은 orchestrator 쪽 일이다.

과거 잡을 새 audit 버전으로 다시 돌리는 기능은 기본값으로 두지 않는다.
규칙이 늘어날수록 과거 통과분이 무더기로 FAIL로 뒤집힌다.
회귀 확인은 fixtures에서 한다.

---

## 7. 워크플로

```
사용자 (폰 슬랙)
   │ source.xlsx + brief.md 업로드 → 스레드 하나 = 잡 하나
   ▼
BUILDER  deck_v1.js → pptx + pdf + png + manifest.json
   │
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
audit.py       lint_deck.js   EDITOR (컨텍스트 격리)
정적 검사       raw 호출        논리·표현·구조
3자 대조
   │              │              │
   └──────────────┴──────────────┘
                  ▼
          issue_register.json
                  ▼
          RULE-BASED ROUTER
           ╱        │        ╲
     AUTO_FIX  USER_DECISION  REVIEW_ONLY
        │           │              │
        │      폰 슬랙 버튼         기록만
        │           │              │
        └─────┬─────┘              │
              ▼                    │
          BUILDER 수정 → deck_v2   │
              ▼                    │
          GATE 1 재검사            │
              ▼                    │
          GATE 2 렌더 검사 (1회)   │
              ▼                    │
          FINAL + QA_REPORT ───────┘
              ▼
          폰 슬랙
```

v2 재검토는 R1에서 지적된 항목에 한정한다. 열어 두면 새 지적이 무한히 나온다.

---

## 8. Quality Gate

```
[BLOCKING]
 STRUCT   pptx가 파일로서 멀쩡한가 — XML 파싱, 관계 Id, 도형 ID 중복 (preflight.py. 2.18)
          여기서 깨지면 아래를 판정할 대상이 없다. 순서상 가장 앞이다
 SOURCE   manifest 전 항목이 source와 pptx 양쪽에 일치 (override 제외)
 CALC     sum, ratio, delta, cagr 재계산 일치
 XREF     페이지 간 동일 지표 값 일치
 TOKEN    등록되지 않은 숫자 토큰 0 (화이트리스트 제외)
 LAYOUT   overflow 0, overlap 0, 캔버스 이탈 0
 HOUSE    폰트 2종, 음수 부호, 표 정렬, 각주 좌표, 본문 하한 pt
 LINT     헬퍼 우회 raw 호출 0 (사유 명시 예외, 그리고 objectName을 붙여
          audit이 볼 수 있게 만든 도형은 제외. 2026-09-04 배선)
 ISSUE    CRITICAL 0, MAJOR 0 또는 사용자 기각 처리 완료

[NON-BLOCKING]
 MINOR 잔여 건수만 기록하고 통과
```

사용자가 받는 것은 FINAL 파일, 이 게이트 표, 채택·기각 내역 한 장이다.

---

## 9. 단계별 구축 계획

각 단계는 완료 조건을 만족해야 다음으로 넘어간다.

### 1단계 house-rules.yaml

기존 스킬의 `design-system.md`, `qa-checklist.md`에서 수치를 옮긴다.
`template.js`가 이 파일을 읽도록 고친다.

완료 조건: 두 문서에 적힌 수치 중 YAML에 안 들어간 것이 없다.
`template.js`에 하드코딩된 규칙 값이 남아 있지 않다.

완료 2026-08-28. 구판과 신판에 같은 호출을 넣어 pptxgenjs 호출 70건을 대조했고,
의도한 변경(스탯카드 라벨 9.5 -> 10) 외 차이 0건을 확인했다.

### 2단계 fixtures

정상 덱 하나에 결함을 하나씩 주입하는 스크립트로 만든다.
손으로 30장 만들지 않는다. 규칙이 늘 때 픽스처도 같이 늘어야 한다.

```
make_fixtures.py   golden_deck.js + defect_id → 결함 덱 + expected_results.json
```

첫 세트 여덟 개. 전부 실제로 반복해서 지적했던 항목이다.

```
01  폰트 3종 혼입
02  음수 △ 표기
03  표 헤더 좌측정렬
04  각주 좌표 초과
05  텍스트 넘침
06  원천 숫자 불일치
07  페이지 간 동일 지표 불일치
08  제목 우상단 표기
```

완료 조건: `expected_results.json`에 여덟 건의 정답이 적혀 있다.

### 3단계 audit.py static

Codex 담당. 2단계 픽스처를 전부 통과할 때까지 만든다.
결함 05(넘침)는 정적 검사로 근사만 하고, 정확 판정은 5단계로 미룬다.

완료 조건: `python audit.py fixtures/` 실행 시 expected와 일치.

### 4단계 manifest + pydantic

`template.js`에 `claim()` 헬퍼를 넣고 manifest를 방출한다.
`schemas/`에 pydantic 모델을 정의한다.
audit.py에 3자 대조와 토큰 검출을 추가한다.

완료 조건: 결함 06, 07이 3자 대조로 잡힌다. override 경로가 동작한다.

완료 2026-08-29. override는 잡 하나로 확인했다 — 원천 `0.0`과 장표 `9.9`가 다른데
FAIL이 아니라 `changes`에 사유·작성자·시각과 함께 기록됐다 (2.8).

`schemas/manifest.py`는 형식 판정만 한다. 원천 재계산과 XML 좌표 대조는 audit.py 몫이다.
구조는 pydantic 모델로, 어휘(transform·kind·override 필드·화이트리스트 필드)는
house-rules.yaml에서 읽는다. 어휘를 모델에 박으면 규칙이 두 벌이 된다 (2.14).
모르는 키는 막는다 — 오타 난 필드가 조용히 무시되면 검사기가 기본값을 읽고 통과시킨다.
audit.py와 orchestrator.py가 각자 손으로 하던 형식 검사를 여기로 모으면 검증이 한 벌이 된다.

### 5단계 render_check.py

pywin32로 PowerPoint를 열고 텍스트 프레임 실측 경계를 조회해 초과분을 리스트로 뱉는다.
작게 유지한다. 넘침과 줄바꿈만 본다.

완료 조건: 결함 05가 잡힌다. 집 PC에서 실행된다.

### 6단계 slack_bot.py

Socket Mode. `files:read` 스코프로 파일을 받고, `thread_ts`를 잡 ID에 매핑한다.

```
#deck-review
  [source.xlsx 업로드]      새 스레드 = job 생성
  └ [brief.md 업로드]        같은 잡에 추가
  └ "시작"                   실행
  └ 봇: 결과 + 결정 버튼
  └ 사용자: 버튼
  └ 봇: FINAL
```

봇 시작 시 마지막 처리 시각 이후 채널 메시지를 `conversations.history`로 훑어
놓친 파일을 회수한다. 집 PC가 꺼져 있는 동안 올라온 파일이 유실되지 않게 한다.
전원 설정에서 절전을 끄고 화면만 꺼지게 둔다.
작업 스케줄러에 로그온 시 실행으로 걸어 둔다.

완료 조건: 폰에서 파일을 올리고 버튼을 눌러 결정이 `user_decision.json`에 적재된다.

### 7단계 orchestrator.py

라우터, 게이트 판정, 에이전트 호출 래퍼.
~~400줄을 넘어가면~~ 멈추고 프레임워크 도입을 사용자와 상의한다. (아래 상한 재설정 참조)

완료 조건: 잡 하나가 업로드부터 FINAL까지 자동으로 돈다.

**상한 재설정 — 확정 2026-08-29. 프레임워크는 도입하지 않는다.**

400줄 상한이 실제로 걸렸다(554줄). 멈춰서 봤고, 그게 상한을 둔 목적이다.
본 결과는 이렇다.

- 실코드 434줄. 함수 24개, 가장 큰 것이 `cmd_review` 69줄이고 대부분 20~45줄이다.
- 명령 하나당 함수 하나. 스케줄러, 재시도 루프, DAG, 프로세스 밖 상태가 **없다**.
  상태는 전부 디스크다 (2.13).

프레임워크가 파는 것은 스케줄링·재시도·분산 상태·DAG인데 이 설계는 그 넷을 의도적으로
거부한다. 지금 도입하면 코드가 줄지 않고 **늘어난다.** 복잡도가 구조적이 아니라 선형이다.

그래서 숫자는 올리되 감시를 없애지 않는다. **재는 대상을 바꾼다.**

> `orchestrator.py`가 **검사기 전체**(`audit.py` + `render_check.py`)보다 커지면
> 멈추고 프레임워크 도입을 사용자와 상의한다.

11절 첫 줄이 경계한 것은 파일 길이가 아니라 "검사 규칙이 없는 상태에서 배관만 남는" 것이다.
배관이 본체를 넘어서는 순간이 그 신호다. 줄수는 그 대리 지표였고, 400은 오케스트레이터가
무엇을 할지 모르던 시점에 정한 값이다.

#### 자를 `audit.py` 하나에서 검사기 둘로 바꿨다 (2026-08-30, 사용자 확정)

STRUCT 게이트를 붙이자 `orchestrator.py`가 732줄이 되어 `audit.py` 732줄과 **정확히 같아졌다.**
PIPE가 한도를 맞추려고 STRUCT 블록을 압축했다. 거기서 규칙이 잘못 작동하는 것이 보였다 —
**한도 때문에 코드를 줄이는 것은 이 규칙이 의도한 방향이 아니다.**

배관이 부푼 것이 아니었다. STRUCT라는 실제 판정이 늘었고, 자를 대는 쪽이 마침 안 자란 것이다.
`audit.py` 한 파일만 자로 쓴 것은 그 시점에 `render_check.py`가 없었기 때문이고,
지금은 검사가 두 파일에 나뉘어 있다. 재려던 것이 "배관이 검사보다 커지지 않았나"라면
자도 검사기 전체여야 한다.

숫자를 올린 것이 아니라 **원래 재려던 것을 제대로 재는 것이다.** 지금 731 < 1011.

### 8단계 EDITOR 프롬프트

컨텍스트 격리 규칙, 담당 영역, 출력 스키마, 지적 개수 상한을 담는다.
상한은 CRITICAL 3건, MAJOR 5건. 상한이 없으면 사소한 지적이 수십 개 나온다.

완료 조건: 실제 잡 하나를 끝까지 돌려 보고 사용자가 쓸 만하다고 판단한다.

작성 2026-08-29. `prompts/EDITOR.md`가 프롬프트, `schemas/editor.py`가 응답 검증이다.
**완료 조건은 사용자 판단이라 아직 안 채워졌다.** 실제 잡을 돌려 봐야 한다.

어휘는 `house-rules.yaml`의 `issues` 절에 뒀다. 프롬프트·검증기·라우터가 같은 목록을 본다.
EDITOR가 낼 수 있는 `type`을 다섯 개로 좁힌 것이 핵심이다(`editor_types`).
`SOURCE` `CALC` `LAYOUT` `HOUSE_RULE`은 audit.py가 결정적으로 판정하는 영역이라(2.10)
EDITOR가 같은 것을 지적하면 중복이거나 틀린다. 어휘로 막았다.

검증은 전부 아니면 전무가 아니다. 6.3이 "그 이슈만 버린다"고 했으므로
`validate()`가 (통과, 버림+사유)를 나눠 돌려준다. 재시도 1회와 원문 로그는
orchestrator 몫이다. 개수 상한을 넘긴 응답은 조용히 자르지 않고 반려로 표시한다 —
잘라내면 사용자가 못 본 지적이 생긴다.

### 보류

- masked 빌드 모드 (회사 PC에서 실행할 수 없게 되어 실익이 사라짐)
- 폰트 메트릭 추출 (HY헤드라인M이 집 PC에 없을 때만 필요)
- 오케스트레이션 프레임워크 도입

---

## 10. 미결사항

- 회사 PC에서 폰으로 파일을 옮기는 경로. 사내 반출 규정 확인 필요.
- 집 PC PowerPoint 설치 여부, HY헤드라인M 설치 여부.
- 상시 가동 기계가 필요해지는 시점. 필요해지면 소형 Windows PC를 검토한다.
  맥미니는 폰트와 COM 문제로 이 용도에 맞지 않는다.


- `skill/` 아래 스킬 원본을 커밋할지. `assets/`에 pptx가 있어 `.gitignore`의
  `*.pptx`에 걸린다. 스킬이 구버전으로 되돌아가는 것을 막는 게 2.15의 목적이었으므로
  커밋하는 쪽이 그 목적에 맞는다. 용량은 1.3MB다.

### 해소된 미결

- **lint_deck.js 보류 → 해소 (2026-09-04).** 만들어 배선했다. 계기는 게이트 표가
  실제보다 넓어 보인 것이다 — 아홉 칸 중 LINT가 "미구현"으로 영구 SKIP이었다.
  검사 대상은 `deck_v{n}.js`, 규칙은 `house-rules.yaml`의 `lint` 절.
  **`objectName`을 붙인 raw 호출은 통과시킨다** — audit이 그 도형을 보므로 우회가
  아니다. 막는 것은 이름 없는 도형이다. 잡 003~006 넷 다 통과한다.
  회귀는 `e2e_check.py` [8.5]. 이로써 `GATES_NOT_WIRED`가 비었다.

- **`preflight.py`와 `audit.py`의 관계 — 확정 2026-08-29. 흡수하지 않는다.**
  전수 비교해 보니 둘은 층이 다르다. preflight는 파일 구조(XML·관계·도형 ID),
  audit은 하우스 규칙이다. 겹치는 것은 허용 글꼴과 표 열 너비 합 둘뿐이고
  지금은 같은 판정을 낸다. 자세한 내용은 2.18에 적었다.

- **숫자 토큰 화이트리스트(2.6)의 정의 위치 — 확정 2026-08-29. 두 층으로 나눈다.**
  어느 잡에나 나오는 예외는 `house-rules.yaml`의 `numeric_tokens.global_text_whitelist`에,
  그 잡에서만 통하는 예외는 manifest 머리의 `token_whitelist` 배열에 둔다.
  필수 필드는 `numeric_tokens.job_whitelist_fields`가 정한다 (`slide` `token` `reason`).
  **사유 없는 예외는 만들 수 없다.** `template.js`의 `whitelistToken()`이 생성 단계에서 막고,
  필드가 빠진 예외는 `audit.py`가 ERROR로 본다.
  오탐 몇 건 때문에 검사를 통째로 끄는 것을 막으려는 것이다 — 미결 항목이 경계하던 게 그거다.
  3방향으로 확인했다. 예외 없는 맨숫자는 FAIL, 사유를 붙이면 PASS, 사유를 빼면 빌드가 죽는다.

- **불릿 ▸ 마커 크기 — 확정 2026-08-29. 본문과 같은 10pt.**
  현행(본문 크기를 따라감)을 규칙으로 승격했다. design-system.md의 9pt는 이 값으로 대체한다.
  `sizes.bullet_marker_pt`를 10으로 올리고 `template.js`가 이 값을 읽는다.
  전에는 호출부가 넘긴 `fs`를 따라갔다. 이제 `fs`를 낮춰도 마커는 10pt로 고정이라
  검사기가 결정적으로 볼 수 있다.
  `bullet_marker_pt: 9`를 실제로 쓰던 곳은 `iconBadge`의 글리프 하나였다.
  `sizes.icon_badge_glyph_pt: 9`로 분리했다. 배지 렌더 결과는 그대로다.

---

## 11. 하지 말 것

- 오케스트레이션 프레임워크를 먼저 깔고 시작하기. 검사 규칙이 없는 상태에서 배관만 남는다.
- 문장 단위 사실성 스캔. 정밀도가 안 나온다.
- 합성 점수, confidence 소수점.
- 에이전트끼리 자유토론시키기. 사용자가 아는 맥락을 에이전트는 모른다.
- 리포를 동기화 폴더에 두기.
- 잡 폴더를 커밋하기.
- 규칙 값을 코드에 하드코딩하기. house-rules.yaml만 본다.
- 렌더 검사를 폰트가 없는 환경에서 돌리고 결과를 신뢰하기.
- 다른 에이전트 담당 파일 고치기. 셋이 체크아웃 하나를 공유한다 (3.1).
- `git add .` / `git commit -a` 로 워킹트리를 통째로 커밋하기. 남의 미커밋 작업이 끌려 들어간다.
