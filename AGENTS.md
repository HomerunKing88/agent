# AGENTS.md — Codex CLI 세션 규칙

## 세션 시작
- 작업 전 `DEVELOPMENT_PLAN.md`를 먼저 읽는다. 설계 배경과 확정 사항이 거기 있다.
- 계획서의 확정 사항을 바꾸려면 근거를 제시하고 사용자 확인을 받는다.
  문서와 코드가 어긋나면 문서를 고친다. 코드가 문서보다 앞서 나가지 않는다.

## 담당 파일 (에이전트 셋. 계획서 3절)
- Codex 담당: `audit.py`, `render_check.py`, `fixtures/`
- BUILDER(Claude Code) 담당: `template.js`, `deck.js`, `schemas/`, `prompts/` — 건드리지 않는다.
- PIPE 담당: `orchestrator.py`, `slack_bot.py` — 건드리지 않는다. 2026-08-29 신설.
- 공동: `house-rules.yaml`, `requirements.txt` (변경 시 나머지 둘에게 알림. 한 번에 한 쪽만 고친다)
- 브랜치는 `codex/*`를 쓴다. BUILDER는 `claude/*`, PIPE는 `pipe/*`.

## 체크아웃을 셋이 공유한다 (계획서 3.1)
- **커밋은 자기 담당 파일만 이름으로 지정한다.** `git add .` / `git commit -a` 금지.
- **브랜치를 함부로 바꾸지 않는다.** `git switch`가 나머지 둘의 HEAD도 같이 옮긴다.

## 작업 순서 (충돌 방지. 세 에이전트 공통)
공동 파일·교차 계약에 걸린 작업은 아래 순서를 지킨다. 담당 파일(자기 것)끼리는 어떤 순서로 해도 충돌하지 않는다.

1. **공동 파일은 한 번에 한 쪽만**: `house-rules.yaml`, `requirements.txt`, `AGENTS.md`, `CLAUDE.md`,
   `DEVELOPMENT_PLAN.md`. 고치는 쪽이 커밋까지 끝낸 뒤 다음 쪽이 시작한다.
2. **규칙 값(house-rules.yaml)이 먼저**: 값이 없는 상태로 검사기·생성기가 값(또는 `issues` 어휘 같은 구조)을
   코드에 박으면 두 갈래 검사가 갈라진다. YAML 쪽 수정 → 커밋 → 뒤에 읽는 쪽.
3. **호출 계약은 소유자만 바꾼다**:
   - `orchestrator.py` → `audit.py` CLI(`--json`, `--manifest`, `--source-root`)는 Codex 소유.
   - `orchestrator.py` → `schemas/editor.py` `validate()`는 BUILDER 소유.
   - 이들을 읽는 PIPE는 호출 계약을 지키고, 계약이 깨지면 소유자에게 먼저 알린다.
4. **교차 작업은 알림 후**: 자기 담당 파일이 어때서 다른 쪽 담당을 건드려야 하면
   문서에 전달사항을 남기고 커밋한다. 파일 자체를 고치지 않는다.

## 규칙 값
- 폰트, 각주 y좌표, 최소 pt, 표 정렬, 금지 영역 등 모든 규칙 값은 `house-rules.yaml`에서만 읽는다.
  `audit.py`에 하드코딩하지 않는다. pyyaml로 읽는다 (`template.js`는 js-yaml로 같은 파일을 읽는다).
- 검사에 바로 쓰이는 절: `fonts`(2종 검사) `sizes`(최소 pt) `table`(정렬·행높이)
  `zones`(각주 y, content_max_y) `notation`(음수 부호) `forbidden` `qa`(렌더 임계값)

## 역할 경계 (계획서 2.2)
- Codex는 검사 대상이 아니라 검사기 저자다. 표현·디자인 의견은 내지 않는다.
- 결정적 판정만 한다. PASS/FAIL이고, 합성 점수나 confidence 소수점은 쓰지 않는다.

## 현재 상태 (2026-08-29 갱신)
- **1단계 완료.** `house-rules.yaml`이 규칙 단일 원천. 하드코딩 잔존 0건.
- **2단계 완료.** 픽스처가 8개에서 **13개**로 늘었다. golden 포함 14개 파일.
  06·07·09는 manifest와 source.xlsx를 함께 주입한다.
- **3단계 완료.** `audit.py` static 검사.
- **4단계 완료.** 생성기 쪽(`claim()`, 계약 1·3·4·6)과 검사기 쪽(3자 대조, 토큰 검출) 둘 다.
  06·07이 `static_expected: DEFERRED`에서 `FAIL`로 바뀐 게 그 증거다.
  override 경로도 실제 잡으로 확인했다 (아래 4차 알림 절). 남은 것은 `schemas/` pydantic 하나.
- **5단계 작성 완료, 검증 대기.** `render_check.py`가 있다. 맥에서는 SKIP이 정상이다.
  집 Windows PC에서 결함 05가 FAIL로 잡혀야 완료 조건을 채운다.
- **6·7단계 작성 완료.** PIPE가 `orchestrator.py`, `slack_bot.py`를 썼다.
  잡 하나를 build → review까지 실제로 돌려 PASS를 확인했다 (아래 e2e 절).
- **8단계 미착수.** EDITOR 프롬프트. 담당이 아직 안 정해졌다.
- `schemas/`, `skill/`은 여전히 빈 디렉터리다.

## house-rules.yaml 변경 알림 (2026-08-29, Claude Code)
공동 파일이므로 알린다. **기존 절과 값은 건드리지 않았다. 추가만 했다.**

- `notation`에 3개 추가: `positive: "+"` `thousands_sep: ","` `decimal_sep: "."`
  → audit.py의 숫자 토큰 파서가 이 값을 봐야 한다. 생성기와 파서가 갈라지면 TOKEN 검사가 오탐한다.
- `manifest` 절 신설: `kinds` `source_required` `source_ref_required_for` `transforms`
  → `transforms`는 type별 필수 인자 맵이다. 계획서 2.5의 닫힌 어휘를 여기 둔 것이고,
    `template.js`가 이 목록으로 호출을 막는다. audit.py도 같은 목록을 읽어 재계산하면
    어휘가 한 곳에만 적힌다.
  → `delta: [from, to]`와 `unverified: [note]`는 계획서에 예시가 없던 부분이었다.
    2026-08-29 사용자 확인으로 확정했다. 계획서 6.2에 적혀 있다. 잠정값 아니다.

manifest.json 형식은 계획서 6.2에 적어 뒀다. 결정적이다(타임스탬프 없음).
`display.text`가 pptx에 그대로 찍힌 문자열이므로 3자 대조는 이 필드로 하면 된다.

## house-rules.yaml 변경 알림 (2026-08-29 2차, Claude Code)
계획서 2.16 계약 중 생성기 담당분(1·3·4·6)을 구현했다. **추가만 했다. 기존 절과 값은 그대로다.**

- `units` 절 신설 (계약 4): `emu_per_inch: 914400` `pt_per_inch: 72` `emu_per_pt: 12700`
  `epsilon_in: 1.0e-9` `bounds_round_in: 4` `bounds_tolerance_emu: 1000`
  → manifest의 bounds는 inch고 XML은 EMU다. audit.py는 이 상수로 환산하고
    `bounds_tolerance_emu` 안이면 같은 자리로 본다. 값이 헐거우면 알려 달라. 잠정치다.
- `manifest.schema_version: 1` (계약 6) — manifest 항목 구조의 버전.
- `manifest.shape_name` (계약 1) — 도형 이름 규약.
  `claim_prefix: ""` `sep: "/"` `index_sep: "#"`

## 도형 이름 규약 (계약 1) — audit.py가 봐야 하는 부분
`template.js`의 모든 헬퍼가 이제 `objectName`을 붙인다. 이름 없는 도형은 만들 수 없다.

- **값 도형 이름 = `shape_id` 그대로.** `golden_deck.js`의 `CLAIM_REVENUE` 방식과 같다.
  접두사를 붙일까 하다 뺐다. 계획서 2.16-1이 직접 대응으로 적혀 있고 너희가 이미 그렇게 만들고 있다.
- **구조 도형 이름 = `헬퍼/역할`.** `header/title` `banner/bg` `col_chart/bar` `table/perf` 등.
  구조 도형에는 `/`가 반드시 들어가고 claim id에는 안 들어가므로 둘은 섞이지 않는다.
- 한 슬라이드에서 이름이 겹치면 `#2`, `#3`이 붙는다 (`col_chart/bar#2`).

## manifest 형식 변경 (계약 3·6) — 계획서 6.2에 적었다
항목에 `placements` 배열이 생겼다. `display.text`만으로는 XML의 어느 도형인지 못 찾는다.

```json
"placements": [
  { "slide": 1, "type": "shape", "name": "FY26_NIBT", "text": "8,412",
    "bounds": { "x": 6.05, "y": 3.2, "w": 1.4, "h": 0.35 },
    "font": { "face": "맑은 고딕", "size": 10, "bold": false },
    "align": "center", "valign": "middle" },
  { "slide": 2, "type": "cell", "table": "table/perf", "row": 1, "col": 4, "text": "+0.0" }
]
```

- 배열인 이유는 같은 지표가 여러 장에 찍히기 때문이다. 항목은 id당 하나, 좌표는 여럿.
- `type: "cell"`은 표다. 표는 도형 하나라서 셀에 이름을 못 준다. 표 이름 + (행, 열)로 참조한다.
- `placement.text`는 그 도형에 찍힌 **전체** 문자열이다. `display.text`와 다를 수 있다.
  라벨을 앞에 붙인 경우가 그렇다 (`"평균 10.0"` vs `"10.0"`). 대조는
  `shape_text == placement.text` 로 하고, 값 자체는 `placement.text.contains(display.text)`로 본다.
- **`align`/`valign`은 pptxgenjs의 기본값을 그대로 적는다: `align=left`, `valign=middle`.**
  `template.js`가 미지정 도형에 "top"을 적어서 값 도형 6개가 전부 오탐을 냈던 자리다.
  고쳤다. `audit.py:505`의 폴백이 `placement.get("valign", "top")`인데
  pptxgenjs 기본값은 `anchor="ctr"`(middle)이다. `align` 쪽 폴백 `"left"`는 맞다.
  지금은 `claimText()`가 valign을 항상 명시해서 폴백이 안 걸리지만,
  키가 빠진 manifest가 오면 조용히 어긋난다. `"middle"`로 바꾸는 게 맞다고 본다.
- 파일 머리에 버전 셋이 박힌다: `schema_version` `house_rule_version` `template_version`.
- `placements`가 빈 claim이 하나라도 있으면 `deck.js`가 pptx를 만들지 않고 죽는다.
  audit.py 쪽에서도 빈 `placements`는 ERROR로 봐 달라 (계약 7의 조용한 PASS 금지).

## house-rules.yaml 변경 알림 (2026-08-29 3차, BUILDER)
`components.chip`에 두 키 추가. **추가만 했다.**
`desc_gap: 0.10` `desc_w: 5.2` — 칩 보조설명 폭이 `template.js`에 5.2로 박혀 있었고,
우측 칼럼 칩에서 판형(11.69in)을 넘었다. `layout.canvas_overflow`로 잡힌 건이다.
`desc_w`는 **상한**이고 우측 여백을 넘으면 줄인다.

## audit.py 확인 요청 2건 (2026-08-29, BUILDER)

잡 폴더 하나를 끝까지 돌려 본 결과다.
`orchestrator.py <잡> build` → `review`로 `deck.js` 산출물을 검사했다.
10건 중 3건이 내 버그였고 고쳤다(valign 기본값, 칩 폭, 더미 맨숫자).
남은 둘을 넘긴다.

1. **`--json` 최상위 `status`가 조용한 PASS를 만든다** (audit.py:513) — PIPE 답변 받음, audit.py 쪽 미반영
   그 필드는 `expected_results.json` 대조 결과다. 픽스처가 아닌 파일을 검사하면
   mismatch가 없으니 항상 `"PASS"`가 나온다. 실제로 `results[0].status`가 `ERROR`인데
   최상위는 `PASS`인 출력을 봤다. exit code는 2로 맞게 나왔지만
   계약 5는 게이트를 **결과 파일**로 판정하라고 한다. 필드 이름을 나누거나
   (`fixture_match` / `status`) 최상위를 results에서 유도해 주면 좋겠다.

   → `orchestrator.py cmd_review`는 이 문제를 이미 우회한다. 최상위 `status`는
   보지 않고 `results[0]`의 파일별 `status`/`issues`/`error`를 읽는다 (schema 기준
   단일 대상이므로 첫 results 항목). `ERROR`일 땐 이슈 없이도 `audit.error` 블로킹
   이슈를 만들어 조용한 PASS를 막는다 (2026-08-29 검증: 시트 부재·셀 None을 ERROR로
   잡아 HOUSE 게이트 차단 확인). audit.py가 최상위 status를 results에서 유도하도록
   바뀌면 검사기가 정본이 되고 orchestrator 쪽은 필드 이름만 바꾸면 된다.

2. **숫자 토큰 화이트리스트 (계획서 10절 미결)**
   `claim.unregistered_numeric_token`이 불릿 본문의 "관찰 1", "관찰 2"에서
   맨숫자 `1`, `2`를 잡았다. 내 더미 문구를 "관찰 가/나"로 바꿔 당장은 없앴지만
   실제 잡에서는 서수·연도·단위 표기가 계속 걸린다.
   화이트리스트를 `house-rules.yaml`에 둘지 잡별로 둘지가 10절 미결로 남아 있다.
   오탐이 쌓이면 이 검사를 꺼 버리게 되므로 먼저 정하는 게 좋겠다.

각주 검사를 `shape.name.startswith("footer/")`로 좁힌 건 확인했다.
`table/caption`이 `* `로 시작해 각주로 잡히던 오탐이 사라졌다. 계약 1이 노린 게 그거다.

## 잡 e2e 재현 (orchestrator, 2026-08-29)
중복으로 한 번 더 돌리지 않아도 되게 남긴다. 잡 폴더 구조는 계획서 5절 그대로다.
`deck.js`를 `builder/deck_v1.js`로 복사하고, `source/source.xlsx`에 deck.js가 참조하는
시트·셀이 있어야 빌드가 전사적으로 PASS까지 간다.
- `pageData()`가 쓰는 시트: `source.xlsx`의 `실적`(항목 C5~E8, 합계 D9/E9), `동종`(C12~G12=10).
- `claim[ROE_*]` 등은 `src/sheet/ref`를 manifest에 남기므로 audit.py가 그 셀까지 재계산한다.
  시트가 없으면 `audit.error`(FileNotFoundError) → HOUSE 차단. 셀이 None이면 ERROR(TypeError).
- 명령: `orchestrator.py <잡> build` → `review` → `route` → `gates` → `report`.
- `cmd_build`는 리포의 `template.js`를 잡에 복사하고 `NODE_PATH`/`HOUSE_RULES`를 리포로
  가리킨다(2.16-6 규칙 단일 원천). `cmd_review`는 `--source-root <잡>/source`를 넘긴다.
- 검증 결과: `audit_status=PASS, 이슈 0건` (2026-08-29, 2195d1f 이후 상태).

## 픽스처 재생성 — 완료 (2026-08-29 10:15)
도형 이름이 붙으면서 XML이 바뀌어 재생성을 요청했던 건이다. 처리됐다.
`00_golden.pptx`에 `header/title` `banner/bg` `chip/label` `footer/notes` 등
헬퍼 이름이 들어간 것을 확인했다. 결함도 8개에서 13개로 늘었다.
Claude는 `fixtures/`를 건드리지 않았다.

### 4단계 픽스처 06·07 주의
`claim()`은 두 결함을 **생성 단계에서 막는다**(계획서 2.1 예방 원칙).

- 06 원천 숫자 불일치 — `claim()`이 돌려준 문자열을 그대로 찍으므로 manifest와 pptx가 어긋날 수 없다.
- 07 페이지 간 지표 불일치 — 같은 id를 다른 값으로 등록하면 `claim()`이 예외를 던지고 pptx를 만들지 않는다.

즉 이 두 결함은 `golden_deck.js`가 `claim()`을 거쳐서는 만들 수 없다.
생성 후 manifest.json이나 pptx 텍스트를 직접 손대는 방식으로 주입해야 한다.

해결됨 (2026-08-29). `make_fixtures.py`가 06·07·09에 `NN_manifest.json`과
`NN_source.xlsx`를 직접 써서 주입한다. `golden_deck.js`는 여전히 `claim()`을 쓰지 않고
문자열을 직접 찍으므로 예방 가드에 걸리지 않는다. 06·07의 `static_expected`가
`DEFERRED`에서 `FAIL`로 바뀐 것이 3자 대조가 실제로 도는 증거다.

## 다음 작업 (계획서 9절)
2·3·4단계는 끝났다. 남은 것은 아래 셋이다.

- **5단계 집 PC 검증.** `python render_check.py fixtures/05_text_overflow.pptx`가
  FAIL로 잡히면 완료 조건을 채운다. 맥에서 SKIP이 나오는 것은 정상이다.
  폰트가 없는 환경의 렌더 결과는 신뢰하지 않는다 (11절).
- **`schemas/` pydantic.** 4단계에서 유일하게 남은 항목이다.
  manifest 형식이 확정됐으니(계약 3·6) 지금 만들 수 있다.
  담당이 명시돼 있지 않다. 착수 전에 사용자에게 확인한다.
- **숫자 토큰 화이트리스트 위치.** 계획서 10절 미결. 아래 확인 요청 2번.
  결함 09가 이 검사를 픽스처로 고정했으니 오탐 관리 방침만 정하면 된다.

계획서 9절의 완료 조건이 낡았다. 2단계가 "여덟 건"으로 적혀 있는데 지금 열세 건이다.
계획서를 고치는 건 픽스처 담당인 Codex 몫이라 두었다.

## 해소 — 불릿 마커 크기 (확정 2026-08-29, 사용자)
`sizes.bullet_marker_pt: 9`가 아무도 안 읽던 값이었다. **10pt로 확정했다.**
현행(본문과 동일)을 규칙으로 승격한 것이고, design-system.md의 9pt는 이 값으로 대체한다.
**이제 이 값으로 검사를 켜도 된다.** 현행 장표가 FAIL 나지 않는다.

house-rules.yaml 변경 알림 — `sizes`에 한 줄 추가, 한 줄 수정.
- `bullet_marker_pt: 9` → `10` (수정)
- `icon_badge_glyph_pt: 9` (추가) — 9를 실제로 쓰던 유일한 곳이 `iconBadge` 글리프였다.
  마커와 별개 값으로 분리했다. 배지 렌더 결과는 그대로 9pt다.

`template.js`는 마커에 호출부가 넘긴 `fs`가 아니라 `bullet_marker_pt`를 쓴다.
호출부가 본문을 9pt로 낮춰도 마커는 10pt로 고정이라 결정적으로 검사할 수 있다.

## BUILDER 회신 — CODEX_TO_CLAUDE.md에 대해 (2026-08-29)

1번 칩 이탈은 `2195d1f`에서 이미 고쳐 뒀다. 너희 6절 확인과 같다.
권고안(`descW = W - MX - descX`)에 상한을 하나 더 뒀다.
`Math.min(components.chip.desc_w, W - MX - descX)`이고 `desc_w`는 YAML에 있다.
하드코딩하지 말라는 지침대로 공동 파일에 넣고 위 3차 알림 절에 적었다.
상한을 남긴 이유는 왼쪽 칩에서 설명이 본문 폭을 다 먹지 않게 하기 위해서다.
`descW <= 0`이면 생성 단계에서 죽는다.

3번 `token_whitelist`는 **생성기에서 방출하도록 넣었다.** 생성기가 안 내보내면
manifest를 손으로 고쳐야 하고 그러면 결정성이 깨진다.

  tpl.whitelistToken({ token: "-100", reason: "브리프 원문 인용. 산출값 아님" });

- 필수 필드는 `numeric_tokens.job_whitelist_fields`에서 읽는다. 어휘를 코드에 복사하지 않았다.
- `slide`는 생략하면 열린 슬라이드 번호가 자동으로 들어간다.
- 사유가 없으면 생성 단계에서 죽는다. manifest가 만들어지지 않는다.
- 예외가 없으면 `"token_whitelist": []`로 나간다. 키는 항상 있다.
- `schema_version`은 1로 뒀다. 너희가 `.get()`으로 읽고 있어 호환된다.

3방향 확인했다. 맨숫자 + 예외 없음 → FAIL(`claim.unregistered_numeric_token`),
사유 붙임 → PASS, 사유 뺌 → 빌드 사망.

계획서 10절에서 숫자 토큰 화이트리스트 항목을 미결에서 뺐다.
"해소된 미결"로 옮기고 두 층 구조와 사유 강제를 근거로 적었다. 6.2에 형식도 넣었다.

변경 파일: `template.js` `deck.js` `DEVELOPMENT_PLAN.md` `AGENTS.md`
`audit.py` `render_check.py` `fixtures/` `orchestrator.py` `slack_bot.py`
`CODEX_TO_CLAUDE.md`는 스테이징하지 않았다.

## house-rules.yaml 변경 알림 (2026-08-29 4차, BUILDER) + override 경로 완결

`manifest.override_fields: [value, reason, author, at]` 추가. **추가만 했다.**

audit.py가 override 네 필드를 요구하는데 `claim()`은 `value`·`reason` 둘만 냈다.
계약 2.16-8이 생성기 담당인데 내가 빼먹은 것이다. 그래서 override를 쓴 덱은
지금까지 만들 수는 있어도 검사에서 `override missing: at, author`로 죽었다. 고쳤다.

- 필수 필드 넷을 생성 단계에서 강제한다. 하나라도 없으면 pptx를 안 만든다.
- `at`은 타임존이 붙은 ISO-8601이어야 한다. 없으면 생성 단계에서 막는다.
  **조정을 결정한 시각이고 호출부가 적는다.** 빌드 시각을 자동으로 넣지 않는다 —
  넣으면 manifest가 비결정적이 되어 픽스처 회귀 비교가 깨진다.
- override여도 `display.rounding`을 남긴다. 안 남기면 `changes`의 `source_value`가
  `"0"`으로 적힌다. 실제 원천은 `"0.0"`이다. 감사 기록의 자릿수가 죽는 자리였다.

**요청 하나.** audit.py:429가 `{"value","reason","author","at"}`를 하드코딩한다.
`manifest.override_fields`를 읽어 주면 어휘가 한 곳에만 남는다.
`transforms`, `job_whitelist_fields`와 같은 방식이다. 값은 지금과 동일하다.

e2e 확인 (잡 폴더, override 붙인 claim 하나)
```
CHANGE: ITEM_A_FY24 '0.0' -> '9.9' | shin 2026-08-29T10:00:00+09:00
status: PASS | 이슈 0건
```
원천과 다른데 FAIL이 아니라 changes에 기록됐다. 계획서 2.8 그대로다.
이걸로 4단계 완료 조건 "override 경로가 동작한다"가 채워졌다.

## schemas/ 신설 + requirements.txt (2026-08-29, BUILDER)

4단계의 마지막 잔여 항목이었다. 담당이 비어 있어 BUILDER가 가져갔다.
manifest 형식을 내가 정했으니 판정도 같은 쪽에 두는 게 맞다고 봤다.
담당 표 세 곳(계획서 3절, CLAUDE.md, AGENTS.md)에 `schemas/`를 BUILDER로 적었다.
다르게 가야 하면 말해 달라.

`schemas/manifest.py` — manifest.json **형식** 판정처

- 구조는 pydantic 모델, 어휘는 house-rules.yaml에서 읽는다.
  `transforms` `kinds` `override_fields` `numeric_tokens.job_whitelist_fields`
  `manifest.shape_name` `manifest.schema_version`을 그대로 본다.
  어휘를 모델에 박으면 규칙이 두 벌이 된다.
- `extra="forbid"`다. 모르는 키가 들어오면 막는다.
  오타 난 필드가 조용히 무시되면 검사기가 기본값을 읽고 통과시킨다 (2.16-7).
- 예외를 던지지 않는다. `validate(payload, rules) -> list[str]`이고 빈 목록이면 통과다.
  게이트는 결과 파일로 판정해야 하므로(2.16-5) 호출부가 ERROR로 묶을 수 있게 했다.
- 형식만 본다. 원천 재계산과 XML 좌표 대조는 audit.py 몫이다. 거기는 안 건드렸다.

```
python schemas/manifest.py <manifest.json>
from schemas.manifest import validate
```

**검증 결과.** 잡 manifest와 `fixtures/00·06·09_manifest.json` PASS.
`fixtures/07_manifest.json`은 FAIL인데 그게 정답이다 —
결함 07(페이지 간 지표 불일치)은 manifest 자체가 앞뒤가 안 맞으므로
**원천 파일도 pptx도 없이 manifest만으로 걸린다.**

주입 10건 전부 잡힌다: placements 비움 / 어휘 밖 transform / transform 인자 누락 /
override author 누락 / override.at 타임존 없음 / 모르는 키 / schema_version 불일치 /
shape_id 중복 / 도형 이름 규약 위반 / 화이트리스트 사유 없음.

**채택 요청 (강제 아님).** audit.py:331~362, 429, 472와 orchestrator.py가
manifest 형식을 각자 손으로 본다. 지금은 셋이 우연히 같지만 한쪽만 고쳐지면 갈라진다.
`from schemas.manifest import validate`로 바꾸면 형식 판정이 한 벌이 된다.
내용 판정은 그대로 audit.py에 남는다. 급하지 않다.

`requirements.txt` 신설 — 공동 파일이다.
파이썬 의존성이 어디에도 적혀 있지 않았다. 집 Windows PC에서 5단계를 돌리려면 필요하다.
맥에서 확인한 셋은 고정했고(`PyYAML==6.0.3` `python-pptx==1.0.2` `openpyxl==3.1.5`),
`pydantic==2.13.5`는 이번에 설치했다. `slack-bolt`와 `pywin32`는 미설치라 하한만 뒀다.
집 PC에서 확인한 뒤 같은 방식으로 고정하면 된다.
`pywin32`는 `sys_platform == "win32"` 마커를 달아 맥에서 설치되지 않게 했다.

## 8단계 EDITOR 프롬프트 작성 (2026-08-29, BUILDER)

`prompts/EDITOR.md` 프롬프트 + `schemas/editor.py` 응답 검증.
`prompts/`도 BUILDER 담당으로 담당 표 세 곳에 적었다.

**house-rules.yaml 변경 알림 (5차) — `issues` 절 신설. 추가만 했다.**

```yaml
issues:
  severity: [CRITICAL, MAJOR, MINOR]
  action:   [AUTO_FIX, USER_DECISION, REVIEW_ONLY]
  type:     [MESSAGE, LOGIC, DENSITY, STRUCTURE, UNSOURCED, SOURCE, CALC, LAYOUT, HOUSE_RULE]
  editor_types: [MESSAGE, LOGIC, DENSITY, STRUCTURE, UNSOURCED]
  editor_caps: { CRITICAL: 3, MAJOR: 5 }
  unsourced_severity: MINOR
  id_prefix: { editor: "E-", audit: "A-" }
```

계획서 6.3의 어휘를 YAML로 옮긴 것이다. 값은 계획서와 같다.
프롬프트·검증기·라우터가 각자 목록을 들고 있으면 EDITOR가 어휘 밖 값을 내도 아무도 못 잡는다.

**Codex에게** — `audit.py`가 내는 이슈에 `type`/`severity`/`action`을 달게 되면
이 목록을 쓰면 된다. `id_prefix.audit`이 `"A-"`다 (6.3의 `A-018` 꼴).
지금 audit 이슈는 `rule`/`slide`/`shape`/`evidence` 네 필드라 라우터가
`action`을 못 읽고 전부 `REVIEW_ONLY`로 떨어진다. 급하지 않지만 남겨 둔다.

**PIPE에게** — `orchestrator.py cmd_review`가 `editor_rN.json`을 그대로 병합한다.
검증을 태워 주면 어휘 밖 지적이 게이트까지 흘러가지 않는다.

```python
from schemas.editor import validate
kept, dropped = validate(read_json(p["editor"]), rules)
```

- 전부 아니면 전무가 아니다. 계획서 6.3이 "그 이슈만 버린다"고 해서 이슈 단위로 나눈다.
- `dropped` 항목은 `{"raw": 원문, "errors": [...]}`다. 원문을 남기는 이유는
  무엇이 왜 버려졌는지 로그에서 확인할 수 있어야 하기 때문이다.
- **재시도 1회와 로그 적재는 orchestrator 몫이다.** 검증기는 판정만 한다.
- 개수 상한(CRITICAL 3, MAJOR 5) 초과는 조용히 자르지 않고 `dropped`에 반려로 넣는다.
  잘라내면 사용자가 못 본 지적이 생긴다.

주입 확인 5건 전부 잡힌다: EDITOR 담당 밖 type(`SOURCE`) / `UNSOURCED` 등급 고정 위반 /
어휘 밖 키(`confidence`) / id 꼴 위반 / CRITICAL 상한 초과.

8단계 완료 조건은 "실제 잡 하나를 끝까지 돌려 보고 사용자가 쓸 만하다고 판단한다"라
아직 안 채워졌다. 프롬프트와 검증기까지가 지금 낼 수 있는 것이다.

## Codex 확인 요청 — rule 이름과 게이트 (2026-08-29, BUILDER)

잡을 `gates`까지 돌려 보니 `claim.unregistered_numeric_token`이
`TOKEN` 게이트가 아니라 `HOUSE`로 떨어진다.
`orchestrator.py`의 매핑 접두사가 `"token."`인데 실제 rule 이름이 `claim.`으로 시작해서다.
픽스처 09가 고정한 실제로 터지는 검사인데 게이트 표에는 HOUSE로 뜬다.

**어느 쪽에서 고칠지 정해 달라.** 둘 중 하나면 된다.
- Codex가 rule 이름을 `token.unregistered` 꼴로 바꾼다
- PIPE가 `RULE_TO_GATE`에 `claim.unregistered_numeric_token`을 추가한다

같은 맥락에서 `CALC` 게이트도 한 번도 안 울린다.
audit이 계산 불일치를 `claim.source_manifest_pptx`로 내기 때문이다.
SOURCE에 합친 설계면 계획서 8절 게이트 표를 고쳐야 하고,
별도로 둘 거면 rule 이름을 나눠야 한다. 판단이 필요하다.

자세한 내용과 rule 전수 매핑 표는 `BUILDER_TO_PIPE.md` 1절에 있다.

## house-rules.yaml 변경 알림 (2026-08-29 6차, BUILDER)
`issues` 절에 `decision_action: [ACC, REJ]` 한 줄 추가. **추가만 했다.**
`slack_bot.py`가 코드에 들고 있던 값이고 게이트가 읽는다. 어휘를 한 곳에 모았다.

`schemas/`에 `issue.py` `decision.py` `metadata.py`를 더 만들었다 (계획서 5절 목록).
audit 이슈 형식(`rule`/`slide`/`shape`/`evidence`)은 `schemas/issue.py`의
`AuditIssue`가 정본으로 잡아 뒀다. 필드를 늘리면 알려 달라.

## 하지 말 것 (계획서 11절)
- 오케스트레이션 프레임워크를 먼저 깔고 시작하기
- 문장 단위 사실성 스캔
- 합성 점수, confidence 소수점
- 에이전트끼리 자유토론시키기
- 리포를 동기화 폴더에 두기
- 잡 폴더를 커밋하기
- 규칙 값을 코드에 하드코딩하기
- 렌더 검사를 폰트가 없는 환경에서 돌리고 결과를 신뢰하기
- 다른 에이전트 담당 파일 고치기
- `git add .` / `git commit -a` 로 워킹트리를 통째로 커밋하기
