# BUILDER → PIPE 전달사항

작성일: 2026-08-29
대상: PIPE (`orchestrator.py`, `slack_bot.py`)
관련: `claude/step4-shape-naming`, `c26ccd1`

## 1. 조치 요청: 게이트 오배선. 사용자가 잘못된 곳을 보게 된다

잡 하나를 `build → review → route → gates → report`까지 돌렸다.
audit은 **PASS, 이슈 0건**이고 EDITOR 지적 2건(MAJOR)만 있는 상태였는데
사용자가 받는 `QA_REPORT.md`가 이렇게 나온다.

```
## Gates
BLOCKING: HOUSE
PASS    : SOURCE, CALC, XREF, TOKEN, LAYOUT, LINT, ISSUE
```

**HOUSE가 막혔다고 나오지만 하우스 규칙 위반은 0건이다.**
막은 것은 EDITOR의 판단성 지적 둘이다. 계획서 8절상 그건 `ISSUE` 게이트다.
이 보고서를 받은 사용자는 폰트·정렬·각주 좌표를 뒤지게 된다. 거기엔 아무것도 없다.

### 원인

`gate_of()`가 매핑에 없는 rule을 전부 `HOUSE`로 떨어뜨린다 (`orchestrator.py:366`).
EDITOR 이슈에는 `rule` 키가 아예 없어서 `""`가 넘어가고, 그대로 HOUSE가 된다.

### 실측 — audit.py가 내는 rule 전부

```
claim.cross_page_consistency        → XREF     OK
claim.source_manifest_pptx          → SOURCE   OK
claim.unregistered_numeric_token    → HOUSE    TOKEN 이어야 한다
forbidden.negative_red              → HOUSE    OK
forbidden.third_font                → HOUSE    OK
layout.canvas_overflow              → LAYOUT   OK
notation.negative_forbidden         → HOUSE    OK
qa.text_max_ymax_pt                 → LAYOUT   OK
sizes.body_min_pt                   → HOUSE    OK
table.colw_sum_must_equal_width     → HOUSE    OK
table.header_align                  → HOUSE    OK
zones.content_max_y                 → HOUSE    LAYOUT 쪽이 맞아 보인다
zones.footnote_bottom_y             → HOUSE    OK
zones.title_right_clear             → HOUSE    OK
(EDITOR 이슈, rule 키 없음)          → HOUSE    ISSUE 여야 한다
```

**여덟 게이트 중 넷이 한 번도 안 울린다: `CALC` `TOKEN` `LINT` `ISSUE`.**

- `LINT` — 정상이다. `lint_deck.js`가 계획서 9절 보류 항목이다.
- `TOKEN` — 매핑 접두사가 `"token."`인데 실제 rule은 `claim.unregistered_numeric_token`이다.
  픽스처 09가 이 검사를 고정해 뒀으니 실제로 터지는 검사인데 게이트는 HOUSE로 뜬다.
- `ISSUE` — EDITOR 경로가 매핑에 없다. 그런데 `cmd_gates`의 주석은
  "사용자가 기각(REJ) 처리한 항목은 ISSUE 게이트를 통과시킨다"고 적혀 있다.
  의도는 있었는데 매핑이 빠진 것으로 보인다.
- `CALC` — audit이 계산 불일치를 `claim.source_manifest_pptx`로 낸다.
  SOURCE에 합친 설계라면 계획서 8절의 게이트 표를 고쳐야 한다.
  별도로 둘 거면 Codex가 rule 이름을 나눠야 한다. **판단이 필요하다.**

### 권고

1. `RULE_TO_GATE`에 EDITOR 경로를 넣는다. `rule`이 없고 `type`이 있으면 `ISSUE`다.
   `house-rules.yaml`의 `issues.editor_types` 다섯 개가 그 목록이다.
2. `claim.unregistered_numeric_token` → `TOKEN`.
   매핑을 고치든 Codex가 rule 이름을 `token.`으로 바꾸든 한 쪽이면 된다.
   어휘가 두 곳에 있는 문제라 **어느 쪽에서 고칠지 Codex와 정해 달라.**
3. `gate_of()`의 기본값을 `HOUSE`에서 빼는 편이 안전하다.
   지금은 새 rule이 생길 때마다 조용히 HOUSE로 들어가고 아무도 모른다.
   매핑에 없으면 그 사실이 보이게 하는 게 2.16-7(조용한 PASS 금지)에 맞다.
4. `zones.content_max_y`는 본문 하단 이탈이다. 8절 HOUSE 정의
   ("폰트 2종, 음수 부호, 표 정렬, 각주 좌표, 본문 하한 pt")에 없고 LAYOUT에 가깝다.

### 재현

```bash
python3 orchestrator.py <잡> build
# <잡>/review/editor_r1.json 에 MAJOR 이슈를 넣는다 (schemas/editor.py로 형식 확인)
python3 orchestrator.py <잡> review
python3 orchestrator.py <잡> gates
```

### 완료 조건

- audit 이슈 0건 + EDITOR MAJOR 2건인 잡에서 `BLOCKING: ISSUE`가 나온다.
- 미등록 숫자 토큰 결함이 있는 잡에서 `BLOCKING: TOKEN`이 나온다.

## 2. EDITOR 응답 검증을 태워 달라 (8단계)

`cmd_review`가 `editor_rN.json`을 그대로 병합한다. 어휘 밖 지적이 게이트까지 흘러간다.

```python
from schemas.editor import validate
kept, dropped = validate(read_json(p["editor"]), rules)
```

- 전부 아니면 전무가 아니다. 계획서 6.3이 "그 이슈만 버린다"고 해서 이슈 단위로 나눈다.
- `dropped`는 `{"raw": 원문, "errors": [...]}` 꼴이다. 원문을 남기는 이유는
  무엇이 왜 버려졌는지 로그에서 봐야 하기 때문이다.
- **재시도 1회와 로그 적재는 orchestrator 몫이다.** 검증기는 판정만 한다.
- 개수 상한(CRITICAL 3, MAJOR 5) 초과는 조용히 자르지 않고 `dropped`에 반려로 넣는다.
  자르면 사용자가 못 본 지적이 생긴다.

프롬프트는 `prompts/EDITOR.md`, 어휘는 `house-rules.yaml`의 `issues` 절이다.

## 3. manifest 형식 검증도 있다 (선택)

`schemas/manifest.py`의 `validate(payload, rules) -> list[str]`.
`cmd_build` 뒤에 태우면 형식 오류가 검사 단계 전에 잡힌다. 급하지 않다.

## 4. 확인한 것

`cmd_build`가 `HOUSE_RULES`와 `NODE_PATH`를 리포로 가리키는 것 확인했다.
잡 폴더에 규칙 사본을 만들지 않는 설계가 맞다.
`template.js`를 잡에 복사하는 것도 문제없다 — 매 빌드마다 새로 복사되고
manifest에 `template_version`이 박혀 추적된다.

`build → review → route → gates → report` 전 구간이 돈다.
`route`가 `AUTO_FIX 0 / USER_DECISION 1 / REVIEW_ONLY 1`로 갈랐고,
사용자에게 올라가는 건 `USER_DECISION` 하나다. 2.7 그대로다.

## 5. 담당 경계

`orchestrator.py`는 PIPE 담당이라 고치지 않았다. 위 넷 다 보고만 한다.
BUILDER 담당은 `template.js` `deck.js` `schemas/` `prompts/`다.
