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

# Run claude with retries on transient failures (signal kills, rate limits)
# Usage: OUTPUT=$(run_claude "$PROMPT" "$SYSTEM_PROMPT_FILE" "$ALLOWED_TOOLS")
run_claude() {
  local prompt="$1" system_prompt_file="$2" allowed_tools="$3"
  local max_retries=2 attempt=0 output="" exit_code=0
  local claude_stderr=""

  while [ $attempt -le $max_retries ]; do
    exit_code=0
    claude_stderr=$(mktemp)
    output=$(echo "$prompt" | ${CLAUDE_CLI:-claude} --print \
      --system-prompt "$(cat "$system_prompt_file")" \
      --allowedTools "$allowed_tools" \
      2>"$claude_stderr") || exit_code=$?

    # Always forward Claude stderr so parent sees it
    if [ -s "$claude_stderr" ]; then
      cat "$claude_stderr" >&2
    fi

    # Success or clean failure (non-signal) — return immediately
    if [ $exit_code -eq 0 ] && [ -n "$output" ]; then
      rm -f "$claude_stderr"
      echo "$output"
      return 0
    fi

    # Log the error details from Claude
    echo "[lib] Claude exited with code ${exit_code:-null}" >&2
    if [ -s "$claude_stderr" ]; then
      echo "[lib] Claude stderr:" >&2
      head -20 "$claude_stderr" >&2
    fi
    if [ -n "$output" ]; then
      echo "[lib] Claude stdout (first 500 chars): ${output:0:500}" >&2
    else
      echo "[lib] Claude stdout: (empty)" >&2
    fi
    rm -f "$claude_stderr"

    attempt=$((attempt + 1))
    if [ $attempt -le $max_retries ]; then
      local wait=$((attempt * 5))
      echo "[lib] Retrying in ${wait}s (attempt $((attempt))/$max_retries)..." >&2
      sleep "$wait"
    fi
  done

  # Return whatever we got on the last attempt
  echo "$output"
  return $exit_code
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
