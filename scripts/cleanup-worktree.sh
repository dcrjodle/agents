#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../agents/lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK_ID="${TASK_ID:-}"
PROJECT=$(json_field "$HANDOFF" "projectPath")
WORKTREE_PATH=$(json_field "$HANDOFF" "context.result.worktreePath" "")
BRANCH_NAME=$(json_field "$HANDOFF" "context.result.branchName" "")

if [ -z "$PROJECT" ] || [ "$PROJECT" = "undefined" ]; then
  emit_result '{"status":"failed","error":"No project path provided"}'
  exit 1
fi

if [ ! -d "$PROJECT/.git" ]; then
  emit_result "{\"status\":\"failed\",\"error\":\"Not a git repository: $PROJECT\"}"
  exit 1
fi

cd "$PROJECT"

# Determine worktree path from task ID if not provided
if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "undefined" ]; then
  WORKTREE_PATH="$PROJECT/.worktrees/task/$TASK_ID"
fi

# Determine branch name from task ID if not provided
if [ -z "$BRANCH_NAME" ] || [ "$BRANCH_NAME" = "undefined" ]; then
  BRANCH_NAME="task/$TASK_ID"
fi

emit_status "Cleaning up worktree"

# Remove the worktree if it exists
if [ -d "$WORKTREE_PATH" ]; then
  echo "[cleanup] Removing worktree: $WORKTREE_PATH" >&2
  git worktree remove "$WORKTREE_PATH" --force 2>&1 >&2 || true
else
  echo "[cleanup] Worktree not found at: $WORKTREE_PATH (already removed)" >&2
fi

# Prune stale worktree references
git worktree prune 2>&1 >&2 || true

# Delete the local branch if it exists
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "[cleanup] Deleting local branch: $BRANCH_NAME" >&2
  git branch -D "$BRANCH_NAME" 2>&1 >&2 || true
fi

emit_result '{"status":"complete"}'
echo "[cleanup] Done." >&2
