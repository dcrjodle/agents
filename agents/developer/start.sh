#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
TASK="${1:-}"
TASK_ID="${2:-}"

if [ -z "$TASK" ]; then
  echo "Usage: ./start.sh \"<task description>\" [task_id]"
  exit 1
fi

WORKSPACE="$AGENT_DIR/memory/runs/${TASK_ID:-$(date +%s)}"
mkdir -p "$WORKSPACE"

# Mailbox directory is passed by the coordinator via MAILBOX_DIR env var
MAILBOX="${MAILBOX_DIR:-}"

echo "=== Developer Agent ==="
echo "Task: $TASK"
echo "Workspace: $WORKSPACE"
[ -n "$MAILBOX" ] && echo "Mailbox: $MAILBOX"

MAILBOX_ARGS=""
if [ -n "$MAILBOX" ]; then
  MAILBOX_ARGS="--append-system-prompt"
  MAILBOX_PROMPT="$(cat <<EOF
## Mailbox Communication
Your mailbox directory: $MAILBOX
- Read your task details from: $MAILBOX/inbox/
- Write your results to: $MAILBOX/outbox/ as a JSON file (e.g. 001-result.json)
- Update your status at: $MAILBOX/status.json

When you finish, write a result file to your outbox with this format:
{"from":"developer","to":"coordinator","type":"result","payload":{"status":"complete","summary":"...","filesChanged":["..."],"notes":"..."}}

If you encounter an error you cannot recover from:
{"from":"developer","to":"coordinator","type":"error","payload":{"message":"...","details":"...","recoverable":false}}
EOF
)"
fi

exec claude --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --append-system-prompt "Available tools: $(ls "$AGENT_DIR/tools/")" \
  --append-system-prompt "Workspace: $WORKSPACE" \
  ${MAILBOX:+--append-system-prompt "$MAILBOX_PROMPT"} \
  "$TASK"
