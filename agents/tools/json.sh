#!/usr/bin/env bash
# JSON helper functions using Node.js instead of python3

# Read a JSON field from a file using a dot-separated path
# Usage: json_get <file> <path> [default]
# Example: json_get "$f" "payload.projectPath" ""
json_get() {
  local file="$1" path="$2" default="${3:-}"
  node -e "
    const d = JSON.parse(require('fs').readFileSync('$file', 'utf8'));
    const path = '$path'.split('.');
    let v = d;
    for (const k of path) {
      if (v == null || typeof v !== 'object') { v = undefined; break; }
      v = v[k];
    }
    console.log(v != null ? (typeof v === 'object' ? JSON.stringify(v) : String(v)) : '$default');
  " 2>/dev/null || echo "$default"
}

# Escape a string for safe JSON embedding
# Usage: echo "some text" | json_escape
json_escape() {
  node -e "
    const text = require('fs').readFileSync('/dev/stdin', 'utf8');
    console.log(JSON.stringify(text));
  "
}
