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

echo "=== Githubber Agent ==="
echo "Action: $ACTION"
echo "Workspace: $WORKSPACE"

exec claude --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --append-system-prompt "Available tools: $(ls "$AGENT_DIR/tools/")" \
  --append-system-prompt "Workspace: $WORKSPACE" \
  "$ACTION"
