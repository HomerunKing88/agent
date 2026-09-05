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

> 닫음 2026-09-04 (BUILDER): 통보 항목이고 내용이 이미 사실이 됐다.
> 옛 브랜치는 없고 셋 다 `main`에서 커밋해 왔다. 받는 쪽이 할 일은 없다.
- [x] TO:CODEX FROM:BUILDER (2026-08-30) **브랜치가 정리됐다. `main`에서 일한다.**
      GitHub 기본이 `main`이 됐고 오늘 작업 85건이 거기 있다.
      옛 브랜치(`claude/project-setup-structure-uf3ucy`)는 지웠다 — 내용은 전부 `main`에 있다.
      접두사 규칙(`codex/*`)은 폐기했다. 체크아웃이 하나라 성립하지 않는 규칙이었다.
      **`git switch`를 하지 마라.** 세션 셋의 HEAD가 같이 움직인다.
- [x] TO:PIPE FROM:BUILDER (2026-08-30) 위와 같다. `pipe/*` 접두사 규칙도 폐기했다.
      그리고 STRUCT 게이트 1차 시도가 중단됐다(사용자 판단, 40분 초과).
      다시 할 때는 작게 쪼갠다 — preflight 호출과 결과 파일 쓰기 먼저, 게이트 합류는 그다음.

- [x] TO:PIPE FROM:BUILDER (계획서 2.18) STRUCT 게이트를 붙여 달라. `preflight.py`를
      스킬 원본 경로로 부르고 결과를 `review/preflight_rN.json`으로 받아 게이트에 합친다.
      리포로 복사하지 마라 — 고치면 스킬과 갈라진다. 8절 게이트 표에 STRUCT를 넣어 뒀다.
      **2026-08-29 1차 시도가 40분 넘게 끝나지 않아 사용자 판단으로 중단했다.**
      커밋 전이라 리포에 영향은 없다. 다시 붙일 때는 작게 쪼개서 한다 —
      preflight 호출과 결과 파일 쓰기까지 먼저 하고, 게이트 합류는 그다음이다.
      **이 게이트가 없어도 파이프라인은 돈다.** 막고 있는 것이 아니다.
      **(2026-08-30 추가) 스타일 판정은 세지 마라.** `preflight.py`는 shin 전용 검사기라
      corporate 장표에 shin 기준을 들이댄다. 실제로 연습 잡 001에서 오류 26건이 났고
      전부 오검이었다(표 9pt를 11.5pt 하한으로, corporate 색을 "섞였다"로).
      `house-rules.yaml`의 `preflight.style_owned` 여섯 문구를 담은 `[오류]` 줄은
      게이트 판정에서 빼라. 나머지는 전부 STRUCT로 센다 — 목록에 없는 새 검사가
      조용히 빠지지 않게 하려는 것이다. 문구를 코드에 박지 마라 (2.14).
      확인: 001은 26→0건, 002(shin)는 0→0건. 계획서 2.18을 그렇게 고쳐 뒀다.

      1단계 완료 → `414c4d9`. **2단계(게이트 합류)에서 바로 걸릴 것을 적어 둔다.**
      지금 `preflight_r1.json`의 `status`는 preflight의 종료 코드 그대로다.
      그래서 corporate 잡 001이 `struct 0건인데 status=FAIL`로 나온다.
      게이트를 이 `status`에 물리면 정상 장표가 막힌다 — 스타일 오류로 STRUCT가
      닫히는 것이라 분리한 의미가 없어진다.
      **게이트 판정은 `counts.ownership.struct`로 해라.** `status`가 아니다.
      2단계 완료 → `19d9b38`. GATES에 STRUCT 합류, 판정은 struct 건수 기준.
      preflight를 아직 안 돌렸으면 SKIP, ERROR·형식 이상은 사유와 함께 BLOCKED (2.16-7).
      001·002 모두 STRUCT 열림, e2e PASS, audit EXPECTED MATCH.
- [x] TO:CODEX FROM:BUILDER (계획서 2.18) 겹치는 두 검사(허용 글꼴, 표 열 너비 합)에서
      `audit.py`가 정본이다. 지금은 두 검사기가 같은 판정을 내지만 `preflight.py`가
      값을 코드에 갖고 있어(`FONTS_OK`) 갈라질 여지가 있다. 갈렸을 때 조용히 지나가지 않게
      할 방법이 있는지 봐 달라. 급하지 않다. → `89e17fc` (audit 결과에 드리프트 이슈 추가)


- [x] TO:PIPE FROM:BUILDER (881a945) QA_REPORT가 미검사 게이트(CALC·LINT)를 PASS로 찍는다.
      BLOCKED/PASS/SKIP 세 상태 구분 → `9c4c297`
- [x] TO:PIPE FROM:BUILDER (1d58de7) `schemas/issue`·`decision`·`metadata` 적용 여부 판단
      → `62f1855`(적용 결정)·`9c4c297`(문서 갱신)

- [x] TO:USER (계획서 9절 7단계) 배관 한도 → (b) 검사기 전체로 확정. 계획서 7절과 e2e [11]단계 반영
- [x] TO:BUILDER (2026-09-03) 경전실 양식 네이티브 차트 헬퍼 → 아래 커밋 (chartBar·chartLine 신설)
- [x] TO:USER (계획서 9절 5단계) 렌더 검사가 넘침을 실제로 잡는지 확인 — **완료 2026-09-05**
      원래 조건은 "집 Windows PC에서 `python render_check.py fixtures/05_text_overflow.pptx`가
      FAIL이면 완료"였다. 항목의 뜻은 **넘침 판정이 실제로 작동하는가**였고,
      CODEX가 2026-09-04에 LibreOffice headless 경로를 붙여(271471a) 맥에서 확인됐다.

      ```
      $ python3 render_check.py fixtures/05_text_overflow.pptx --style shin-ppt1
      status FAIL  ·  종료코드 1
        render.text_overflow | Text 7 |
          bounds=(435.6, 91.0, 475.2, 280.8)pt  ← 렌더된 글자
          shape =(435.6,178.6, 475.2,193.0)pt  ← 도형 상자 (높이 14.4pt)
      ```

      상자 14.4pt에 글자가 189.8pt로 그려졌다. 실측이다. 정상 덱 넷은 PASS다.
      Windows COM 경로는 그대로 남아 있고, 집 PC에서 돌리면 그쪽으로 간다.
      사용자 지시로 닫는다.

- [x] TO:USER (계획서 9절 8단계) 실제 잡을 끝까지 돌려 쓸 만한지 판단 — **완료 2026-09-05**
      사용자 지시로 닫는다. 판단은 사용자가 했고, 아래는 그 판단이 선 자리다.

      | 잡 | 내용 | claim | 검토 지적 | 게이트 |
      |---|---|---|---|---|
      | 003 | 거래대금·신용잔고 상관 (가상) | 6 | 0 | 아홉 전부 PASS |
      | 004 | 올리브영 현황, 표 중심 (실데이터) | 21 | 0 | 아홉 전부 PASS |
      | 005 | 같은 데이터, 차트 중심 (실데이터) | 14 | 0 | 아홉 전부 PASS |
      | 006 | 세제개편안 요약, 경전 양식 (예시) | 15 | 0 | 아홉 전부 PASS |
      | 007 | 전기요금 선납 모델 (보도 기준) | 5 | 0 | 아홉 전부 PASS |

      **SKIP이 하나도 없다.** 2026-09-04 아침까지 LAYOUT은 한 번도 돈 적이 없었고
      LINT는 존재하지 않았다. 지금은 아홉 칸이 전부 실제로 판정된다.

      남은 한계는 그대로다. 닫는 것이 이것들을 없애지는 않는다.
      - **제목은 실측되지 않는다.** HY헤드라인M이 맥에 없어 그 폰트를 쓰는 도형은
        PASS가 아니라 SKIP으로 빠진다. 본문만 재진다
      - **preflight가 경전 양식에 shin 임계값을 적용한다.** 잡 006에서 오류 21건이
        나오지만 전부 style 소유이고 판정의 정본은 audit이다. 발산 자체는 남아 있다
      - **실데이터 잡은 004·005 하나뿐이다.** 003은 가상, 006은 예시, 007은 보도 기준이다
      - **생성기만 아는 규칙이 36개 남았다.** 래칫이 증가만 막는다

- [x] TO:BUILDER FROM:CODEX (D-20260904-13) `audit.py`가 이제 아래 규칙을 읽어 E2E [8]이
      stale unenforced로 실패한다. `house-rules.yaml`의 `unenforced`에서 세 키를 제거해 달라:
      `styles.corporate-strategy-ppt.fonts.allowed_count`,
      `styles.corporate-strategy-ppt.zones.content_max_y_exempt`,
      `styles.shin-ppt1.fonts.allowed_count`.
      처리 완료 — `unenforced`에서 세 키를 뺐다. E2E PASS, 픽스처 EXPECTED MATCH.

- [x] TO:BUILDER FROM:REVIEW (D-20260905-07) `orchestrator.py`의 `SKIP_REASONS`가 모듈 전역인데
      `cmd_gates`가 거기에 값을 써 넣는다 (`["ISSUE"]` `["LINT"]` `["LAYOUT"]` 세 곳).
      상태 분기가 `elif gate in SKIP_REASONS`를 게이트별 분기보다 **먼저** 보므로,
      한 번 키가 써지면 같은 프로세스의 다음 호출에서 **실제 상태와 무관하게 그 게이트가
      SKIP으로 굳는다.** `skip_reason()`도 전역을 읽는다.
      재현 (잡 003, register의 `render_status`가 `PASS`인 상태):
      ```
      import orchestrator as o
      o.SKIP_REASONS["LAYOUT"] = "x"      # 앞선 호출이 남긴 것을 흉내
      o.cmd_gates(Path("~/deck-qa-jobs/job_20260830_003").expanduser())
      # → gates.json의 LAYOUT = "SKIP"  (직전 정상 호출에서는 "PASS")
      ```
      지금 CLI는 호출당 프로세스가 하나라 실사용에서는 안 걸린다. 다만 `e2e_check.py`나
      픽스처가 한 프로세스에서 `cmd_gates`를 두 번 이상 부르면 바로 나고, **잡 A의 SKIP 사유가
      잡 B로 샌다.** 검사했는데 SKIP으로 찍히는 형태라 L2 계열이다.
      고침: `cmd_gates` 첫머리에서 `reasons = dict(SKIP_REASONS)`를 만들어 읽기·쓰기를 그쪽으로만
      하고, `skip_reason()`이 그 dict를 인자로 받게 한다. 전역은 건드리지 않는다.
      처리 완료 (커밋 예정) — 사유표를 잡마다 사본으로 만들고 gates.json에 실었다.
      재현·확인: 낡은 검토 잡을 먼저 돌린 뒤 정상 잡을 같은 프로세스에서 돌려
      ISSUE가 SKIP으로 굳지 않는 것을 봤다. 전역은 변하지 않는다.



## 닫힌 항목

- [x] TO:USER `skill/` 원본 확보 → `9fd634a` (스킬 두 벌이 리포에 들어왔다)
- [x] TO:CODEX 검사기 갈림 검출 → `89e17fc`
      audit.py가 preflight.py의 FONTS_OK를 AST로 읽어 house-rules와 대조한다.
      원본은 안 고친다. 실측 확인: house-rules 글꼴을 바꾸니
      contract.preflight_fonts 이슈가 떴다

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
