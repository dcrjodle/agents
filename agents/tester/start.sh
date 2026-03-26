#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"
TASK_ID="${2:-}"

if [ -z "$TARGET" ]; then
  echo "Usage: ./start.sh \"<what to test>\" [task_id]"
  exit 1
fi

WORKSPACE="$AGENT_DIR/memory/runs/${TASK_ID:-$(date +%s)}"
mkdir -p "$WORKSPACE"

MAILBOX="${MAILBOX_DIR:-}"

echo "=== Tester Agent ==="
echo "Target: $TARGET"
echo "Workspace: $WORKSPACE"
[ -n "$MAILBOX" ] && echo "Mailbox: $MAILBOX"

MAILBOX_PROMPT=""
if [ -n "$MAILBOX" ]; then
  MAILBOX_PROMPT="$(cat <<EOF
## Mailbox Communication
Your mailbox directory: $MAILBOX
- Read your task details from: $MAILBOX/inbox/
- Write your results to: $MAILBOX/outbox/ as a JSON file (e.g. 001-result.json)
- Update your status at: $MAILBOX/status.json

When you finish, write a result file to your outbox with this format:
{"from":"tester","to":"coordinator","type":"result","payload":{"status":"complete","summary":"All tests passed","testResults":{"passed":0,"failed":0}}}

If tests fail:
{"from":"tester","to":"coordinator","type":"result","payload":{"status":"failed","summary":"...","error":"...","testResults":{"passed":0,"failed":0}}}
EOF
)"
fi

exec claude --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --append-system-prompt "Available tools: $(ls "$AGENT_DIR/tools/")" \
  --append-system-prompt "Workspace: $WORKSPACE" \
  ${MAILBOX:+--append-system-prompt "$MAILBOX_PROMPT"} \
  "$TARGET"
