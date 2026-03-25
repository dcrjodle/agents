#!/usr/bin/env bash
# Read a file with context
# Usage: read_file <path>

read_file() {
  local path="$1"
  if [ -f "$path" ]; then
    cat -n "$path"
  else
    echo "[read_file] File not found: $path"
    return 1
  fi
}
