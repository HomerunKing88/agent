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
| PIPE | CLI, 같은 리포 폴더 | orchestrator.py, slack_bot.py 작성·유지 | 규칙 값 판단·표현 의견 금지 |
| audit.py | 로컬 | 결정적 판정 | |
| orchestrator.py | 로컬 | 진행, 라우팅, 게이트 판정 | AI 아님 |
| 사용자 | 폰 슬랙 | 구조 변경 승인, 최종 승인 | |

에이전트 셋이 같은 파일을 동시에 고치면 충돌한다. 담당 파일을 나눈다.

```
BUILDER (Claude Code)  template.js, deck.js
Codex                  audit.py, render_check.py, fixtures/
PIPE                   orchestrator.py, slack_bot.py
공동                    house-rules.yaml (변경 시 나머지 둘에게 알림)
```

브랜치 접두사로 누구의 작업인지 구분한다. BUILDER `claude/*`, Codex `codex/*`, PIPE `pipe/*`.

### 3.1 셋이 체크아웃 하나를 공유한다 (확정 2026-08-29)

worktree를 나누지 않는다. 셋이 `/Users/shin/Desktop/agent` 한 폴더를 같이 쓴다.
설정이 늘지 않는 대신 다음 두 가지를 지켜야 서로의 작업이 섞이지 않는다.

- **커밋은 자기 담당 파일만 이름으로 지정해서 한다.** `git add .`, `git commit -a`를 쓰지 않는다.
  워킹트리에는 항상 다른 둘의 미커밋 작업이 같이 있다.
- **브랜치를 함부로 바꾸지 않는다.** 체크아웃이 하나라 `git switch`가 나머지 둘의 HEAD도 같이 옮긴다.
  새 브랜치가 필요하면 사용자에게 알리고 만든다.

### 3.2 PIPE 세션 규칙

`orchestrator.py`와 `slack_bot.py`를 맡는다. 2026-08-29에 BUILDER에서 넘겼다.

- `template.js`, `deck.js`, `audit.py`, `render_check.py`, `fixtures/`를 건드리지 않는다.
- `house-rules.yaml`은 공동 파일이다. 고치면 나머지 둘에게 알린다. 한 번에 한 쪽만 고친다.
- 규칙 값을 코드에 두지 않는다. 판정 기준이 필요하면 `house-rules.yaml`에서 읽는다.
- 배관은 판정하지 않는다. 게이트 판정은 검사기가 낸 **결과 파일**로 하고
  exit code로 하지 않는다 (2.16-5). 합성 점수를 만들지 않는다.
- 7절 상한을 지킨다. `orchestrator.py`가 400줄을 넘으면 멈추고 프레임워크 도입을 사용자와 상의한다.
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
    manifest.py                    pydantic 모델
    issue.py
    decision.py
    metadata.py
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
 SOURCE   manifest 전 항목이 source와 pptx 양쪽에 일치 (override 제외)
 CALC     sum, ratio, delta, cagr 재계산 일치
 XREF     페이지 간 동일 지표 값 일치
 TOKEN    등록되지 않은 숫자 토큰 0 (화이트리스트 제외)
 LAYOUT   overflow 0, overlap 0, 캔버스 이탈 0
 HOUSE    폰트 2종, 음수 부호, 표 정렬, 각주 좌표, 본문 하한 pt
 LINT     헬퍼 우회 raw 호출 0 (사유 명시 예외 제외)
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
400줄을 넘어가면 멈추고 프레임워크 도입을 사용자와 상의한다.

완료 조건: 잡 하나가 업로드부터 FINAL까지 자동으로 돈다.

### 8단계 EDITOR 프롬프트

컨텍스트 격리 규칙, 담당 영역, 출력 스키마, 지적 개수 상한을 담는다.
상한은 CRITICAL 3건, MAJOR 5건. 상한이 없으면 사소한 지적이 수십 개 나온다.

완료 조건: 실제 잡 하나를 끝까지 돌려 보고 사용자가 쓸 만하다고 판단한다.

### 보류

- masked 빌드 모드 (회사 PC에서 실행할 수 없게 되어 실익이 사라짐)
- 폰트 메트릭 추출 (HY헤드라인M이 집 PC에 없을 때만 필요)
- 오케스트레이션 프레임워크 도입
- lint_deck.js (3~5단계 결과를 보고 필요성 판단)

---

## 10. 미결사항

- 회사 PC에서 폰으로 파일을 옮기는 경로. 사내 반출 규정 확인 필요.
- 집 PC PowerPoint 설치 여부, HY헤드라인M 설치 여부.
- 실적 수치가 개인 PC와 개인 슬랙, 개인 구글 드라이브에 남는 것에 대한 사내 규정 확인.
  지금도 클로드에 자료를 올려 장표를 만들고 있으나, 회사가 승인한 서비스에 처리를 맡기는 것과
  개인 소유 기기에 자료가 남는 것은 규정상 다르게 취급될 수 있다.
  정례화 전에 준법감시 확인이 필요하다.
- 상시 가동 기계가 필요해지는 시점. 필요해지면 소형 Windows PC를 검토한다.
  맥미니는 폰트와 COM 문제로 이 용도에 맞지 않는다.
- lint_deck.js(2.1의 핵심 도구)의 보류 유지 여부. 8절 gate `LINT`는 이미 존재하므로
  3~5단계 후 재판단하되, 최소한 픽스처에는 raw 호출 예시를 남겨 둔다.

### 해소된 미결

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
