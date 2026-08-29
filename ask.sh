#!/usr/bin/env bash
# ask.sh — 지정한 에이전트에게 지시 하나를 보낸다 (감독 통로).
#
# relay.sh는 "네 큐를 처리해라"라는 고정 프롬프트만 보내는 배치다.
# 이 파일은 그때그때 다른 지시를 보낼 때 쓴다. BUILDER가 폰 지시를 받아
# CODEX·PIPE에게 일을 시키는 경로다 (계획서 3.3).
#
#   ./ask.sh CODEX "audit.py의 render.* 규칙을 별도 게이트로 나눠라"
#   ./ask.sh PIPE  "cmd_report에 SKIP 사유를 한 줄씩 적어라"
#   ./ask.sh CODEX --dry "..."      # 보낼 명령만 보여준다
#
# 승인 수위
#   CODEX  --sandbox workspace-write --approve-for-me
#          리포 밖으로 못 나간다. 승인은 자동 심사로 흐른다.
#   PIPE   opencode.json의 permission이 담당 파일 경계를 강제한다.
#          orchestrator.py / slack_bot.py 외 편집은 ask, push·switch·rm은 deny.
#          --auto는 쓰지 않는다. 그걸 켜면 permission이 무의미해진다.
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
  echo "사용: ./ask.sh <CODEX|PIPE> [--dry] \"지시\"" >&2
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

run_codex() {
  codex exec --sandbox workspace-write --approve-for-me "$1"
}
run_pipe() {
  opencode run "$1"
}

case "$WHO" in
  CODEX) CMD="codex exec --sandbox workspace-write --approve-for-me" ;;
  PIPE)  CMD="opencode run" ;;
  BUILDER)
    echo "BUILDER는 나다. 남에게 시키지 말고 직접 해라." >&2; exit 2 ;;
  *) echo "모르는 대상: $WHO  (CODEX | PIPE)" >&2; exit 2 ;;
esac

if [ "$DRY" -eq 1 ]; then
  echo "$CMD <프롬프트>"
  echo "--- 프롬프트 ---"
  printf '%s%s\n' "$PREAMBLE" "$TASK"
  exit 0
fi

echo "== $WHO 에게 지시 =="
echo "$TASK"
echo
case "$WHO" in
  CODEX) run_codex "$PREAMBLE$TASK" ;;
  PIPE)  run_pipe  "$PREAMBLE$TASK" ;;
esac
status=$?

echo
echo "== 지시 뒤 회귀 =="
if python3 e2e_check.py >/dev/null 2>&1; then
  echo "  E2E PASS"
else
  echo "  E2E FAIL — 아래를 보고 판단한다"
  python3 e2e_check.py 2>&1 | tail -20
  exit 1
fi
git status --short
exit $status
