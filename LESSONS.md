# LESSONS — 이미 겪은 오류

**같은 것을 두 번 고치지 않으려고 만든다.**
2026-08-30 하루에 "값이 두 군데 있어 갈라진" 오류를 **아홉 번** 고쳤다.
매번 커밋 메시지에는 적었는데 목록이 없으니 아무도 다시 읽지 않았다. 나 자신도.

## 쓰는 법

- **REVIEWER는 검토 전에 이 파일을 읽는다.** 아래 목록이 곧 체크리스트다 (`prompts/REVIEW.md`).
- **BUILDER는 새 부류의 오류를 고칠 때마다 한 줄 늘린다.** 두 번째 발생이면 횟수만 올린다.
- **가드 없는 줄은 `e2e_check.py`가 막는다.** 가드가 없으면 그 오류는 반드시 다시 난다.
  가드는 둘 중 하나다 — `스크립트`(결정적으로 재는 것) 또는 `판단`(REVIEWER가 보는 것).
  섞지 않는다. 스크립트로 잴 수 있는데 판단에 맡기면 사람이 놓친다.

| # | 부류 | 겪은 횟수 | 어떻게 드러났나 | 가드 | 종류 |
|---|---|---|---|---|---|
| L1 | 같은 규칙 값이 두 군데 있어 갈라진다 | 9 | 생성기와 검사기가 다른 판정 / 캔버스 이탈 / 오탐 22건 | `e2e_check.py:unenforced_drift` · `audit.py:check_preflight_alignment` | 스크립트 |
| L2 | 검사 안 한 것이 PASS로 찍힌다 | 3 | LAYOUT·ISSUE 게이트, 게이트 요약 "ALL PASS" | `orchestrator.py:review_lens_cover` · 상태 분기 | 스크립트 |
| L3 | 저장 관문을 우회한다 | 3 | 도형 ID 중복. 픽스처 20개 전부 | `deckkit.js:newPres`가 `writeFile` 직접 호출을 던진다 | 스크립트 |
| L4 | 원천에 없는 수를 만든다 | 1 | 비율 0.5339를 "53.4%"로 적었다 | `audit.py` `calc.source_manifest` | 스크립트 |
| L5 | 차트 안 숫자를 아무도 안 본다 | 1 | 값을 99.9로 바꿔도 audit·preflight 통과 | **없다** — 도형 기반 막대(`bars`)를 쓰면 claim에 걸린다 | 판단 |
| L6 | 결론이 그림에 없고 글로만 있다 | 1 | 상관 0.93이 캡션에만. CRITIC이 CRITICAL로 잡음 | `prompts/REVIEW.md` DESIGN 렌즈 | 판단 |
| L7 | 표가 표로 안 읽힌다 | 2 | 선 없는 큰 표에 값 두셋. 규칙은 다 지켰다 | `prompts/REVIEW.md` DESIGN 렌즈 | 판단 |
| L8 | 강조를 색에만 건다 | 1 | 흑백 인쇄에서 강조가 뒤집힌다 | `house-rules.yaml` `emphasis.color_alone_forbidden` | 판단 |
| L9 | 머리글과 값이 다른 행에서 온다 | 1 | `make_brief.py`가 4행 머리글에 18행 값을 붙였다 | `prompts/REVIEW.md` CONTENT 렌즈 | 판단 |
| L10 | 승인 대기를 놓친다 | 3 | opencode는 대기 중에도 `agent_status`가 `working` | `guard.sh` · `CLAUDE.md` 승인 절 | 스크립트 |
| L11 | 판단 결과가 화면에만 남아 사라진다 | 1 | CRITIC 지적 8건이 터미널 스크롤에 묻혔다 | `prompts/REVIEW.md` 출력 절 (`review_r{N}.json`) | 판단 |
| L12 | 새 도형 역할을 규칙에 등재 안 한다 | 2 | `stat/label` · `lag/text`가 `role_min_pt`에 없어 audit ERROR | `audit.py` `role_min_pt` 미정의 시 ERROR | 스크립트 |

## L1이 왜 아홉 번인가

계획서 2.14가 이걸 경계한 절인데도 아홉 번 났다. 목록으로 남긴다.

```
1  manifest valign 기본값     생성기 top / pptxgenjs middle        오탐 6건
2  칩 보조설명 폭 5.2in 하드코딩                                   캔버스 이탈
3  role_min_pt 누락                                              오탐 22건
4  각주 줄 간격                생성기 0.15 / 검사기 0.14
5  최상위 규칙 누출            2.17 이행 중 styles 아래로 못 내림
6  preflight FONTS_OK          house-rules 글꼴과 갈라질 여지
7  golden_deck.js tpl.R        2.17 뒤 남은 최상위 참조             생성 실패
8  deck.js 배너 "470"          claim 문자열로 조립해야 했다
9  sub() descW 3.4 하드코딩                                        칼럼 끝에 못 닿음
```

**공통점**: 값을 코드에 적는 순간 규칙과 갈라진다. 규칙에서 읽으면 안 난다.
새 값을 코드에 쓰기 전에 `house-rules.yaml`에 자리가 있는지 먼저 본다.
