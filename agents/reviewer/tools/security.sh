#!/usr/bin/env bash
# Security review checks
# Usage: security_scan <path>

security_scan() {
  local path="${1:-.}"
  local issues=0

  echo "[security] Scanning: $path"

  # Check for eval usage
  if grep -rn "eval " "$path" --include="*.sh" 2>/dev/null; then
    echo "[security] Warning: eval usage detected"
    issues=$((issues + 1))
  fi

  # Check for curl piped to shell
  if grep -rn "curl.*|.*sh\|wget.*|.*sh" "$path" 2>/dev/null; then
    echo "[security] CRITICAL: curl/wget piped to shell"
    issues=$((issues + 1))
  fi

  # Check for world-writable permissions
  if grep -rn "chmod 777\|chmod a+w" "$path" 2>/dev/null; then
    echo "[security] Warning: Overly permissive file permissions"
    issues=$((issues + 1))
  fi

  echo "[security] Scan complete. Issues found: $issues"
  return $issues
}
