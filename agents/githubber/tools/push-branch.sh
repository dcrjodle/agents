#!/usr/bin/env bash
# Push a branch to the remote
# Usage: push_branch <worktree_path> <branch_name>

push_branch() {
  local worktree_path="$1"
  local branch_name="$2"

  if [ -z "$worktree_path" ] || [ -z "$branch_name" ]; then
    echo "[push-branch] Usage: push_branch <worktree_path> <branch_name>"
    return 1
  fi

  cd "$worktree_path"
  git push -u origin "$branch_name" 2>&1
  echo "[push-branch] Pushed $branch_name to origin"
}
