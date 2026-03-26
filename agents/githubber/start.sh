#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-}"
TASK_ID="${2:-}"
MAILBOX="${MAILBOX_DIR:-}"

if [ -z "$ACTION" ]; then
  echo "Usage: ./start.sh \"<action description>\" [task_id]"
  exit 1
fi

echo "=== Githubber Agent ==="
echo "Action: $ACTION"
echo "Mailbox: $MAILBOX"

# Read inbox
if [ -n "$MAILBOX" ] && [ -d "$MAILBOX/inbox" ]; then
  echo "[githubber] Reading inbox..."
  for f in "$MAILBOX/inbox"/*.json; do
    [ -f "$f" ] && echo "[githubber] Got message: $(basename "$f")" || true
  done
fi

if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"githubber","taskId":"$TASK_ID","state":"working","currentStep":"Creating PR","startedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[githubber] Creating pull request..."
sleep 1

if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"githubber","taskId":"$TASK_ID","state":"working","currentStep":"Merging PR","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[githubber] Merging PR..."
sleep 1

echo "[githubber] PR merged successfully."

# Write result to outbox
if [ -n "$MAILBOX" ]; then
  mkdir -p "$MAILBOX/outbox"
  cat > "$MAILBOX/outbox/001-result.json" <<RESULTEOF
{
  "from": "githubber",
  "to": "coordinator",
  "type": "result",
  "payload": {
    "status": "complete",
    "summary": "PR created and merged for: $ACTION",
    "prUrl": "https://github.com/example/repo/pull/42"
  }
}
RESULTEOF

  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"githubber","taskId":"$TASK_ID","state":"done","currentStep":"PR merged","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[githubber] Done."
