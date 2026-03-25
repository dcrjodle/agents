#!/usr/bin/env bash
# Write content to a file
# Usage: write_file <path> <content>

write_file() {
  local path="$1"
  local content="$2"
  mkdir -p "$(dirname "$path")"
  echo "$content" > "$path"
  echo "[write_file] Wrote to: $path"
}
