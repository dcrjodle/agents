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
BRANCH_NAME=$(json_field "$HANDOFF" "context.result.branchName" "")
MODE="${AGENT_MODE:-push}"

if [ -z "$TASK" ] || [ "$TASK" = "undefined" ]; then
  TASK="${TASK_DESCRIPTION:-}"
fi

# ---- MODE: push ----
# Push the branch and exit. Server holds XState in merging.awaitingApproval.
if [ "$MODE" = "push" ]; then
  if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "undefined" ] || [ -z "$BRANCH_NAME" ] || [ "$BRANCH_NAME" = "undefined" ]; then
    echo "[githubber] ERROR: Missing worktree path or branch name" >&2
    emit_result '{"status":"failed","error":"Missing worktree path or branch name from developer result"}'
    exit 1
  fi

  emit_status "Getting diff summary"
  echo "[githubber] Getting diff summary..." >&2
  source "$AGENT_DIR/tools/get-diff-summary.sh"
  DIFF_SUMMARY=$(get_diff_summary "$WORKTREE_PATH" 2>&1) || true
  echo "$DIFF_SUMMARY" >&2

  emit_status "Pushing branch $BRANCH_NAME"
  echo "[githubber] Pushing branch..." >&2
  source "$AGENT_DIR/tools/push-branch.sh"
  PUSH_OUTPUT=$(push_branch "$WORKTREE_PATH" "$BRANCH_NAME" 2>&1) || true
  echo "$PUSH_OUTPUT" >&2

  DIFF_JSON=$(echo "$DIFF_SUMMARY" | json_escape)
  BRANCH_JSON=$(json_escape_str "$BRANCH_NAME")

  emit_result "{\"status\":\"complete\",\"branchName\":$BRANCH_JSON,\"diffSummary\":$DIFF_JSON}"

  echo "[githubber] Branch pushed. Exiting (server will await user approval)." >&2
  exit 0
fi

# ---- MODE: create-pr ----
# User approved — create the PR.
if [ "$MODE" = "create-pr" ]; then
  if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "undefined" ]; then
    echo "[githubber] ERROR: Missing worktree path" >&2
    emit_result '{"status":"failed","error":"Missing worktree path"}'
    exit 1
  fi

  emit_status "Creating pull request"
  echo "[githubber] Creating pull request..." >&2
  source "$AGENT_DIR/tools/create-pr.sh"
  PR_URL=$(create_pr "$WORKTREE_PATH" "$TASK" "Automated PR for task $TASK_ID" 2>&1 | tail -1) || true
  echo "[githubber] PR result: $PR_URL" >&2

  PR_URL_JSON=$(json_escape_str "$PR_URL")
  BRANCH_JSON=$(json_escape_str "$BRANCH_NAME")

  emit_result "{\"status\":\"complete\",\"prUrl\":$PR_URL_JSON,\"branchName\":$BRANCH_JSON}"

  echo "[githubber] Done." >&2
  exit 0
fi

echo "[githubber] ERROR: Unknown AGENT_MODE: $MODE" >&2
emit_result "{\"status\":\"failed\",\"error\":\"Unknown AGENT_MODE: $MODE\"}"
exit 1
