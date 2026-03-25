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

echo "=== Tester Agent ==="
echo "Target: $TARGET"
echo "Workspace: $WORKSPACE"

exec claude --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --append-system-prompt "Available tools: $(ls "$AGENT_DIR/tools/")" \
  --append-system-prompt "Workspace: $WORKSPACE" \
  "$TARGET"
