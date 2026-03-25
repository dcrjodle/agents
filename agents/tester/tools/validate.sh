#!/usr/bin/env bash
# Validate acceptance criteria
# Usage: validate <criteria_description> <check_command>

validate() {
  local criteria="$1"
  local check="$2"

  echo "[validate] Checking: $criteria"
  if eval "$check" > /dev/null 2>&1; then
    echo "[validate] PASS: $criteria"
    return 0
  else
    echo "[validate] FAIL: $criteria"
    return 1
  fi
}
