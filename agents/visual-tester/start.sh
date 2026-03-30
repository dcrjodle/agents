#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$AGENT_DIR/../lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

PROJECT=$(json_field "$HANDOFF" "projectPath")
TASKS_FILE=$(json_field "$HANDOFF" "tasksFile" "")

if [ -z "$PROJECT" ] || [ ! -d "$PROJECT" ]; then
  emit_result '{"status":"failed","error":"No valid project path found","results":[]}'
  exit 1
fi

echo "[visual-tester] Running standalone visual tests for: $PROJECT" >&2
emit_status "Starting visual tests"

node "$AGENT_DIR/visual-test.mjs" \
  --projectPath "$PROJECT" \
  --tasksFile "$TASKS_FILE"

echo "[visual-tester] Done." >&2
