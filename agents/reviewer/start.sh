#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"
TASK_ID="${2:-}"

if [ -z "$TARGET" ]; then
  echo "Usage: ./start.sh \"<what to review>\" [task_id]"
  exit 1
fi

WORKSPACE="$AGENT_DIR/memory/runs/${TASK_ID:-$(date +%s)}"
mkdir -p "$WORKSPACE"

MAILBOX="${MAILBOX_DIR:-}"

echo "=== Reviewer Agent ==="
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

When you approve, write a result file to your outbox:
{"from":"reviewer","to":"coordinator","type":"result","payload":{"status":"complete","verdict":"approved","summary":"Code looks good"}}

When requesting changes:
{"from":"reviewer","to":"coordinator","type":"feedback","payload":{"verdict":"changes_requested","comments":["..."],"severity":"minor"}}
EOF
)"
fi

exec claude --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --append-system-prompt "Available tools: $(ls "$AGENT_DIR/tools/")" \
  --append-system-prompt "Workspace: $WORKSPACE" \
  ${MAILBOX:+--append-system-prompt "$MAILBOX_PROMPT"} \
  "$TARGET"
