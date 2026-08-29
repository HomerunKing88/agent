# CLAUDE.md

## 세션 시작
- 작업 전 `DEVELOPMENT_PLAN.md`를 먼저 읽는다. 설계 배경과 확정 사항이 거기 있다.
- 계획서의 확정 사항을 바꾸려면 근거를 제시하고 사용자 확인을 받는다. 문서와 코드가 어긋나면 문서를 고친다.

## 규칙 값
- 폰트, 각주 y좌표, 최소 pt, 표 정렬, 금지 영역 등 모든 규칙 값은 `house-rules.yaml`에서만 읽는다. 코드에 하드코딩하지 않는다.
- `template.js`와 `audit.py`가 같은 값을 각자 들고 있으면 생성기와 검사기가 갈라진다.

## 담당 파일 (에이전트 셋. 계획서 3절)
- 이 세션은 **BUILDER**다. 담당: `template.js`, `deck.js`, `schemas/`, `prompts/`
- Codex 담당: `audit.py`, `render_check.py`, `fixtures/` — 건드리지 않는다.
- PIPE 담당: `orchestrator.py`, `slack_bot.py` — 건드리지 않는다. 2026-08-29에 넘겼다.
- 공동: `house-rules.yaml`, `requirements.txt` (변경 시 나머지 둘에게 알림)
- 브랜치는 `claude/*`를 쓴다. Codex는 `codex/*`, PIPE는 `pipe/*`.
  Codex 쪽 세션 규칙은 `AGENTS.md`, PIPE 쪽은 계획서 3.2절에 있다.
- `template.js` 원본은 이 리포다. 스킬 폴더(`~/.claude/skills/.../corporate-strategy-ppt/`)는 배포본이므로 거기서 고치지 않는다.

## 체크아웃을 셋이 공유한다 (계획서 3.1)
- **커밋은 자기 담당 파일만 이름으로 지정한다.** `git add .` / `git commit -a` 금지.
  워킹트리에는 항상 다른 둘의 미커밋 작업이 같이 있다.
- **브랜치를 함부로 바꾸지 않는다.** 체크아웃이 하나라 `git switch`가 나머지 둘의 HEAD도 옮긴다.

## 작업 순서 (충돌 방지. 세 에이전트 공통)
공동 파일·교차 계약에 걸린 작업은 아래 순서를 지킨다. 담당 파일(자기 것)끼리는 어떤 순서로 해도 충돌하지 않는다.

1. **공동 파일은 한 번에 한 쪽만**: `house-rules.yaml`, `requirements.txt`, `AGENTS.md`, `CLAUDE.md`,
   `DEVELOPMENT_PLAN.md`. 고치는 쪽이 커밋까지 끝낸 뒤 다음 쪽이 시작한다.
2. **규칙 값(house-rules.yaml)이 먼저**: 값이 없는 상태로 검사기·생성기가 값(or `issues` 어휘 같은 구조)을
   코드에 박으면 두 갈래 검사가 갈라진다. YAML 쪽 수정 → 커밋 → 뒤에 읽는 쪽.
3. **호출 계약은 소유자만 바꾼다**:
   - `orchestrator.py` → `audit.py` CLI(`--json`, `--manifest`, `--source-root`)는 Codex 소유.
   - `orchestrator.py` → `schemas/editor.py` `validate()`는 BUILDER 소유.
   - 이들을 읽는 PIPE는 호출 계약을 지키고, 계약이 깨지면 소유자에게 먼저 알린다.
4. **교차 작업은 알림 후**: 자기 담당 파일이 어때서 다른 쪽 담당을 건드려야 하면
   문서에 전달사항을 남기고 커밋한다. 파일 자체를 고치지 않는다.

## 잡 폴더
- 실적 수치가 든 잡 폴더는 리포 밖, 커밋하지 않는다. 리포 자체는 동기화 폴더에 두지 않는다.
- 위치: `G:\내 드라이브\deck-qa-jobs\job_YYYYMMDD_NNN\` (구글 드라이브. 드라이브 문자는 집PC에서 확인)

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
