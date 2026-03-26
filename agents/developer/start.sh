#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$AGENT_DIR/../lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK=$(json_field "$HANDOFF" "instruction")
TASK_ID="${TASK_ID:-}"
PROJECT=$(json_field "$HANDOFF" "projectPath")
PLAN_MARKDOWN=$(json_field "$HANDOFF" "context.plan.markdown")
REVIEW_FEEDBACK=$(json_field "$HANDOFF" "context.error" "")
EXISTING_WORKTREE=$(json_field "$HANDOFF" "context.result.worktreePath" "")
EXISTING_BRANCH=$(json_field "$HANDOFF" "context.result.branchName" "")
RETRY_COUNT=$(json_field "$HANDOFF" "context.retries" "0")

if [ -z "$TASK" ] || [ "$TASK" = "undefined" ]; then
  TASK="${TASK_DESCRIPTION:-}"
fi

if [ -z "$PROJECT" ] || [ "$PROJECT" = "undefined" ]; then
  echo "[developer] ERROR: No project path provided" >&2
  exit 1
fi

emit_status "Creating worktree"

# Create or reuse worktree for isolated work
BRANCH_NAME="${EXISTING_BRANCH:-task/${TASK_ID}}"

if [ -n "$EXISTING_WORKTREE" ] && [ "$EXISTING_WORKTREE" != "undefined" ] && [ -d "$EXISTING_WORKTREE" ]; then
  echo "[developer] Reusing existing worktree: $EXISTING_WORKTREE" >&2
  WORKTREE_PATH="$EXISTING_WORKTREE"
else
  echo "[developer] Creating worktree: $BRANCH_NAME" >&2
  source "$AGENT_DIR/tools/create-worktree.sh"
  WORKTREE_PATH=$(create_worktree "$PROJECT" "$BRANCH_NAME" 2>&1 | tail -1)
fi

echo "[developer] Working in: $WORKTREE_PATH" >&2

emit_status "Implementing changes"

# Build the prompt for claude
RETRY_SECTION=""
if [ -n "$REVIEW_FEEDBACK" ] && [ "$REVIEW_FEEDBACK" != "null" ] && [ "$REVIEW_FEEDBACK" != "undefined" ]; then
  RETRY_SECTION="
## REVIEWER FEEDBACK (RETRY $RETRY_COUNT)
The reviewer rejected your previous changes. You MUST address ALL of these issues:

$REVIEW_FEEDBACK

CRITICAL: Do NOT delete or remove any existing code, routes, imports, or functionality
that was not mentioned in the plan. Only ADD or MODIFY what the plan requires.
Read the existing files carefully before making changes to avoid regressions.
"
fi

PROMPT="You are a developer agent. Implement the following task in the worktree.

Task: $TASK
Project path: $PROJECT
Worktree path: $WORKTREE_PATH

Plan from planner:
$PLAN_MARKDOWN
$RETRY_SECTION
IMPORTANT:
- Work ONLY within the worktree at: $WORKTREE_PATH
- Implement all changes described in the plan
- Do NOT delete or remove any existing routes, imports, or functionality not mentioned in the plan
- Read existing files BEFORE modifying them to understand current structure
- Commit your changes with a descriptive message
- Output a summary of all files you changed
"

echo "[developer] Implementing with Claude..." >&2

# Run claude to implement (stderr goes to UI)
DEV_OUTPUT=$(echo "$PROMPT" | ${CLAUDE_CLI:-claude} --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
  2>&2) || true

echo "[developer] Implementation complete." >&2

# Get list of changed files in the worktree
FILES_CHANGED="[]"
if [ -d "$WORKTREE_PATH" ]; then
  FILES_CHANGED=$(cd "$WORKTREE_PATH" && git diff --name-only main...HEAD 2>/dev/null | node -e "
const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
console.log(JSON.stringify(lines));
" 2>/dev/null || echo "[]")
fi

SUMMARY_JSON=$(echo "$DEV_OUTPUT" | json_escape)
WORKTREE_JSON=$(json_escape_str "$WORKTREE_PATH")
BRANCH_JSON=$(json_escape_str "$BRANCH_NAME")

emit_result "{\"status\":\"complete\",\"summary\":$SUMMARY_JSON,\"filesChanged\":$FILES_CHANGED,\"worktreePath\":$WORKTREE_JSON,\"branchName\":$BRANCH_JSON}"

echo "[developer] Done." >&2
