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

---

## 3. 참여자와 권한

| 이름 | 실행 위치 | 담당 | 제한 |
|---|---|---|---|
| Claude BUILDER | Claude Code, 리포 폴더 | 제작, 수정 반영, 미수용 사유 제시 | 자기 결과물 승인 불가 |
| Claude EDITOR | claude.ai 새 대화 | 메시지, 논리, 표현, 정보밀도, 구조 제안 | 제작 과정 미열람, 수정 직접 불가 |
| Codex | Codex CLI, 같은 리포 폴더 | audit.py 작성·유지, 계산형 claim의 원천 셀 매핑 | 표현·디자인 의견 금지 |
| audit.py | 로컬 | 결정적 판정 | |
| orchestrator.py | 로컬 | 진행, 라우팅, 게이트 판정 | AI 아님 |
| 사용자 | 폰 슬랙 | 구조 변경 승인, 최종 승인 | |

Claude Code와 Codex CLI가 같은 파일을 동시에 고치면 충돌한다. 담당 파일을 나눈다.

```
Codex        audit.py, render_check.py, fixtures/
Claude Code  template.js, deck.js, orchestrator.py, slack_bot.py
공동          house-rules.yaml (변경 시 상대에게 알림)
```

---

## 4. 실행 환경

회사 PC는 설치도 슬랙도 막혀 있어 파이프라인에서 제외한다.
모든 실행은 집 Windows PC에서 이뤄진다.

```
집 PC (Windows)
  Git for Windows  →  Claude Code (네이티브, WSL 아님)  →  Node 18+  →  Python 3.11+
  pip: python-pptx, openpyxl, pyyaml, pywin32, slack_bolt, pydantic

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
  CLAUDE.md                        세션 규칙
  house-rules.yaml                 규칙 단일 원천
  schemas/
    manifest.py                    pydantic 모델
    issue.py
    decision.py
    metadata.py
  audit.py                         정적 검사
  render_check.py                  PowerPoint COM 검사
  lint_deck.js                     raw 호출 검출
  template.js                      생성 헬퍼 (기존 스킬에서 이관)
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
담을 항목은 최소 다음과 같다. 실제 값은 스킬 파일에서 옮긴다.

```yaml
fonts:
  heading: HY헤드라인M        # 페이지 제목, 요약 배너
  body: 맑은 고딕              # 본문, 표, 차트 라벨, 각주
  allowed_count: 2             # 셋째 글꼴 금지

sizes:
  body_min_pt: 10
  table_body_min_pt: 11
  footnote_pt: 8
  chart_label_pt: 9

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
  - circle_icon_badge          # 원형 배지 + 문자 글리프
  - marker_on_conclusion_line  # ⇒ 결론 줄 앞 ▸
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
  "override": { "value": "8,500", "reason": "이사회 승인 조정 후 수치" }
}
```

방출 헬퍼는 `template.js`에 넣는다.

```js
const v = claim(8412, {
  type: 'numeric',
  src: 'source.xlsx', sheet: '실적', ref: 'G22',
  unit: '억원', id: 'FY26_NIBT'
});
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
