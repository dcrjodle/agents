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
# Streams Claude's response line-by-line to stderr with :::CLAUDE::: prefix
# so the server can forward it to the frontend in real time.
# Usage: OUTPUT=$(run_claude "$PROMPT" "$SYSTEM_PROMPT_FILE" "$ALLOWED_TOOLS" ["$WORK_DIR"])
run_claude() {
  local prompt="$1" system_prompt_file="$2" allowed_tools="$3" work_dir="${4:-}"
  local max_retries=2 attempt=0 exit_code=0
  local claude_stderr="" claude_stdout="" last_stdout=""

  while [ $attempt -le $max_retries ]; do
    exit_code=0
    claude_stderr=$(mktemp)
    claude_stdout=$(mktemp)
    last_stdout="$claude_stdout"

    # Run claude, teeing stdout so each line streams to stderr in real time.
    # Subshell with pipefail captures claude's exit code through the pipe.
    # If work_dir is set, cd into it so Claude CLI sees the project as its cwd.
    set +e
    ( set -o pipefail
      [ -n "$work_dir" ] && cd "$work_dir"
      echo "$prompt" | ${CLAUDE_CLI:-claude} --print \
        --system-prompt "$(cat "$system_prompt_file")" \
        --allowedTools "$allowed_tools" \
        2>"$claude_stderr" \
      | tee "$claude_stdout" \
      | while IFS= read -r line; do
          echo ":::CLAUDE::: $line" >&2
        done
    )
    exit_code=$?
    set -e

    # Always forward Claude stderr so parent sees it
    if [ -s "$claude_stderr" ]; then
      cat "$claude_stderr" >&2
    fi

    local output
    output=$(cat "$claude_stdout")

    # Success or clean failure (non-signal) — return immediately
    if [ $exit_code -eq 0 ] && [ -n "$output" ]; then
      rm -f "$claude_stderr" "$claude_stdout"
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
  if [ -f "$last_stdout" ]; then
    cat "$last_stdout"
    rm -f "$last_stdout"
  fi
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

# Convert a task description into a valid git branch name slug
# Usage: generate_branch_slug "Fix login button color"  →  "fix-login-button-color"
generate_branch_slug() {
  local input="$1"
  [ -z "$input" ] && echo "" && return 0

  # Convert to lowercase, replace spaces and underscores with hyphens
  local slug
  slug=$(echo "$input" | tr '[:upper:]' '[:lower:]' | tr ' _' '-')

  # Remove all characters that are not alphanumeric or hyphens (including non-ASCII)
  slug=$(echo "$slug" | LC_ALL=C sed 's/[^a-z0-9-]//g')

  # Collapse multiple consecutive hyphens into a single hyphen
  slug=$(echo "$slug" | sed 's/-\+/-/g')

  # Trim leading and trailing hyphens
  slug=$(echo "$slug" | sed 's/^-\+//;s/-\+$//')

  # Return empty if slug is now empty
  [ -z "$slug" ] && echo "" && return 0

  # Truncate to max 50 characters, avoiding cutting in the middle of a word
  if [ ${#slug} -gt 50 ]; then
    local truncated="${slug:0:50}"
    # Remove the last partial word (everything from the last hyphen onward)
    local trimmed="${truncated%-*}"
    if [ -n "$trimmed" ]; then
      slug="$trimmed"
    else
      slug="$truncated"
    fi
    # Trim any trailing hyphens
    slug=$(echo "$slug" | sed 's/-\+$//')
  fi

  echo "$slug"
}
