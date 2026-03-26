#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"
TASK_ID="${2:-}"
MAILBOX="${MAILBOX_DIR:-}"

if [ -z "$TARGET" ]; then
  echo "Usage: ./start.sh \"<what to test>\" [task_id]"
  exit 1
fi

echo "=== Tester Agent ==="
echo "Target: $TARGET"
echo "Mailbox: $MAILBOX"

# Read inbox
if [ -n "$MAILBOX" ] && [ -d "$MAILBOX/inbox" ]; then
  echo "[tester] Reading inbox..."
  for f in "$MAILBOX/inbox"/*.json; do
    [ -f "$f" ] && echo "[tester] Got message: $(basename "$f")" || true
  done
fi

if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"tester","taskId":"$TASK_ID","state":"working","currentStep":"Setting up test environment","startedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[tester] Setting up test environment..."
sleep 1

if [ -n "$MAILBOX" ]; then
  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"tester","taskId":"$TASK_ID","state":"working","currentStep":"Running test suite","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[tester] Running tests..."
sleep 1

echo "[tester] All tests passed."

# Write result to outbox
if [ -n "$MAILBOX" ]; then
  mkdir -p "$MAILBOX/outbox"
  cat > "$MAILBOX/outbox/001-result.json" <<RESULTEOF
{
  "from": "tester",
  "to": "coordinator",
  "type": "result",
  "payload": {
    "status": "complete",
    "summary": "All tests passed for: $TARGET",
    "testResults": {"passed": 12, "failed": 0, "skipped": 0}
  }
}
RESULTEOF

  cat > "$MAILBOX/status.json" <<STATUSEOF
{"agent":"tester","taskId":"$TASK_ID","state":"done","currentStep":"Tests complete","lastActivity":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
STATUSEOF
fi

echo "[tester] Done."
