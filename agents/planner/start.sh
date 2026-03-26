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

echo "=== Planner Agent ==="
echo "Task: $TASK"
echo "Mailbox: $MAILBOX"

# Read inbox
if [ -n "$MAILBOX" ] && [ -d "$MAILBOX/inbox" ]; then
  echo "[planner] Reading inbox..."
  for f in "$MAILBOX/inbox"/*.json; do
    [ -f "$f" ] && echo "[planner] Got message: $(basename "$f")" || true
  done
fi

# Update status
if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"planner","taskId":"$TASK_ID","state":"working","currentStep":"Analyzing requirements","startedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[planner] Analyzing task: $TASK"
sleep 1

# Update status mid-work
if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"planner","taskId":"$TASK_ID","state":"working","currentStep":"Creating implementation plan","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[planner] Creating plan..."
sleep 1

echo "[planner] Plan complete."

# Write result to outbox
if [ -n "$MAILBOX" ]; then
  mkdir -p "$MAILBOX/outbox"
  cat > "$MAILBOX/outbox/001-result.json" <<RESULTEOF
{
  "from": "planner",
  "to": "coordinator",
  "type": "result",
  "payload": {
    "status": "complete",
    "summary": "Created implementation plan for: $TASK",
    "plan": {
      "steps": [
        {"name": "Implement core logic", "complexity": "medium"},
        {"name": "Add error handling", "complexity": "low"},
        {"name": "Write tests", "complexity": "low"}
      ]
    }
  }
}
RESULTEOF

  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"planner","taskId":"$TASK_ID","state":"done","currentStep":"Plan delivered","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[planner] Done."
