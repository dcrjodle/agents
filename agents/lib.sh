#!/usr/bin/env bash
# Shared agent helpers — stdio-based protocol
# Source this from every agent start.sh

# Parse handoff JSON from stdin
# Usage: HANDOFF=$(parse_handoff)
parse_handoff() {
  cat
}

# Extract a field from JSON string using dot-separated path
# Usage: json_field "$JSON_STRING" "payload.projectPath" [default]
json_field() {
  local json="$1" path="$2" default="${3:-}"
  echo "$json" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const path = '${path}'.split('.');
    let v = d;
    for (const k of path) {
      if (v == null || typeof v !== 'object') { v = undefined; break; }
      v = v[k];
    }
    console.log(v != null ? (typeof v === 'object' ? JSON.stringify(v) : String(v)) : '${default}');
  " 2>/dev/null || echo "$default"
}

# Emit a status update via stderr
# Usage: emit_status "Analyzing project"
emit_status() {
  local step="$1"
  echo ":::STATUS::: {\"currentStep\":$(json_escape_str "$step")}" >&2
}

# Emit the final result via stdout with markers
# Usage: emit_result '{"status":"complete","plan":{...}}'
emit_result() {
  local json="$1"
  echo ":::RESULT_START:::"
  echo "$json"
  echo ":::RESULT_END:::"
}

# Escape a string for safe JSON embedding (returns quoted string)
# Usage: ESCAPED=$(echo "some text" | json_escape)
json_escape() {
  node -e "
    const text = require('fs').readFileSync('/dev/stdin', 'utf8');
    console.log(JSON.stringify(text));
  "
}

# Escape a string value for JSON (returns quoted string, from argument not stdin)
# Usage: json_escape_str "some text"
json_escape_str() {
  node -e "console.log(JSON.stringify(process.argv[1]))" "$1"
}
