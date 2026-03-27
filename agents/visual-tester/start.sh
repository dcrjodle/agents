#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$AGENT_DIR/../lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK_ID="${TASK_ID:-}"
PROJECT=$(json_field "$HANDOFF" "projectPath")
WORKTREE_PATH=$(json_field "$HANDOFF" "context.result.worktreePath" "")
TESTING_MODE=$(json_field "$HANDOFF" "context.testingMode" "sync")

TEST_PATH="${WORKTREE_PATH:-$PROJECT}"
if [ "$TEST_PATH" = "undefined" ] || [ -z "$TEST_PATH" ]; then
  TEST_PATH="$PROJECT"
fi

if [ -z "$TEST_PATH" ] || [ ! -d "$TEST_PATH" ]; then
  echo "[visual-tester] ERROR: No valid test path found" >&2
  emit_result '{"status":"failed","error":"No valid test path found"}'
  exit 1
fi

echo "[visual-tester] Visual testing in: $TEST_PATH (mode: $TESTING_MODE)" >&2
emit_status "Starting visual test ($TESTING_MODE mode)"

node "$AGENT_DIR/visual-test.mjs" \
  --worktreePath "$TEST_PATH" \
  --projectPath "$PROJECT" \
  --testingMode "$TESTING_MODE" \
  --taskId "$TASK_ID"

echo "[visual-tester] Done." >&2
