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
WORKTREE_PATH=$(json_field "$HANDOFF" "context.result.worktreePath" "")
RETRY_COUNT=$(json_field "$HANDOFF" "context.retries" "0")

if [ -z "$TASK" ] || [ "$TASK" = "undefined" ]; then
  TASK="${TASK_DESCRIPTION:-}"
fi

if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "undefined" ] || [ ! -d "$WORKTREE_PATH" ]; then
  echo "[developer] ERROR: No valid worktree path provided" >&2
  emit_result '{"status":"failed","error":"No valid worktree path — branching script must run first"}'
  exit 1
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
- Do NOT run any git commands (no git add, commit, push, etc.) — git is handled separately
- Output a summary of all files you changed
"

echo "[developer] Implementing with Claude..." >&2

# Run claude to implement (stderr goes to UI)
DEV_OUTPUT=$(echo "$PROMPT" | ${CLAUDE_CLI:-claude} --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
  2>&2) || true

echo "[developer] Implementation complete." >&2

SUMMARY_JSON=$(echo "$DEV_OUTPUT" | json_escape)

emit_result "{\"status\":\"complete\",\"summary\":$SUMMARY_JSON}"

echo "[developer] Done." >&2
