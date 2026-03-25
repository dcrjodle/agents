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

echo "=== Planner Agent ==="
echo "Task: $TASK"
echo "Workspace: $WORKSPACE"

exec claude --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --append-system-prompt "Available tools: $(ls "$AGENT_DIR/tools/")" \
  --append-system-prompt "Workspace: $WORKSPACE" \
  "$TASK"
