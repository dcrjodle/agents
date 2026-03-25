#!/usr/bin/env bash
# Run tests and capture results
# Usage: run_tests <test_command>

run_tests() {
  local cmd="$1"
  local memory_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/memory"
  local result_file="$memory_dir/results/run-$(date +%s).md"

  mkdir -p "$memory_dir/results"

  echo "# Test Run — $(date -Iseconds)" > "$result_file"
  echo "## Command: $cmd" >> "$result_file"
  echo "## Output:" >> "$result_file"
  echo '```' >> "$result_file"

  eval "$cmd" >> "$result_file" 2>&1
  local exit_code=$?

  echo '```' >> "$result_file"
  echo "## Exit Code: $exit_code" >> "$result_file"

  if [ $exit_code -eq 0 ]; then
    echo "## Result: PASS" >> "$result_file"
  else
    echo "## Result: FAIL" >> "$result_file"
  fi

  echo "[run_tests] Results saved to: $result_file"
  return $exit_code
}
