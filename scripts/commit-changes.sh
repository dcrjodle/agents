#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../agents/lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK_DESCRIPTION="${TASK_DESCRIPTION:-}"
WORKTREE_PATH=$(json_field "$HANDOFF" "context.result.worktreePath" "")

if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "undefined" ] || [ ! -d "$WORKTREE_PATH" ]; then
  emit_result '{"status":"failed","error":"No valid worktree path provided"}'
  exit 1
fi

emit_status "Committing changes"
echo "[committing] Working in: $WORKTREE_PATH" >&2

cd "$WORKTREE_PATH"

# Ensure git identity is configured (required on servers without global git config)
if ! git config user.name >/dev/null 2>&1; then
  git config user.name "Agent"
fi
if ! git config user.email >/dev/null 2>&1; then
  git config user.email "agent@automated"
fi

# Get the main branch name
MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Stage all changes
if ! git add -A 2>&1 >&2; then
  emit_result '{"status":"failed","error":"git add failed"}'
  exit 1
fi

# Check if there are changes to commit
if git diff --cached --quiet 2>/dev/null; then
  echo "[committing] No new changes to commit" >&2
else
  # Commit with task description
  COMMIT_MSG="[agent] ${TASK_DESCRIPTION:-Automated changes}"
  if ! git commit -m "$COMMIT_MSG" 2>&1 >&2; then
    emit_result '{"status":"failed","error":"git commit failed"}'
    exit 1
  fi
  echo "[committing] Committed: $COMMIT_MSG" >&2
fi

# Get authoritative file list (all changes since main)
FILES_CHANGED=$(git diff --name-only "$MAIN_BRANCH"...HEAD 2>/dev/null | node -e "
const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
console.log(JSON.stringify(lines));
" 2>/dev/null || echo "[]")

echo "[committing] Files changed: $FILES_CHANGED" >&2

emit_result "{\"status\":\"complete\",\"files\":$FILES_CHANGED}"
