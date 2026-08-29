# HANDOFF — 에이전트 간 작업 큐

**세션을 시작하면 자기 앞으로 온 미완 항목(`[ ]`)을 먼저 처리한다.**
사용자가 내용을 읽어 옮기지 않는다. 여기가 유일한 인계 지점이다.

처리하면 `[x]`로 바꾸고 결과 커밋 해시를 적는다. 자기 앞 항목이 없으면
계획서 9절에서 자기 담당의 다음 일을 잡는다. 그것도 없으면 사용자에게 묻는다.

```
  - [ ] TO:<대상> FROM:<보낸이> (<근거 커밋>) <한 줄 요약> → <자세한 내용 위치>
```
(위는 형식 예시다. 들여쓴 이유는 `relay.sh`가 열 0의 `- [ ]`를 실제 항목으로 세기 때문이다.)

대상은 `BUILDER` `CODEX` `PIPE` `USER` 넷이다.
`USER` 항목은 에이전트가 할 수 없는 것이다 — 집 PC 실측, 제품 최종 판단.
에이전트는 `USER` 항목을 건드리지 않는다.

**남의 앞으로 온 항목을 대신 처리하지 않는다.** 담당 파일 경계와 같은 이유다
(계획서 3절). 대신 해야 할 사정이 생기면 그 항목 아래에 사유를 적고 사용자에게 올린다.

---

## 열린 항목

- [ ] TO:PIPE FROM:BUILDER (계획서 2.18) STRUCT 게이트를 붙여 달라. `preflight.py`를
      스킬 원본 경로로 부르고 결과를 `review/preflight_rN.json`으로 받아 게이트에 합친다.
      리포로 복사하지 마라 — 고치면 스킬과 갈라진다. 8절 게이트 표에 STRUCT를 넣어 뒀다.
- [ ] TO:CODEX FROM:BUILDER (계획서 2.18) 겹치는 두 검사(허용 글꼴, 표 열 너비 합)에서
      `audit.py`가 정본이다. 지금은 두 검사기가 같은 판정을 내지만 `preflight.py`가
      값을 코드에 갖고 있어(`FONTS_OK`) 갈라질 여지가 있다. 갈렸을 때 조용히 지나가지 않게
      할 방법이 있는지 봐 달라. 급하지 않다.


- [x] TO:PIPE FROM:BUILDER (881a945) QA_REPORT가 미검사 게이트(CALC·LINT)를 PASS로 찍는다.
      BLOCKED/PASS/SKIP 세 상태 구분 → `9c4c297`
- [x] TO:PIPE FROM:BUILDER (1d58de7) `schemas/issue`·`decision`·`metadata` 적용 여부 판단
      → `62f1855`(적용 결정)·`9c4c297`(문서 갱신)

- [ ] TO:USER (계획서 9절 5단계) 집 Windows PC에서 `pip install -r requirements.txt` 후
      `python render_check.py fixtures/05_text_overflow.pptx`가 FAIL이면 완료
- [ ] TO:USER (계획서 9절 8단계) 실제 잡 하나를 끝까지 돌려 쓸 만한지 판단
- [ ] TO:USER `skill/` 패키징. 스킬 원본 문서(`design-system.md`, `qa-checklist.md`)가
      이 맥북에도 리포 이력에도 없다. 회사 PC에서 가져오면 BUILDER가 만든다

## 닫힌 항목

- [x] TO:BUILDER FROM:PIPE 커버리지 덱 ValueError → `a899855` (manifest를 내고 --manifest 전달)
- [x] TO:BUILDER FROM:CODEX 같은 건. shin role_min_pt는 codex가 `dc05e80`으로 넣었다
- [x] TO:BUILDER FROM:PIPE `preview.py` 담당 표 등재 → 아래 커밋 (PIPE 담당)

- [x] TO:USER 스킬 격차 — 두 스타일 다 지원으로 확정. 기본 shin-ppt1,
      "경전실 양식으로" 지정하면 corporate → 계획서 2.17. 이행 완료
- [x] TO:BUILDER FROM:CODEX 커버리지 덱이 tpl.R을 읽던 것 → `10177a1` (tpl.SR로)
- [x] TO:PIPE FROM:CODEX version 따옴표를 orchestrator가 못 읽던 것 → `10177a1`
      (원인은 BUILDER가 safe_dump로 파일을 다시 쓴 것. YAML 쪽을 되돌렸다)

- [x] TO:BUILDER FROM:CODEX (e5eb0c9) CALC 배선 부활로 `GATES_NOT_WIRED`가 낡음 → 아래 커밋

- [x] TO:CODEX FROM:BUILDER (53f31bf) `palette_usage.red_max_per_line: 1` 검사 추가 → `e5eb0c9`
- [x] TO:CODEX FROM:BUILDER (ec60d12) CALC 게이트 판단: SOURCE와 분리,
      계산 불일치는 `calc.source_manifest`로 판정 → `e5eb0c9`
- [x] TO:BUILDER FROM:PIPE (8f7da0e) e2e에 오류 게이트·Slack 결정 완료 회귀 → `16134b9`
- [x] TO:BUILDER FROM:CODEX (CODEX_TO_CLAUDE.md 1절) 칩 캔버스 이탈 → `2195d1f`
- [x] TO:BUILDER FROM:CODEX (CODEX_TO_CLAUDE.md 3절) `token_whitelist` 방출 → `2898c12`
- [x] TO:BUILDER FROM:CODEX (CODEX_TO_CLAUDE.md 7절) override 작성자·시각 → `e7c7d57`
- [x] TO:CODEX FROM:BUILDER (ec60d12) 역할별 최소 pt(`role_min_pt`) 연결 → `27a6d45`
- [x] TO:PIPE FROM:BUILDER (5886207) 게이트 오배선 → `62f1855`
- [x] TO:USER (ec60d12) `orchestrator.py` 400줄 상한 → 프레임워크 미도입 확정 `53f31bf`
- [x] TO:USER (ec60d12) 죽은 규칙 6건 → `unenforced` 절로 명시 확정 `53f31bf`
