#!/usr/bin/env bash
# ask.sh — 지정한 에이전트에게 지시 하나를 보낸다 (감독 통로).
#
# relay.sh는 "네 큐를 처리해라"라는 고정 프롬프트만 보내는 배치다.
# 이 파일은 그때그때 다른 지시를 보낼 때 쓴다. BUILDER가 폰 지시를 받아
# CODEX·VERIFY에게 일을 시키는 경로다 (계획서 3.3).
# PIPE(opencode)는 2026-08-30에 실행에서 뺐다 — 속도가 맞지 않았다.
#
#   ./ask.sh CODEX "audit.py의 render.* 규칙을 별도 게이트로 나눠라"
#   ./ask.sh VERIFY "잡 003의 PASS가 진짜인지 깨 봐라"
#   ./ask.sh CODEX --dry "..."      # 보낼 명령만 보여준다
#
# **띄워 둔 herdr 창에 넣는다.** `codex exec` / `opencode run`으로 헤드리스를 새로 띄우지 않는다.
# 헤드리스는 화면에 안 보여서 무엇을 하고 있는지 감독할 수 없다. 감독이 이 파일의 목적이다.
# 사람이 창을 보고 있으면 승인 프롬프트도 눈에 보이고 직접 답할 수 있다.
#
# 대상은 herdr pane id다. `herdr agent list`로 확인한다. 이름이 아니라 pane id여야 한다.
#   CODEX  codex 창    VERIFY  claude 창(name=verify)
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
TASK="${*:-}"

if [ -z "$WHO" ] || [ -z "$TASK" ]; then
  echo "사용: ./ask.sh <CODEX|VERIFY> [--dry] \"지시\"" >&2
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
  VERIFY) AGENT="verify" ;;
  PIPE)
    echo "PIPE는 실행에서 뺐다 (2026-08-30). 속도가 맞지 않았다." >&2
    echo "검증은 VERIFY, 검사기는 CODEX에게 시킨다." >&2; exit 2 ;;
  BUILDER)
    echo "BUILDER는 나다. 남에게 시키지 말고 직접 해라." >&2; exit 2 ;;
  *) echo "모르는 대상: $WHO  (CODEX | VERIFY)" >&2; exit 2 ;;
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

echo "== $WHO 에게 지시 =="
echo "$TASK"
echo
echo "창: $PANE ($AGENT)"
herdr agent prompt "$PANE" "$PREAMBLE$TASK" >/dev/null 2>&1 || {
  echo "창에 넣지 못했다. herdr agent list 로 상태를 본다." >&2; exit 3; }
echo "넣었다. 창에서 도는 중이다 — 화면으로 확인할 수 있다."
echo "  상태 보기: herdr agent get $PANE"
echo "  끝날 때까지 대기: herdr agent wait $PANE --until idle"
echo
echo "지시 뒤 회귀는 에이전트가 끝난 뒤에 돌린다:"
echo "  python3 e2e_check.py && git status --short"
exit 0
