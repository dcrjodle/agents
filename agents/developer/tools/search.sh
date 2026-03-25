#!/usr/bin/env bash
# Search codebase for patterns
# Usage: search <pattern> [path]

search_code() {
  local pattern="$1"
  local path="${2:-.}"
  grep -rn "$pattern" "$path" --include="*.{sh,md,py,js,ts,go,rs}" 2>/dev/null || echo "[search] No matches found"
}
