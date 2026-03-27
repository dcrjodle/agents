#!/usr/bin/env bash
set -euo pipefail

# Async mode: create a temp branch off main with cherry-picked worktree commits.
# Env vars: PROJECT_PATH, WORKTREE_PATH, TASK_ID

PROJECT_PATH="${PROJECT_PATH:?PROJECT_PATH required}"
WORKTREE_PATH="${WORKTREE_PATH:?WORKTREE_PATH required}"
TASK_ID="${TASK_ID:?TASK_ID required}"

BRANCH_NAME="visual-test/${TASK_ID}"

echo "[prepare-visual-test] Creating temp branch $BRANCH_NAME off main" >&2

cd "$PROJECT_PATH"

# Get the main branch name
MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Create temp branch off main
git branch -D "$BRANCH_NAME" 2>/dev/null || true
git checkout -b "$BRANCH_NAME" "origin/$MAIN_BRANCH" --no-track 2>/dev/null

# Get commits from worktree that are ahead of main
WORKTREE_COMMITS=$(git -C "$WORKTREE_PATH" log --format="%H" "origin/$MAIN_BRANCH..HEAD" --reverse 2>/dev/null || true)

if [ -z "$WORKTREE_COMMITS" ]; then
  echo "[prepare-visual-test] No commits to cherry-pick" >&2
  # Still output the project path — the branch is at main
  echo "$PROJECT_PATH"
  exit 0
fi

# Cherry-pick each commit
for commit in $WORKTREE_COMMITS; do
  echo "[prepare-visual-test] Cherry-picking $commit" >&2
  if ! git cherry-pick "$commit" 2>&1; then
    echo "[prepare-visual-test] Cherry-pick failed — likely merge conflict with main" >&2
    git cherry-pick --abort 2>/dev/null || true
    git checkout - 2>/dev/null || true
    git branch -D "$BRANCH_NAME" 2>/dev/null || true
    exit 1
  fi
done

echo "[prepare-visual-test] Temp branch ready" >&2

# Output the project path (the branch is checked out in-place)
echo "$PROJECT_PATH"
