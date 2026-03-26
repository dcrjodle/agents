#!/usr/bin/env bash
# Create a pull request using gh CLI
# Usage: create_pr <worktree_path> <title> <body>

create_pr() {
  local worktree_path="$1"
  local title="$2"
  local body="$3"

  if [ -z "$worktree_path" ] || [ -z "$title" ]; then
    echo "[create-pr] Usage: create_pr <worktree_path> <title> [body]"
    return 1
  fi

  cd "$worktree_path"
  local pr_url
  pr_url=$(gh pr create --title "$title" --body "${body:-}" 2>&1)
  echo "[create-pr] PR created: $pr_url"
  echo "$pr_url"
}
