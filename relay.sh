#!/usr/bin/env bash
# relay.sh — HANDOFF.md 큐를 보고 에이전트를 순차 호출한다.
#
# 사용자가 세 세션을 번갈아 띄우고 결과를 옮기던 일을 대신한다.
# 기본은 --dry-run이다. 실제로 돌리려면 --go를 준다.
#
#   ./relay.sh                 # 누구에게 무슨 일이 있는지만 보여준다
#   ./relay.sh --go            # 최대 3라운드 돈다
#   ./relay.sh --go --rounds 1 # 한 바퀴만
#
# 왜 순차인가: 셋이 체크아웃 하나를 공유한다 (계획서 3.1).
# 동시에 돌리면 서로의 미커밋 작업을 덮는다.
#
# 멈추는 조건 (셋 중 하나라도 걸리면 사람을 부른다)
#   - 큐에 에이전트가 처리할 항목이 없다
#   - e2e_check.py가 FAIL이다
#   - 라운드 상한에 닿았다
set -uo pipefail
cd "$(dirname "$0")"

ROUNDS=3
GO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --go) GO=1 ;;
    --rounds) ROUNDS="$2"; shift ;;
    *) echo "모르는 인자: $1" >&2; exit 2 ;;
  esac
  shift
done

# 대상 → 실행 명령. 각 CLI의 비대화식 모드다.
run_agent() {
  case "$1" in
    BUILDER) claude -p "$2" ;;
    CODEX)   codex exec "$2" ;;
    PIPE)    gemini -p "$2" ;;
    *) echo "모르는 대상: $1" >&2; return 1 ;;
  esac
}

PROMPT='HANDOFF.md에서 너에게 온 미완 항목을 처리해라. 세션 규칙 파일을 먼저 읽어라.
담당 파일만 고치고, 담당 파일만 이름으로 지정해 커밋하고, 브랜치를 바꾸지 마라.
커밋 전에 python3 e2e_check.py를 돌려라. 끝나면 HANDOFF.md의 그 줄을 [x]로 바꾸고 커밋 해시를 적어라.'

open_for() { grep -c "^- \[ \] TO:$1 " HANDOFF.md 2>/dev/null || true; }

echo "== 큐 상태 =="
for who in BUILDER CODEX PIPE USER; do
  printf "  %-8s %s건\n" "$who" "$(open_for $who)"
done

if [ "$GO" -eq 0 ]; then
  echo
  echo "dry-run이다. 실제로 돌리려면 --go 를 준다."
  echo "USER 항목은 에이전트가 처리하지 않는다. 사람이 해야 끝난다."
  exit 0
fi

for round in $(seq 1 "$ROUNDS"); do
  echo
  echo "== 라운드 $round/$ROUNDS =="
  worked=0
  for who in CODEX PIPE BUILDER; do
    n="$(open_for $who)"
    [ "$n" -eq 0 ] && continue
    echo "-- $who ($n건)"
    run_agent "$who" "$PROMPT" || { echo "$who 호출 실패. 멈춘다."; exit 1; }
    worked=1
    if ! python3 e2e_check.py >/dev/null 2>&1; then
      echo "e2e FAIL — $who 작업 뒤에 깨졌다. 멈추고 사람을 부른다."
      python3 e2e_check.py | tail -20
      exit 1
    fi
  done
  if [ "$worked" -eq 0 ]; then
    echo "에이전트가 할 일이 없다. 남은 것은 USER 항목뿐이다."
    break
  fi
done

echo
echo "== 종료. 남은 큐 =="
grep "^- \[ \]" HANDOFF.md || echo "  없음"
