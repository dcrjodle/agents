#!/usr/bin/env bash
# Create a git worktree for isolated development
# Usage: create_worktree <project_path> <branch_name>
# Returns: the worktree path

create_worktree() {
  local project_path="$1"
  local branch_name="$2"

  if [ -z "$project_path" ] || [ -z "$branch_name" ]; then
    echo "[create-worktree] Usage: create_worktree <project_path> <branch_name>"
    return 1
  fi

  if [ ! -d "$project_path/.git" ]; then
    echo "[create-worktree] ERROR: $project_path is not a git repository"
    return 1
  fi

  local worktree_dir="$project_path/.worktrees/$branch_name"

  # Get the main branch name
  cd "$project_path"
  local main_branch
  main_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

  # Create the worktree from main
  mkdir -p "$(dirname "$worktree_dir")"
  git worktree add "$worktree_dir" -b "$branch_name" "$main_branch" 2>&1

  echo "[create-worktree] Worktree created at: $worktree_dir"
  echo "[create-worktree] Branch: $branch_name (from $main_branch)"
  echo "$worktree_dir"
}
