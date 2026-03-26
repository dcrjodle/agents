#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../agents/lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK_ID="${TASK_ID:-}"
PROJECT=$(json_field "$HANDOFF" "projectPath")
EXISTING_WORKTREE=$(json_field "$HANDOFF" "context.result.worktreePath" "")
EXISTING_BRANCH=$(json_field "$HANDOFF" "context.result.branchName" "")

if [ -z "$PROJECT" ] || [ "$PROJECT" = "undefined" ]; then
  emit_result '{"status":"failed","error":"No project path provided"}'
  exit 1
fi

if [ ! -d "$PROJECT/.git" ]; then
  emit_result "{\"status\":\"failed\",\"error\":\"Not a git repository: $PROJECT\"}"
  exit 1
fi

BRANCH_NAME="${EXISTING_BRANCH:-task/${TASK_ID}}"

# Reuse existing worktree on retry
if [ -n "$EXISTING_WORKTREE" ] && [ "$EXISTING_WORKTREE" != "undefined" ] && [ -d "$EXISTING_WORKTREE" ]; then
  emit_status "Reusing existing worktree"
  echo "[branching] Reusing existing worktree: $EXISTING_WORKTREE" >&2

  WORKTREE_JSON=$(json_escape_str "$EXISTING_WORKTREE")
  BRANCH_JSON=$(json_escape_str "$BRANCH_NAME")
  emit_result "{\"status\":\"complete\",\"worktreePath\":$WORKTREE_JSON,\"branchName\":$BRANCH_JSON}"
  exit 0
fi

emit_status "Creating worktree"
echo "[branching] Creating worktree for branch: $BRANCH_NAME" >&2

WORKTREE_DIR="$PROJECT/.worktrees/$BRANCH_NAME"

# Get the main branch name
cd "$PROJECT"
MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Create the worktree from main
mkdir -p "$(dirname "$WORKTREE_DIR")"
if ! git worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" "$MAIN_BRANCH" 2>&1 >&2; then
  emit_result "{\"status\":\"failed\",\"error\":\"Failed to create worktree at $WORKTREE_DIR\"}"
  exit 1
fi

echo "[branching] Worktree created at: $WORKTREE_DIR (branch: $BRANCH_NAME from $MAIN_BRANCH)" >&2

WORKTREE_JSON=$(json_escape_str "$WORKTREE_DIR")
BRANCH_JSON=$(json_escape_str "$BRANCH_NAME")
emit_result "{\"status\":\"complete\",\"worktreePath\":$WORKTREE_JSON,\"branchName\":$BRANCH_JSON}"
