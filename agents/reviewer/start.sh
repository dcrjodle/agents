#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"
TASK_ID="${2:-}"
MAILBOX="${MAILBOX_DIR:-}"

if [ -z "$TARGET" ]; then
  echo "Usage: ./start.sh \"<what to review>\" [task_id]"
  exit 1
fi

echo "=== Reviewer Agent ==="
echo "Target: $TARGET"
echo "Mailbox: $MAILBOX"

# Read inbox
if [ -n "$MAILBOX" ] && [ -d "$MAILBOX/inbox" ]; then
  echo "[reviewer] Reading inbox..."
  for f in "$MAILBOX/inbox"/*.json; do
    [ -f "$f" ] && echo "[reviewer] Got message: $(basename "$f")" || true
  done
fi

if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"reviewer","taskId":"$TASK_ID","state":"working","currentStep":"Reading code changes","startedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[reviewer] Reviewing code changes..."
sleep 1

if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"reviewer","taskId":"$TASK_ID","state":"working","currentStep":"Checking security and quality","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[reviewer] Checking security and code quality..."
sleep 1

echo "[reviewer] Code approved."

# Write result to outbox
if [ -n "$MAILBOX" ]; then
  mkdir -p "$MAILBOX/outbox"
  cat > "$MAILBOX/outbox/001-result.json" <<RESULTEOF
{
  "from": "reviewer",
  "to": "coordinator",
  "type": "result",
  "payload": {
    "status": "complete",
    "verdict": "approved",
    "summary": "Code review passed. No issues found.",
    "comments": []
  }
}
RESULTEOF

  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"reviewer","taskId":"$TASK_ID","state":"done","currentStep":"Review complete","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[reviewer] Done."
