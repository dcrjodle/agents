#!/usr/bin/env bash
# Check and update workflow status
# Usage: check_status | update_status <agent> <status>

check_status() {
  local memory_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/memory"
  if [ -f "$memory_dir/status.md" ]; then
    cat "$memory_dir/status.md"
  else
    echo "No status file found."
  fi
}

update_status() {
  local agent="$1"
  local status="$2"
  local memory_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/memory"
  echo "- [$agent] $status — $(date -Iseconds)" >> "$memory_dir/status.md"
}
