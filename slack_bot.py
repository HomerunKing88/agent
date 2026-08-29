#!/usr/bin/env python3
"""slack_bot.py — Socket Mode 봇. 계획서 6단계.

#deck-review 채널에서 스레드 하나 = 잡 하나다.
  [source.xlsx 업로드]  새 스레드 = job 생성
  ├ [brief.md 업로드]   같은 잡에 추가
  ├ "시작"               orchestrator 실행
  ├ 봇: 결과 + 결정 버튼
  ├ 사용자: 버튼         → review/user_decision.json 적재 (완료 조건 6단계)
  └ 봇: FINAL 파일 링크

봇 시작 시 마지막 처리 시각 이후의 채널 히스토리를 훑어 집 PC가 꺼져 있는 동안
올라온 파일을 회수한다. thread_ts ↔ job 매핑은 jobs_root 밖의 별도 파일에 둔다.

실행: python slack_bot.py
환경변수: SLACK_APP_TOKEN(Socket Mode), SLACK_BOT_TOKEN, SLACK_CHANNEL, DECK_JOBS_ROOT
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

# ── 설정 (모두 환경변수. 토큰을 코드에 두지 않는다) ─────────────────
CHANNEL = os.environ.get("SLACK_CHANNEL", "#deck-review")
JOBS_ROOT = Path(os.environ.get("DECK_JOBS_ROOT", "G:\\내 드라이브\\deck-qa-jobs"))
# thread_map.json은 잡 폴더(실적 수치)가 아닌, 매핑 정보만 담는 작은 파일이다
MAPPING = JOBS_ROOT.parent / "deck-qa-mapping.json"
ORCHESTRATOR = Path(__file__).with_name("orchestrator.py")
SOURCE_FILE = "source.xlsx"
BRIEF_FILE = "brief.md"

app = App(token=os.environ["SLACK_BOT_TOKEN"])


# ── thread_ts ↔ job 매핑 (디스크에 유지. 재시작/전원 복구에도 보존) ──
def load_mapping() -> dict:
    if not MAPPING.exists():
        return {}
    return json.loads(MAPPING.read_text(encoding="utf-8"))


def save_mapping(mapping: dict) -> None:
    MAPPING.parent.mkdir(parents=True, exist_ok=True)
    MAPPING.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")


def job_for(user_id: str, thread_ts: str) -> Path:
    """스레드가 없으면 잡을 새로 만든다. 시간순 잎에 job_YYYYMMDD_NNN."""
    mapping = load_mapping()
    key = f"{user_id}:{thread_ts}"
    if key in mapping:
        return Path(mapping[key])

    stamp = time.strftime("%Y%m%d")
    existing = [p for p in JOBS_ROOT.glob(f"job_{stamp}_*") if p.is_dir()]
    seq = len(existing) + 1
    job = JOBS_ROOT / f"job_{stamp}_{seq:03d}"
    job.mkdir(parents=True, exist_ok=True)
    for sub in ("source", "builder", "review", "revision", "final"):
        (job / sub).mkdir(exist_ok=True)

    mapping[key] = str(job)
    save_mapping(mapping)
    return job


def download(client, file_info: dict, dest: Path) -> Path:
    import requests
    url = file_info["url_private"]
    resp = requests.get(url, headers={"Authorization": f"Bearer {client.token}"}, timeout=60)
    resp.raise_for_status()
    local = dest / file_info["name"]
    local.write_bytes(resp.content)
    return local


# ── 파일 수신: source.xlsx → 잡 생성, brief.md → 같은 잡에 추가 ────
@app.event("message")
def on_message(client, event, say):
    thread = event.get("thread_ts") or event["ts"]
    user = event.get("user") or event.get("bot_id") or "unknown"
    job = job_for(user, thread)

    if event.get("files"):
        for f in event["files"]:
            name, dest = f["name"], None
            if name == SOURCE_FILE:
                dest = job / "source"
            elif name == BRIEF_FILE:
                dest = job / "source"
            if dest:
                download(client, f, dest)
                await_say(say, thread, f"받았습니다: {name} → `{job.name}`")
                continue
            await_say(say, thread, f"못 알아보는 파일: `{name}` (source.xlsx / brief.md 만 받습니다)")

    text = (event.get("text") or "").strip()
    if text == "시작":
        if not (job / "source" / SOURCE_FILE).exists():
            await_say(say, thread, "먼저 source.xlsx를 올려 주세요.")
            return
        result = run_orchestrator(job)
        await_say(say, thread, result)
        post_decision_buttons(client, thread)


def await_say(say, thread, text: str) -> None:
    say(text, thread_ts=thread)


def run_orchestrator(job: Path) -> str:
    """orchestrator.py를 콜드 스타트로 호출한다. 상태는 디스크에 있다."""
    try:
        subprocess.run([sys.executable, str(ORCHESTRATOR), str(job)],
                       check=True, capture_output=True, text=True)
        return f"잡 `{job.name}`: 검사 완료. 아래에서 선택해 주세요."
    except subprocess.CalledProcessError as error:
        return f"실패: {error.stderr.strip() or error}"


def post_decision_buttons(client, thread_ts: str):
    client.chat_postMessage(
        channel=CHANNEL,
        thread_ts=thread_ts,
        text="결정이 필요한 항목입니다:",
        blocks=[{
            "type": "section",
            "text": {"type": "mrkdwn", "text": "게이트 차단 항목 처리 방식을 고르세요."},
        }, {
            "type": "actions",
            "elements": [
                {"type": "button", "text": {"type": "plain_text", "text": "승인 · 반영"},
                 "action_id": "decision_approve", "value": thread_ts},
                {"type": "button", "text": {"type": "plain_text", "text": "기각 · 사유 기록"},
                 "action_id": "decision_reject", "value": thread_ts},
            ],
        }],
    )


@app.action("decision_approve")
@app.action("decision_reject")
def on_decision(ack, body, say):
    ack()
    thread_ts = body["actions"][0]["value"]
    user = body["user"]["id"]
    mapping = load_mapping()
    job = next((Path(v) for k, v in mapping.items() if k.endswith(thread_ts)), None)
    if not job:
        say("잡을 찾지 못했습니다.", thread_ts=thread_ts)
        return
    choose = body["actions"][0]["action_id"]
    # 버튼은 라우터의 USER_DECISION 버킷 전체에 대한 결정이다. 대상 항목은
    # route_result.json에서 읽는다 (계획서 2.7·6.3 — 채택 ACC, 기각 REJ).
    route = json.loads((job / "review" / "route_result.json").read_text(encoding="utf-8"))
    pending = route.get("buckets", {}).get("USER_DECISION", [])
    action = "ACC" if choose == "decision_approve" else "REJ"
    decision = {
        "job": job.name,
        "thread_ts": thread_ts,
        "user": user,
        "choice": action,
        "at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "items": [{"id": item_id, "action": action, "note": ""} for item_id in pending],
    }
    path = job / "review" / "user_decision.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(decision, ensure_ascii=False, indent=2), encoding="utf-8")
    mention = f"<@{user}>" if user.startswith(("U", "W")) else "사용자"
    say(f"{mention} 결정 기록: {len(pending)}건 모두 {action} → `{job.name}/review/user_decision.json`",
        thread_ts=thread_ts)


# ── 놓친 파일 회수 (계획서 6단계) ───────────────────────────────────
def recover(client, after_ts: str | None) -> int:
    """봇이 죽어 있는 동안 올라온 파일을 conversations.history로 훑는다."""
    import datetime as dt
    latest = after_ts
    cursor = None
    count = 0
    while True:
        result = client.conversations_history(channel=CHANNEL, cursor=cursor, limit=200)
        for msg in result.get("messages", []):
            if after_ts and msg["ts"] <= after_ts:
                return count
            latest = max(latest or msg["ts"], msg["ts"])
            if msg.get("files"):
                user = msg.get("user") or "recovered"
                job = job_for(user, msg.get("thread_ts") or msg["ts"])
                for f in msg["files"]:
                    if f["name"] in (SOURCE_FILE, BRIEF_FILE):
                        download(client, f, job / "source")
                        count += 1
        cursor = result.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            break
    print(f"recovered {count} file(s)")
    return count


def main() -> None:
    checkpoint = MAPPING.with_suffix(".last")
    last = checkpoint.read_text() if checkpoint.exists() else None
    recover(app.client, last)
    checkpoint.write_text(time.strftime("%Y-%m-%dT%H:%M:%S"))
    handler = SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])
    handler.start()


if __name__ == "__main__":
    main()