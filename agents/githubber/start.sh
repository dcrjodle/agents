#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-}"
TASK_ID="${2:-}"

if [ -z "$ACTION" ]; then
  echo "Usage: ./start.sh \"<action description>\" [task_id]"
  exit 1
fi

WORKSPACE="$AGENT_DIR/memory/runs/${TASK_ID:-$(date +%s)}"
mkdir -p "$WORKSPACE"

MAILBOX="${MAILBOX_DIR:-}"

echo "=== Githubber Agent ==="
echo "Action: $ACTION"
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

When you finish, write a result file to your outbox:
{"from":"githubber","to":"coordinator","type":"result","payload":{"status":"complete","summary":"PR merged","prUrl":"..."}}

If the PR fails:
{"from":"githubber","to":"coordinator","type":"error","payload":{"message":"...","details":"...","recoverable":true}}
EOF
)"
fi

exec claude --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --append-system-prompt "Available tools: $(ls "$AGENT_DIR/tools/")" \
  --append-system-prompt "Workspace: $WORKSPACE" \
  ${MAILBOX:+--append-system-prompt "$MAILBOX_PROMPT"} \
  "$ACTION"
