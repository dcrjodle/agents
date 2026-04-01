#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../agents/lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

PROJECT=$(json_field "$HANDOFF" "projectPath")
WORKTREE_PATH=$(json_field "$HANDOFF" "context.result.worktreePath" "")
BRANCH_NAME=$(json_field "$HANDOFF" "context.result.branchName" "")

if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "undefined" ] || [ ! -d "$WORKTREE_PATH" ]; then
  emit_result '{"status":"failed","error":"No valid worktree path provided"}'
  exit 1
fi

if [ -z "$BRANCH_NAME" ] || [ "$BRANCH_NAME" = "undefined" ]; then
  emit_result '{"status":"failed","error":"No branch name provided"}'
  exit 1
fi

# Safety check: validate worktree's remote matches the project's remote
if [ -n "$PROJECT" ] && [ "$PROJECT" != "undefined" ] && [ -d "$PROJECT" ]; then
  EXPECTED_ORIGIN=$(cd "$PROJECT" && git remote get-url origin 2>/dev/null || echo "")
  ACTUAL_ORIGIN=$(cd "$WORKTREE_PATH" && git remote get-url origin 2>/dev/null || echo "")

  if [ -n "$EXPECTED_ORIGIN" ] && [ -n "$ACTUAL_ORIGIN" ] && [ "$EXPECTED_ORIGIN" != "$ACTUAL_ORIGIN" ]; then
    ERROR="Remote mismatch: worktree origin ($ACTUAL_ORIGIN) does not match project origin ($EXPECTED_ORIGIN)"
    echo "[pushing] ERROR: $ERROR" >&2
    ERROR_JSON=$(echo "$ERROR" | json_escape)
    emit_result "{\"status\":\"failed\",\"error\":$ERROR_JSON}"
    exit 1
  fi
fi

emit_status "Pushing branch $BRANCH_NAME"
echo "[pushing] Pushing $BRANCH_NAME from $WORKTREE_PATH" >&2

cd "$WORKTREE_PATH"

# Fetch the latest state of the remote branch so --force-with-lease has
# an up-to-date reference. Without this, stale tracking info causes
# "stale info" rejections.
git fetch origin "$BRANCH_NAME" 2>/dev/null || true

# Push the task branch. Use --force-with-lease so it succeeds even if the remote
# branch diverged (e.g. from merge commits added during a previous merger run).
# This is safe: task branches are agent-owned, --force-with-lease still rejects
# if the remote was updated by something other than our last fetch, and this
# only affects the task branch — never main or any other branch.
if ! git push -u --force-with-lease origin "$BRANCH_NAME" 2>&1 >&2; then
  emit_result '{"status":"failed","error":"git push failed"}'
  exit 1
fi

echo "[pushing] Branch pushed successfully" >&2

# Get diff summary
emit_status "Getting diff summary"

MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

DIFF_SUMMARY="=== Branch Info ===
Current branch: $(git branch --show-current)
Base branch: $MAIN_BRANCH

=== Files Changed ===
$(git diff --stat "$MAIN_BRANCH"...HEAD 2>/dev/null || git diff --stat HEAD~1)

=== Commit Log ===
$(git log --oneline "$MAIN_BRANCH"..HEAD 2>/dev/null || git log --oneline -5)"

echo "$DIFF_SUMMARY" >&2

DIFF_JSON=$(echo "$DIFF_SUMMARY" | json_escape)
BRANCH_JSON=$(json_escape_str "$BRANCH_NAME")

emit_result "{\"status\":\"complete\",\"branchName\":$BRANCH_JSON,\"diffSummary\":$DIFF_JSON}"
