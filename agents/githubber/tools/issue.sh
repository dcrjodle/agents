#!/usr/bin/env bash
# Issue management
# Usage: create_issue <title> <body> | list_issues | close_issue <number>

create_issue() {
  local title="$1"
  local body="$2"
  gh issue create --title "$title" --body "$body" 2>&1
}

list_issues() {
  gh issue list 2>&1
}

close_issue() {
  local number="$1"
  gh issue close "$number" 2>&1
}
