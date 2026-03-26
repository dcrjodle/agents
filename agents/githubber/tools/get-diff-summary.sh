#!/usr/bin/env bash
# Get a summary of changes in a worktree branch
# Usage: get_diff_summary <worktree_path>

get_diff_summary() {
  local worktree_path="$1"

  if [ -z "$worktree_path" ]; then
    echo "[get-diff-summary] Usage: get_diff_summary <worktree_path>"
    return 1
  fi

  cd "$worktree_path"

  local main_branch
  main_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

  echo "=== Branch Info ==="
  echo "Current branch: $(git branch --show-current)"
  echo "Base branch: $main_branch"
  echo ""
  echo "=== Files Changed ==="
  git diff --stat "$main_branch"...HEAD 2>/dev/null || git diff --stat HEAD~1
  echo ""
  echo "=== Commit Log ==="
  git log --oneline "$main_branch"..HEAD 2>/dev/null || git log --oneline -5
}
