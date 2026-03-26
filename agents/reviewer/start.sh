#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$AGENT_DIR/../lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK=$(json_field "$HANDOFF" "instruction")
TASK_ID="${TASK_ID:-}"
PROJECT=$(json_field "$HANDOFF" "projectPath")
WORKTREE_PATH=$(json_field "$HANDOFF" "context.result.worktreePath" "")
FILES_CHANGED=$(json_field "$HANDOFF" "context.result.files" "[]")
PLAN_MARKDOWN=$(json_field "$HANDOFF" "context.plan.markdown" "")

if [ -z "$TASK" ] || [ "$TASK" = "undefined" ]; then
  TASK="${TASK_DESCRIPTION:-}"
fi

if [ -z "$PROJECT" ] || [ "$PROJECT" = "undefined" ]; then
  echo "[reviewer] ERROR: No project path provided" >&2
  exit 1
fi

# Detect framework and select checklist
echo "[reviewer] Detecting framework..." >&2
CHECKLIST_FILE="$AGENT_DIR/checklists/general.md"

if [ -n "$PROJECT" ]; then
  if ls "$PROJECT"/*.csproj 1>/dev/null 2>&1 || ls "$PROJECT"/**/*.csproj 1>/dev/null 2>&1; then
    CHECKLIST_FILE="$AGENT_DIR/checklists/dotnet-ivy.md"
    echo "[reviewer] Detected: .NET / Ivy Framework" >&2
  elif [ -f "$PROJECT/package.json" ]; then
    if grep -q '"react"' "$PROJECT/package.json" 2>/dev/null; then
      CHECKLIST_FILE="$AGENT_DIR/checklists/react-typescript.md"
      echo "[reviewer] Detected: React / TypeScript" >&2
    fi
  fi
fi

CHECKLIST=$(cat "$CHECKLIST_FILE")
echo "[reviewer] Using checklist: $(basename "$CHECKLIST_FILE")" >&2

emit_status "Reviewing code against $(basename "$CHECKLIST_FILE")"

# Determine the review path — use worktree if available, else project
REVIEW_PATH="${WORKTREE_PATH:-$PROJECT}"
if [ "$REVIEW_PATH" = "undefined" ]; then
  REVIEW_PATH="$PROJECT"
fi

PROMPT="You are a code reviewer. Review the code changes against the checklist below.

Task: $TASK
Project path: $PROJECT
Review path: $REVIEW_PATH
Files changed: $FILES_CHANGED

Plan:
$PLAN_MARKDOWN

## Review Checklist
$CHECKLIST

INSTRUCTIONS:
1. Read each changed file in the review path
2. Evaluate against EVERY item in the checklist above
3. Output your review in this exact format:

## Review: <task>

**Verdict**: approved / changes_requested
**Checklist**: $(basename "$CHECKLIST_FILE")

### Issues
(list any issues found, or 'None')

### Positive Notes
- What was done well

### Summary
Overall assessment

4. Be thorough but practical. Approve if the code is correct and follows conventions.
"

echo "[reviewer] Reviewing with Claude..." >&2

REVIEW_OUTPUT=$(echo "$PROMPT" | ${CLAUDE_CLI:-claude} --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --allowedTools "Bash(read-only:true),Read,Glob,Grep" \
  2>&2) || true

echo "[reviewer] Review complete." >&2

# Determine verdict from output
VERDICT="approved"
if echo "$REVIEW_OUTPUT" | grep -qi "changes_requested"; then
  VERDICT="changes_requested"
fi

REVIEW_JSON=$(echo "$REVIEW_OUTPUT" | json_escape)
CHECKLIST_NAME=$(basename "$CHECKLIST_FILE")

emit_result "{\"status\":\"complete\",\"verdict\":\"$VERDICT\",\"summary\":$REVIEW_JSON,\"checklist\":\"$CHECKLIST_NAME\",\"comments\":[]}"

echo "[reviewer] Done." >&2
