#!/usr/bin/env bash
# Code review utilities
# Usage: diff_files <path> | check_style <path>

diff_files() {
  local path="${1:-.}"
  git diff --stat "$path" 2>&1
}

check_style() {
  local path="$1"
  # Check for common issues
  local issues=0

  # Check for TODO/FIXME/HACK comments
  if grep -rn "TODO\|FIXME\|HACK" "$path" 2>/dev/null; then
    echo "[review] Warning: Found TODO/FIXME/HACK comments"
    issues=$((issues + 1))
  fi

  # Check for hardcoded secrets patterns
  if grep -rn "password\s*=\|secret\s*=\|api_key\s*=" "$path" 2>/dev/null; then
    echo "[review] CRITICAL: Possible hardcoded secrets"
    issues=$((issues + 1))
  fi

  echo "[review] Style check complete. Issues found: $issues"
  return $issues
}
