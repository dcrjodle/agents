#!/usr/bin/env bash
# Pull request management
# Usage: create_pr <title> <body> | list_prs | merge_pr <number>

create_pr() {
  local title="$1"
  local body="$2"
  gh pr create --title "$title" --body "$body" 2>&1
}

list_prs() {
  gh pr list 2>&1
}

merge_pr() {
  local number="$1"
  gh pr merge "$number" --merge 2>&1
}
