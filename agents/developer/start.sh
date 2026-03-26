#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
TASK="${1:-}"
TASK_ID="${2:-}"
MAILBOX="${MAILBOX_DIR:-}"

if [ -z "$TASK" ]; then
  echo "Usage: ./start.sh \"<task description>\" [task_id]"
  exit 1
fi

echo "=== Developer Agent ==="
echo "Task: $TASK"
echo "Mailbox: $MAILBOX"

# Read inbox
if [ -n "$MAILBOX" ] && [ -d "$MAILBOX/inbox" ]; then
  echo "[developer] Reading inbox..."
  for f in "$MAILBOX/inbox"/*.json; do
    [ -f "$f" ] && echo "[developer] Got message: $(basename "$f")" || true
  done
fi

# Update status
if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"developer","taskId":"$TASK_ID","state":"working","currentStep":"Reading task spec","startedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[developer] Reading plan and task spec..."
sleep 1

if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"developer","taskId":"$TASK_ID","state":"working","currentStep":"Writing implementation","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[developer] Writing code..."
sleep 1

echo "[developer] Implementation complete."

# Write result to outbox
if [ -n "$MAILBOX" ]; then
  mkdir -p "$MAILBOX/outbox"
  cat > "$MAILBOX/outbox/001-result.json" <<RESULTEOF
{
  "from": "developer",
  "to": "coordinator",
  "type": "result",
  "payload": {
    "status": "complete",
    "summary": "Implemented feature for: $TASK",
    "filesChanged": ["src/feature.js", "src/utils.js"],
    "notes": "Added error handling and input validation"
  }
}
RESULTEOF

  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"developer","taskId":"$TASK_ID","state":"done","currentStep":"Code delivered","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[developer] Done."
