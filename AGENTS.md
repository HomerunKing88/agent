# AGENTS.md — Codex CLI 세션 규칙

## 세션 시작
- 작업 전 `DEVELOPMENT_PLAN.md`를 먼저 읽는다. 설계 배경과 확정 사항이 거기 있다.
- 계획서의 확정 사항을 바꾸려면 근거를 제시하고 사용자 확인을 받는다.
  문서와 코드가 어긋나면 문서를 고친다. 코드가 문서보다 앞서 나가지 않는다.

## 담당 파일 (계획서 3절)
- Codex 담당: `audit.py`, `render_check.py`, `fixtures/`
- Claude Code 담당: `template.js`, `deck.js`, `orchestrator.py`, `slack_bot.py` — 건드리지 않는다.
- 공동: `house-rules.yaml` (변경 시 상대에게 알림. 한 번에 한 쪽만 고친다)
- 브랜치는 `codex/*`를 쓴다. Claude Code는 `claude/*`를 쓴다.

## 규칙 값
- 폰트, 각주 y좌표, 최소 pt, 표 정렬, 금지 영역 등 모든 규칙 값은 `house-rules.yaml`에서만 읽는다.
  `audit.py`에 하드코딩하지 않는다. pyyaml로 읽는다 (`template.js`는 js-yaml로 같은 파일을 읽는다).
- 검사에 바로 쓰이는 절: `fonts`(2종 검사) `sizes`(최소 pt) `table`(정렬·행높이)
  `zones`(각주 y, content_max_y) `notation`(음수 부호) `forbidden` `qa`(렌더 임계값)

## 역할 경계 (계획서 2.2)
- Codex는 검사 대상이 아니라 검사기 저자다. 표현·디자인 의견은 내지 않는다.
- 결정적 판정만 한다. PASS/FAIL이고, 합성 점수나 confidence 소수점은 쓰지 않는다.

## 현재 상태 (2026-08-28)
- 1단계 완료. `house-rules.yaml` 14개 절 확정, `template.js`가 이 파일을 읽는다.
  하드코딩된 규칙 값 잔존 0건. 구판 대비 pptxgenjs 호출 70건 대조로 동작 보존 확인.
- 2~8단계 미착수. `fixtures/`, `schemas/`, `skill/`은 빈 디렉터리다.

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
