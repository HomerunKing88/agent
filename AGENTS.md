# AGENTS.md — Codex CLI 세션 규칙

## 세션 시작
- 작업 전 `DEVELOPMENT_PLAN.md`를 먼저 읽는다. 설계 배경과 확정 사항이 거기 있다.
- 계획서의 확정 사항을 바꾸려면 근거를 제시하고 사용자 확인을 받는다.
  문서와 코드가 어긋나면 문서를 고친다. 코드가 문서보다 앞서 나가지 않는다.

## 담당 파일 (에이전트 셋. 계획서 3절)
- Codex 담당: `audit.py`, `render_check.py`, `fixtures/`
- BUILDER(Claude Code) 담당: `template.js`, `deck.js` — 건드리지 않는다.
- PIPE 담당: `orchestrator.py`, `slack_bot.py` — 건드리지 않는다. 2026-08-29 신설.
- 공동: `house-rules.yaml` (변경 시 나머지 둘에게 알림. 한 번에 한 쪽만 고친다)
- 브랜치는 `codex/*`를 쓴다. BUILDER는 `claude/*`, PIPE는 `pipe/*`.

## 체크아웃을 셋이 공유한다 (계획서 3.1)
- **커밋은 자기 담당 파일만 이름으로 지정한다.** `git add .` / `git commit -a` 금지.
- **브랜치를 함부로 바꾸지 않는다.** `git switch`가 나머지 둘의 HEAD도 같이 옮긴다.

## 규칙 값
- 폰트, 각주 y좌표, 최소 pt, 표 정렬, 금지 영역 등 모든 규칙 값은 `house-rules.yaml`에서만 읽는다.
  `audit.py`에 하드코딩하지 않는다. pyyaml로 읽는다 (`template.js`는 js-yaml로 같은 파일을 읽는다).
- 검사에 바로 쓰이는 절: `fonts`(2종 검사) `sizes`(최소 pt) `table`(정렬·행높이)
  `zones`(각주 y, content_max_y) `notation`(음수 부호) `forbidden` `qa`(렌더 임계값)

## 역할 경계 (계획서 2.2)
- Codex는 검사 대상이 아니라 검사기 저자다. 표현·디자인 의견은 내지 않는다.
- 결정적 판정만 한다. PASS/FAIL이고, 합성 점수나 confidence 소수점은 쓰지 않는다.

## 현재 상태 (2026-08-29)
- 1단계 완료. `house-rules.yaml` 14개 절 확정, `template.js`가 이 파일을 읽는다.
  하드코딩된 규칙 값 잔존 0건. 구판 대비 pptxgenjs 호출 70건 대조로 동작 보존 확인.
- 4단계 생성기 쪽 완료. `template.js`에 `claim()`이 들어갔고 `deck.js`가 manifest.json을 방출한다.
  2026-08-29 2차로 계획서 2.16 계약의 생성기 담당분(1 도형 이름, 3 근거 좌표,
  4 단위·오차, 6 버전 전파)까지 넣었다. 아래 알림 절 참조.
  4단계의 나머지(audit.py 3자 대조·토큰 검출, `schemas/` pydantic)는 미착수.
- 5~8단계 미착수. `schemas/`, `skill/`은 빈 디렉터리다.

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
    "align": "center", "valign": "top" },
  { "slide": 2, "type": "cell", "table": "table/perf", "row": 1, "col": 4, "text": "+0.0" }
]
```

- 배열인 이유는 같은 지표가 여러 장에 찍히기 때문이다. 항목은 id당 하나, 좌표는 여럿.
- `type: "cell"`은 표다. 표는 도형 하나라서 셀에 이름을 못 준다. 표 이름 + (행, 열)로 참조한다.
- `placement.text`는 그 도형에 찍힌 **전체** 문자열이다. `display.text`와 다를 수 있다.
  라벨을 앞에 붙인 경우가 그렇다 (`"평균 10.0"` vs `"10.0"`). 대조는
  `shape_text == placement.text` 로 하고, 값 자체는 `placement.text.contains(display.text)`로 본다.
- 파일 머리에 버전 셋이 박힌다: `schema_version` `house_rule_version` `template_version`.
- `placements`가 빈 claim이 하나라도 있으면 `deck.js`가 pptx를 만들지 않고 죽는다.
  audit.py 쪽에서도 빈 `placements`는 ERROR로 봐 달라 (계약 7의 조용한 PASS 금지).

## 픽스처 재생성이 필요하다
`template.js` 헬퍼가 도형에 이름을 붙이면서 출력 XML이 바뀐다.
`fixtures/*.pptx`는 이름이 붙기 전 산출물이라 지금 커밋된 파일과 바이트가 다르다.
`fixtures/golden_deck.js` 자체는 고치지 않아도 그대로 돈다 — 스크래치패드로 출력해 확인했다.
`make_fixtures.py`를 다시 돌려 주면 된다. Claude는 `fixtures/`를 건드리지 않았다.

### 4단계 픽스처 06·07 주의
`claim()`은 두 결함을 **생성 단계에서 막는다**(계획서 2.1 예방 원칙).

- 06 원천 숫자 불일치 — `claim()`이 돌려준 문자열을 그대로 찍으므로 manifest와 pptx가 어긋날 수 없다.
- 07 페이지 간 지표 불일치 — 같은 id를 다른 값으로 등록하면 `claim()`이 예외를 던지고 pptx를 만들지 않는다.

즉 이 두 결함은 `golden_deck.js`가 `claim()`을 거쳐서는 만들 수 없다.
생성 후 manifest.json이나 pptx 텍스트를 직접 손대는 방식으로 주입해야 한다.
현재 `golden_deck.js`는 claim()을 쓰지 않고 문자열을 직접 찍으므로 지금 픽스처는 영향이 없다.

## 다음 작업 (계획서 9절)
- 2단계 `fixtures/` — `golden_deck.js` 하나에 결함을 하나씩 주입하는 `make_fixtures.py`.
  손으로 30장 만들지 않는다. 첫 세트 8개는 계획서 9절 2단계에 적혀 있다.
  완료 조건: `expected_results.json`에 8건의 정답이 있다.
- 3단계 `audit.py` static — 픽스처를 전부 통과할 때까지.
  결함 05(넘침)는 정적 근사만 하고 정확 판정은 5단계로 미룬다.
  완료 조건: `python audit.py fixtures/`가 expected와 일치.
- 5단계 `render_check.py`는 pywin32 + PowerPoint COM이 필요하다. 집 Windows PC에서만 돌아간다.

## 미결 — 착수 전 확인
- `sizes.bullet_marker_pt: 9`는 아직 아무도 읽지 않는다. `template.js`는 불릿 ▸ 마커에
  본문 크기(기본 10pt)를 쓴다. 이 값으로 검사하면 현행 장표가 전부 FAIL 난다.
  검사 대상에서 빼거나 값을 먼저 확정한다. 계획서 10절 참조.

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
