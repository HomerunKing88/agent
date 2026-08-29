# HANDOFF — 에이전트 간 작업 큐

**세션을 시작하면 자기 앞으로 온 미완 항목(`[ ]`)을 먼저 처리한다.**
사용자가 내용을 읽어 옮기지 않는다. 여기가 유일한 인계 지점이다.

처리하면 `[x]`로 바꾸고 결과 커밋 해시를 적는다. 자기 앞 항목이 없으면
계획서 9절에서 자기 담당의 다음 일을 잡는다. 그것도 없으면 사용자에게 묻는다.

```
- [ ] TO:<대상> FROM:<보낸이> (<근거 커밋>) <한 줄 요약> → <자세한 내용 위치>
```

대상은 `BUILDER` `CODEX` `PIPE` `USER` 넷이다.
`USER` 항목은 에이전트가 할 수 없는 것이다 — 집 PC 실측, 제품 최종 판단.
에이전트는 `USER` 항목을 건드리지 않는다.

**남의 앞으로 온 항목을 대신 처리하지 않는다.** 담당 파일 경계와 같은 이유다
(계획서 3절). 대신 해야 할 사정이 생기면 그 항목 아래에 사유를 적고 사용자에게 올린다.

---

## 열린 항목

- [x] TO:PIPE FROM:BUILDER (881a945) QA_REPORT가 미검사 게이트(CALC·LINT)를 PASS로 찍는다.
      BLOCKED/PASS/SKIP 세 상태 구분 → `9c4c297`
- [x] TO:PIPE FROM:BUILDER (1d58de7) `schemas/issue`·`decision`·`metadata` 적용 여부 판단
      → `62f1855`(적용 결정)·`9c4c297`(문서 갱신)
- [ ] TO:BUILDER FROM:CODEX (e5eb0c9) CALC 배선이 살아나 `e2e_check.py`의
      `GATES_NOT_WIRED["CALC"]`가 낡았다. 항목을 제거하고 회귀 기대값을 갱신해 달라. 게이트가
      SKIP 3상태가 되면 `{"LINT": ...}`만 남기면 된다 (AGENTS.md 2차 전달 절) → `9c4c297` 배경
- [ ] TO:USER (계획서 9절 5단계) 집 Windows PC에서 `pip install -r requirements.txt` 후
      `python render_check.py fixtures/05_text_overflow.pptx`가 FAIL이면 완료
- [ ] TO:USER (계획서 9절 8단계) 실제 잡 하나를 끝까지 돌려 쓸 만한지 판단
- [ ] TO:USER `skill/` 패키징. 스킬 원본 문서(`design-system.md`, `qa-checklist.md`)가
      이 맥북에도 리포 이력에도 없다. 회사 PC에서 가져오면 BUILDER가 만든다

## 닫힌 항목

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
