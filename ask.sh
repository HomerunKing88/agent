#!/usr/bin/env bash
# ask.sh — 지정한 에이전트에게 지시 하나를 보낸다 (감독 통로).
#
# relay.sh는 "네 큐를 처리해라"라는 고정 프롬프트만 보내는 배치다.
# 이 파일은 그때그때 다른 지시를 보낼 때 쓴다. BUILDER가 폰 지시를 받아
# CODEX·REVIEW에게 일을 시키는 경로다 (계획서 3.3).
# PIPE(opencode)는 2026-08-30에 실행에서 뺐다 — 속도가 맞지 않았다.
#
#   ./ask.sh CODEX "audit.py의 render.* 규칙을 별도 게이트로 나눠라"
#   ./ask.sh REVIEW "잡 003 장표를 두 렌즈로 봐라"
#   ./ask.sh CODEX --dry "..."      # 보낼 명령만 보여준다
#
# **띄워 둔 herdr 창에 넣는다.** `codex exec` / `opencode run`으로 헤드리스를 새로 띄우지 않는다.
# 헤드리스는 화면에 안 보여서 무엇을 하고 있는지 감독할 수 없다. 감독이 이 파일의 목적이다.
# 사람이 창을 보고 있으면 승인 프롬프트도 눈에 보이고 직접 답할 수 있다.
#
# 대상은 herdr pane id다. `herdr agent list`로 확인한다. 이름이 아니라 pane id여야 한다.
#   CODEX  codex 창    REVIEW  claude 창(name=review)
#
# 승인 수위
#   창에서 도는 세션은 각 CLI가 이미 켜 둔 설정을 따른다.
#   PIPE는 리포의 opencode.json permission이 담당 파일 경계를 강제한다
#   (orchestrator.py / slack_bot.py 외 편집은 ask, push·switch·rm은 deny).
#
# 어느 쪽도 브랜치 전환·푸시·삭제를 무인으로 못 한다. 그건 폰으로 올라온다.
set -uo pipefail
cd "$(dirname "$0")"

WHO="${1:-}"
shift || true
DRY=0
if [ "${1:-}" = "--dry" ]; then DRY=1; shift; fi
# 긴 지시는 파일로 넣는다. 셸 인용으로 깨진 일이 있다 —
# 2026-09-01에 지시문의 백틱이 셸에서 실행돼 CODEX가 지시를 아예 못 받았다.
if [ "${1:-}" = "-f" ]; then
  [ -f "${2:-}" ] || { echo "지시 파일이 없다: ${2:-}" >&2; exit 2; }
  TASK_FILE="$2"; shift 2
fi
TASK="${*:-}"
[ -n "${TASK_FILE:-}" ] && TASK="$(cat "$TASK_FILE")"

if [ -z "$WHO" ] || [ -z "$TASK" ]; then
  echo "사용: ./ask.sh <CODEX|REVIEW> [--dry] [-f 파일 | \"지시\"]" >&2
  exit 2
fi

# 어느 에이전트든 담당 경계와 검사를 먼저 상기시킨다.
# 지시만 던지면 세션 규칙 파일을 안 읽고 남의 파일을 건드린다.
PREAMBLE='너는 이 리포의 에이전트 중 하나다. AGENTS.md 머리의 "너는 누구인가" 표로
자기 정체를 먼저 확인하고, 자기 담당 파일만 고쳐라.
커밋은 자기 담당 파일만 이름으로 지정한다. 브랜치를 바꾸지 마라.
커밋 전에 python3 e2e_check.py 를 돌려라. 실패하면 고치거나, 남의 담당이면
HANDOFF.md에 인계 줄을 남겨라.

지시:
'

# herdr 창에서 도는 에이전트를 pane id로 찾는다. 창을 새로 띄우지 않고 있는 창에 넣는다.
#
# 이름(name)을 먼저 본다. VERIFY도 claude이고 BUILDER(나)도 claude라
# 종류만으로는 구분되지 않는다. 종류로 찾으면 나 자신에게 지시를 보낸다.
# 이름이 없으면 종류로 떨어진다 — codex는 한 창뿐이라 그것으로 충분하다.
pane_of() {
  herdr agent list 2>/dev/null | python3 -c "
import json,sys
want = sys.argv[1]
agents = json.load(sys.stdin)['result']['agents']
for a in agents:
    if a.get('name') == want:
        print(a['pane_id']); sys.exit(0)
for a in agents:
    if a.get('agent') == want and not a.get('name'):
        print(a['pane_id']); sys.exit(0)
" "$1"
}

status_of() {
  herdr agent get "$1" 2>/dev/null | python3 -c "
import json,sys
print(json.load(sys.stdin)['result']['agent']['agent_status'])
"
}

case "$WHO" in
  CODEX)  AGENT="codex" ;;
  REVIEW|REVIEWER|VERIFY|CRITIC) AGENT="review" ;;   # 이름은 여럿, 창은 하나
  PIPE)
    echo "PIPE는 실행에서 뺐다 (2026-08-30). 속도가 맞지 않았다." >&2
    echo "검증은 VERIFY, 검사기는 CODEX에게 시킨다." >&2; exit 2 ;;
  BUILDER)
    echo "BUILDER는 나다. 남에게 시키지 말고 직접 해라." >&2; exit 2 ;;
  *) echo "모르는 대상: $WHO  (CODEX | REVIEW)" >&2; exit 2 ;;
esac

PANE="$(pane_of "$AGENT")"
if [ -z "$PANE" ]; then
  echo "$AGENT 창이 herdr에 없다. 창을 띄우고 다시 시도한다." >&2
  echo "  herdr agent list 로 확인한다." >&2
  exit 3
fi

if [ "$DRY" -eq 1 ]; then
  echo "herdr agent prompt $PANE <프롬프트>   ($AGENT 창)"
  echo "--- 프롬프트 ---"
  printf '%s%s\n' "$PREAMBLE" "$TASK"
  exit 0
fi

# 보내기 전에 창이 막혀 있는지 본다.
#
# 2026-09-03에 이것 때문에 지시가 통째로 사라졌다. 에이전트가 승인 대기로 멈춰
# 있으면 `herdr agent prompt`가 agent_blocked로 튕긴다. 그런데 이 스크립트가
# "못 넣었다"만 찍고 종료코드 0으로 끝나서, 나도 스크립트도 보냈다고 착각했다.
# 세 겹이 겹쳐 지시가 없어졌다 — 안 누른 승인 / 튕긴 전달 / 조용한 실패.
PRE_ST="$(status_of "$PANE")"
PRE_SCR="$(herdr agent read "$PANE" 2>/dev/null)"
if [ "$PRE_ST" = "blocked" ] || printf '%s' "$PRE_SCR" | grep -qE "Permission required|Press enter to confirm"; then
  echo "== 보낼 수 없다: $WHO 창이 승인 대기로 멈춰 있다 ==" >&2
  printf '%s\n' "$PRE_SCR" | tail -20 >&2
  echo "== 먼저 처리해라: herdr agent send-keys $PANE enter ==" >&2
  exit 4
fi

echo "== $WHO 에게 지시 =="
echo "$TASK"
echo
echo "창: $PANE ($AGENT)"
OUT="$(herdr agent prompt "$PANE" "$PREAMBLE$TASK" 2>&1)" || {
  echo "창에 넣지 못했다: $OUT" >&2; exit 3; }
printf '%s' "$OUT" | grep -q '"error"' && {
  echo "창에 넣지 못했다: $OUT" >&2; exit 3; }

# 도착 확인 — 넣었다고 찍고 실제로는 안 들어간 일이 있었다.
# 30초 안에 창이 움직이지 않으면 안 들어간 것으로 본다.
LANDED=0
for _ in 1 2 3 4 5 6; do
  sleep 5
  case "$(status_of "$PANE")" in working|blocked) LANDED=1; break;; esac
  herdr agent read "$PANE" 2>/dev/null | grep -qE "Permission required" && { LANDED=1; break; }
done
[ "$LANDED" -eq 1 ] || { echo "넣었는데 창이 움직이지 않는다. 직접 확인해라." >&2; exit 5; }
# ── 여기서 기다린다. 던지고 빠지지 않는다 ──────────────────────────
#
# 2026-09-03까지 지시만 넣고 다른 일을 하다가 에이전트를 승인 대기로 세워 둔 일이
# 반복됐다. 사용자가 "지시가 제대로 안 되고 있다"고 했다. 맞는 말이다.
# 규율로 세 번 실패했으니 구조를 바꾼다 — **결정할 것이 생길 때까지 이 명령이 안 끝난다.**
#
# 돌아오는 경우는 셋이다.
#   BLOCKED  승인이 필요하다. 무엇을 묻는지 같이 찍는다
#   DONE     끝났다. 마지막 출력을 찍는다
#   TIMEOUT  상한 시간(ASK_TIMEOUT, 기본 900초)을 넘겼다
#
# --no-wait 를 주면 옛 방식대로 던지고 끝낸다. 쓰지 마라. 그것 때문에 이 절이 생겼다.
if [ "${NO_WAIT:-0}" -eq 1 ]; then
  echo "넣었다 (기다리지 않음). herdr agent get $PANE 로 확인한다."
  exit 0
fi

LIMIT="${ASK_TIMEOUT:-900}"
DEADLINE=$(( $(date +%s) + LIMIT ))
SEEN_START=0
echo "지켜보는 중… (상한 ${LIMIT}초. 결정할 것이 생기면 돌아온다)"

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  sleep 8
  ST="$(status_of "$PANE")"
  SCR="$(herdr agent read "$PANE" 2>/dev/null)"

  # opencode·claude는 승인 대기 중에도 상태가 working으로 나온다. 화면을 같이 본다
  if printf '%s' "$SCR" | grep -qE "Permission required|Would you like|Press enter to confirm"; then
    echo "=== BLOCKED — 승인이 필요하다 ==="
    printf '%s\n' "$SCR" | tail -24
    echo "=== 승인하려면: herdr agent send-keys $PANE enter ==="
    exit 10
  fi

  [ "$ST" = "working" ] && SEEN_START=1
  case "$ST" in
    idle|done)
      # 지시가 아직 안 들어갔을 수 있다. 한 번도 working을 못 봤으면 더 기다린다
      if [ "$SEEN_START" -eq 1 ]; then
        echo "=== DONE ==="
        printf '%s\n' "$SCR" | tail -24
        exit 0
      fi
      ;;
  esac
done
echo "=== TIMEOUT (${LIMIT}초) — 사용자 입력이 필요할 수 있다 ==="
herdr agent read "$PANE" 2>/dev/null | tail -16
exit 11
echo
echo "지시 뒤 회귀는 에이전트가 끝난 뒤에 돌린다:"
echo "  python3 e2e_check.py && git status --short"
exit 0
