#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$AGENT_DIR/../lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK=$(json_field "$HANDOFF" "instruction")
TASK_ID="${TASK_ID:-}"
PROJECT=$(json_field "$HANDOFF" "projectPath")
WORKTREE_PATH=$(json_field "$HANDOFF" "context.result.worktreePath" "")

if [ -z "$TASK" ] || [ "$TASK" = "undefined" ]; then
  TASK="${TASK_DESCRIPTION:-}"
fi

# Use worktree if available, else project
TEST_PATH="${WORKTREE_PATH:-$PROJECT}"
if [ "$TEST_PATH" = "undefined" ] || [ -z "$TEST_PATH" ]; then
  TEST_PATH="$PROJECT"
fi

if [ -z "$TEST_PATH" ] || [ ! -d "$TEST_PATH" ]; then
  echo "[tester] ERROR: No valid test path found" >&2
  exit 1
fi

echo "[tester] Testing in: $TEST_PATH" >&2

emit_status "Running build and tests"

# Detect project type and run build/tests
cd "$TEST_PATH"
BUILD_OUTPUT=""
TEST_OUTPUT=""
BUILD_STATUS=0
TEST_STATUS=0
HAS_TESTS=false

# Node.js project
if [ -f "package.json" ]; then
  echo "[tester] Detected Node.js project" >&2

  # Install deps if needed
  if [ ! -d "node_modules" ] && [ -f "package-lock.json" ]; then
    echo "[tester] Installing dependencies..." >&2
    npm ci --ignore-scripts 2>&1 || npm install 2>&1 || true
  fi

  # Run build
  if grep -q '"build"' package.json 2>/dev/null; then
    echo "[tester] Running npm run build..." >&2
    BUILD_OUTPUT=$(npm run build 2>&1) || BUILD_STATUS=$?
    echo "$BUILD_OUTPUT" >&2
  fi

  # Run tests
  if grep -q '"test"' package.json 2>/dev/null; then
    TEST_SCRIPT=$(node -e "console.log(require('./package.json').scripts?.test || '')" 2>/dev/null || echo "")
    if [ -n "$TEST_SCRIPT" ] && ! echo "$TEST_SCRIPT" | grep -q "^echo\|no test\|exit"; then
      HAS_TESTS=true
      echo "[tester] Running npm test..." >&2
      TEST_OUTPUT=$(npm test 2>&1) || TEST_STATUS=$?
      echo "$TEST_OUTPUT" >&2
    else
      echo "[tester] Test script is a placeholder, skipping" >&2
    fi
  fi

# .NET project
elif ls *.csproj 1>/dev/null 2>&1 || ls **/*.csproj 1>/dev/null 2>&1; then
  echo "[tester] Detected .NET project" >&2

  echo "[tester] Running dotnet build..." >&2
  BUILD_OUTPUT=$(dotnet build 2>&1) || BUILD_STATUS=$?
  echo "$BUILD_OUTPUT" >&2

  if ls **/*.Tests.csproj 1>/dev/null 2>&1 || ls *.Tests.csproj 1>/dev/null 2>&1; then
    HAS_TESTS=true
    echo "[tester] Running dotnet test..." >&2
    TEST_OUTPUT=$(dotnet test 2>&1) || TEST_STATUS=$?
    echo "$TEST_OUTPUT" >&2
  fi

else
  echo "[tester] Unknown project type, skipping build/test" >&2
fi

# Determine overall result
OVERALL_STATUS="complete"
ERROR_MSG=""

if [ $BUILD_STATUS -ne 0 ]; then
  OVERALL_STATUS="failed"
  ERROR_MSG="Build failed:\n$BUILD_OUTPUT"
elif [ $TEST_STATUS -ne 0 ]; then
  OVERALL_STATUS="failed"
  ERROR_MSG="Tests failed:\n$TEST_OUTPUT"
fi

echo "[tester] Build status: $BUILD_STATUS, Test status: $TEST_STATUS" >&2

if [ "$OVERALL_STATUS" = "complete" ]; then
  SUMMARY="Build passed."
  if [ "$HAS_TESTS" = true ]; then
    SUMMARY="Build and tests passed."
  else
    SUMMARY="Build passed. No test suite found."
  fi
  SUMMARY_JSON=$(echo "$SUMMARY" | json_escape)
  emit_result "{\"status\":\"complete\",\"summary\":$SUMMARY_JSON,\"testResults\":{\"hasTests\":$HAS_TESTS,\"buildPassed\":true}}"
else
  ERROR_JSON=$(echo -e "$ERROR_MSG" | json_escape)
  emit_result "{\"status\":\"failed\",\"error\":$ERROR_JSON,\"testResults\":{\"hasTests\":$HAS_TESTS,\"buildPassed\":$([ $BUILD_STATUS -eq 0 ] && echo "true" || echo "false")}}"
fi

echo "[tester] Done." >&2
