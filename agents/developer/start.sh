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
The reviewer rejected your previous changes. You MUST address ALL of the issues listed below.

$REVIEW_FEEDBACK

RETRY INSTRUCTIONS:
1. Read each file mentioned in the feedback to see its CURRENT state in the worktree
2. Identify the SPECIFIC lines/sections the reviewer flagged
3. Use the Edit tool to make ONLY the fixes requested — do not rewrite files
4. If the reviewer says something is missing (e.g. an import, prop, or function), add it back surgically
5. Do NOT claim 'no changes needed' unless you have verified every issue is resolved by reading the files
"
fi

PROMPT="You are a developer agent. Implement the following task in the worktree.

Task: $TASK
Project path: $PROJECT
Worktree path: $WORKTREE_PATH

Plan from planner:
$PLAN_MARKDOWN
$RETRY_SECTION
IMPORTANT RULES:
- Work ONLY within the worktree at: $WORKTREE_PATH
- ALWAYS read a file before modifying it — use Read to see the current contents first
- Use the Edit tool (not Write) for existing files — Edit makes surgical replacements, Write replaces the entire file and risks losing existing code
- Only use Write for brand-new files that don't exist yet
- Preserve ALL existing imports, props, functions, event handlers, and patterns not mentioned in the plan
- Follow the project's existing conventions (if the file uses CSS classes, keep CSS classes; if it uses certain patterns, match them)
- Do NOT run any git commands (no git add, commit, push, etc.) — git is handled separately
- Output a summary of all files you changed and what specifically you changed in each
"

echo "[developer] Implementing with Claude..." >&2

# Run claude to implement (with retries for transient failures)
DEV_OUTPUT=$(run_claude "$PROMPT" "$AGENT_DIR/program.md" "Bash,Read,Write,Edit,Glob,Grep") || true

echo "[developer] Implementation complete." >&2

SUMMARY_JSON=$(echo "$DEV_OUTPUT" | json_escape)

emit_result "{\"status\":\"complete\",\"summary\":$SUMMARY_JSON}"

echo "[developer] Done." >&2
