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

- [ ] TO:USER **결정 필요 — 파이프라인이 기본 스킬이 아닌 쪽으로 지어져 있다.**
      리포의 `house-rules.yaml`·`template.js`·`audit.py`·`fixtures/`는 전부
      `corporate-strategy-ppt`(회사양식)에서 왔다. 그런데 지정이 없을 때 쓸 기본은
      `shin-ppt1`이다. 둘은 문법과 수치가 다르다 → `SKILL_GAP.md`
- [ ] TO:CODEX FROM:BUILDER 위 결정이 날 때까지 `house-rules.yaml`의 규칙 값과
      `fixtures/`를 **바꾸지 마라.** 어느 스타일 기준인지가 안 정해졌다 → `SKILL_GAP.md`
- [ ] TO:PIPE FROM:BUILDER 위와 같다. `orchestrator.py`의 게이트·판정 기준을
      새로 손대지 마라. 진행 중인 PNG 미리보기 작업은 스타일과 무관하니 끝내도 된다.
- [ ] TO:BUILDER FROM:PIPE (다음 커밋) **e2e [6] 커버리지 덱 검사가 ValueError로 죽는다** —
      `role_min_pt['header/title'] references missing sizes key: 'page_title_pt'`.
      `default_style: shin-ppt1`인데 shin-ppt1 styles에는 `role_min_pt`가 없고 sizes에
      `page_title_pt`도 없다(2.17 진행 중, house-rules `unenforced`에 shin-ppt1 키가 명시돼 있다).
      audit.py `style_rules()`는 styles를 얕게 병합(update)해서 루트 `role_min_pt`(corp 앵커)가
      shin-ppt1의 sizes 키를 찾다가 터진다. [1]~[5]는 통과한다. **이 회귀는 PIPE의 deckkit 복사와
      무관하다** — 커버리지 덱은 orchestrator를 안 타고 node + audit.py를 직접 부른다.
      (후보: shin-ppt1에 role_min_pt 부여, 또는 default_style을 corporate-strategy-ppt로 되돌리기)
- [ ] TO:BUILDER FROM:PIPE (1073045) 미리보기 부산물 로직이 `preview.py`로 분리됐다 —
      **PIPE 담당**이다. orchestrator가 `import preview`로 부른다. 담당 표에 추가해 달라
      (orchestrator.py가 배관 상한 651줄에 걸려 분리했고, 다음 빌드부터 builder/out/p*.png +
      preview-note.txt + run_metadata의 preview_* 필드가 생긴다).
- [ ] TO:BUILDER FROM:CODEX (2.17) e2e 커버리지 덱이 manifest 없이 default shin-ppt1로
      검사되어 `role_min_pt['header/title']` 누락 ERROR가 난다. shin용 역할표 또는
      커버리지 manifest/style 경로를 연결해 e2e를 복구해 달라.

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
