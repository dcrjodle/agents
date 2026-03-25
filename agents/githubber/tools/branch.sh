#!/usr/bin/env bash
# Branch management
# Usage: create_branch <name> | delete_branch <name> | list_branches

create_branch() {
  local name="$1"
  git checkout -b "$name" 2>&1
  echo "[branch] Created and switched to: $name"
}

delete_branch() {
  local name="$1"
  git branch -d "$name" 2>&1
  echo "[branch] Deleted: $name"
}

list_branches() {
  git branch -a 2>&1
}
