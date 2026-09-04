#!/usr/bin/env bash
# guard.sh — 검문 지점. 명령 하나하나가 아니라 "무엇이 바뀌었나"를 본다.
#
# 왜 이게 필요한가 (2026-08-30):
#   에이전트 명령을 한 건씩 승인하던 방식은 통제의 착각이었다. 하루에 20번
#   눌렀는데 정작 나쁜 장표가 그대로 나갔다. 눈은 명령에 가 있었고 결과에는
#   없었다. 승인 횟수는 통제의 양이 아니다.
#
#   그래서 읽기·검사 명령은 열어 주고(에이전트 샌드박스가 read-only),
#   쓰기는 승인으로 막고, **바뀐 것은 여기서 한 번에 본다.**
#   사용자가 맥북을 안 봐도 이 출력 하나로 상태가 드러나야 한다.
#
# 쓰는 때: 에이전트 작업이 끝났을 때, 커밋·푸시 전, 사용자에게 보고하기 전.
set -u
cd "$(dirname "$0")"
FAIL=0
say() { printf '%s\n' "$*"; }
bad() { printf '  [문제] %s\n' "$*"; FAIL=1; }

say "── 워킹트리 ──────────────────────────────"
CH="$(git status --short)"
if [ -z "$CH" ]; then say "  깨끗함"; else printf '%s\n' "$CH" | sed 's/^/  /'; fi

say ""
say "── origin과의 차이 ───────────────────────"
AHEAD="$(git log --oneline origin/main..HEAD 2>/dev/null)"
if [ -z "$AHEAD" ]; then say "  없음 (동기)"; else printf '%s\n' "$AHEAD" | sed 's/^/  /'; fi

say ""
say "── 담당 경계 (푸시 안 된 커밋) ────────────"
# 커밋마다 건드린 파일이 그 커밋의 주인 것인지 본다. 남의 파일이 섞이면 알린다.
git log --format='%h %s' origin/main..HEAD 2>/dev/null | while read -r h rest; do
  files="$(git show --name-only --format= "$h")"
  who="BUILDER"
  case "$rest" in Codex:*|CODEX*) who="CODEX" ;; PIPE:*) who="PIPE" ;; esac
  case "$who" in
    CODEX) stray="$(printf '%s\n' "$files" | grep -vE '^(audit\.py|render_check\.py|fixtures/|HANDOFF\.md|AGENTS\.md)' | grep -v '^$')" ;;
    *)     stray="" ;;
  esac
  [ -n "$stray" ] && { printf '  [문제] %s (%s) 담당 밖 파일:\n' "$h" "$who"; printf '%s\n' "$stray" | sed 's/^/      /'; }
done

say ""
say "── 잡 폴더·산출물이 새어 들어왔나 ─────────"
LEAK="$( { git status --short; git diff --name-only origin/main..HEAD 2>/dev/null; } \
        | grep -iE 'jobs/|\.pptx|\.xlsx|deck-qa' | grep -v '^!!' | grep -v 'skill/' )"
if [ -n "$LEAK" ]; then bad "실적 수치가 든 것이 리포에 들어왔다:"; printf '%s\n' "$LEAK" | sed 's/^/      /'
else say "  없음"; fi

say ""
say "── 지시와 결과가 짝을 이루나 ──────────────"
# Atlas의 checkpoint에서 빌린 것. 커밋을 그것을 만든 지시에 묶는다.
# 시켰는데 커밋이 없으면 잊혔거나 막힌 것이다 — 오늘 실제로 그런 일이 있었다.
if [ -d dispatch ]; then
  OPEN=0
  for f in dispatch/D-*.md; do
    [ -f "$f" ] || continue
    id="$(basename "$f" .md)"
    # 짝은 둘 중 하나다. 커밋에 번호를 적었거나, 지시 파일에 `## 결과`를 적었거나.
    # 잡 폴더 안에서만 끝나는 지시가 있다 — 잡은 커밋하지 않는 것이 규칙이라
    # 커밋만 보면 그런 지시는 영영 안 닫힌다 (2026-09-04에 D-20260904-02로 드러났다).
    if git log --all --oneline --grep="지시 $id" | head -1 | grep -q . \
       || grep -qE "^## 결과( |$)" "$f"; then :; else
      head -1 "$f" | sed "s|^# |  [결과 없음] |"; OPEN=$((OPEN+1))
    fi
  done
  [ "$OPEN" -eq 0 ] && say "  모든 지시에 결과가 있다 (커밋 번호 또는 지시 파일의 결과 절)" || say "  ↑ ${OPEN}건 — 잊혔거나 막혔거나, 결과를 아무데도 안 적었다"
else
  say "  (dispatch 폴더 없음)"
fi

say ""
say "── 검토 산출물 (에이전트가 낸 것) ─────────"
# 시켜 놓고 안 읽으면 소용없다. 2026-08-30 VERIFY가 파이프라인 구멍 8건을
# 파일로 냈는데 네 시간 묵혔다. 그중 하나는 게이트 전체를 무효로 만드는 것이었다.
# 여기서 매번 눈에 띄게 한다 — 새 파일이 있으면 읽고 나서 보고한다.
FOUND=0
for f in "$HOME"/deck-qa-jobs/*/review/review_r*.json \
         "$HOME"/deck-qa-jobs/*/review/critic_r*.json \
         "$HOME"/deck-qa-jobs/*/review/verify_*.md; do
  [ -f "$f" ] || continue
  FOUND=1
  n=$(python3 -c "import json,sys
try: print(len(json.load(open(sys.argv[1])).get('issues',[])), '건')
except Exception: print('(문서)')" "$f" 2>/dev/null || echo "(문서)")
  printf '  %s  %s  %s\n' "$(date -r "$f" '+%m-%d %H:%M')" "$n" "${f#$HOME/deck-qa-jobs/}"
done
[ "$FOUND" -eq 0 ] && say "  없음"

say ""
say "── 회귀 ─────────────────────────────────"
if OUT="$(python3 e2e_check.py 2>&1)"; then
  printf '%s\n' "$OUT" | tail -1 | sed 's/^/  /'
else
  bad "E2E 실패"; printf '%s\n' "$OUT" | grep FAIL | head -3 | sed 's/^/      /'
fi
if OUT="$(python3 audit.py fixtures/ 2>&1)"; then
  printf '%s\n' "$OUT" | tail -1 | sed 's/^/  /'
  printf '%s\n' "$OUT" | grep -q "EXPECTED MATCH" || bad "픽스처가 기대와 다르다"
else bad "픽스처 검사 실패"; fi

say ""
if [ "$FAIL" -eq 0 ]; then
  say "통과 — 사용자에게 보고해도 된다"
else
  say "막힘 — 위 문제를 먼저 처리한다"
  say ""
  say "  푸시하려면 ./guard.sh && git push origin main 으로 붙여 쓴다."
  say "  2026-09-01에 guard가 막았는데 ';'로 이어 붙여 그대로 푸시한 일이 있다."
  say "  main이 빨간불로 올라갔고 셋이 공유하는 리포라 다 같이 막혔다."
fi
exit "$FAIL"
