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
DIFF_SUMMARY=$(json_field "$HANDOFF" "context.result.diffSummary" "")

if [ -z "$TASK" ] || [ "$TASK" = "undefined" ]; then
  TASK="${TASK_DESCRIPTION:-}"
fi

if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "undefined" ]; then
  echo "[githubber] ERROR: Missing worktree path" >&2
  emit_result '{"status":"failed","error":"Missing worktree path"}'
  exit 1
fi

# ---- Create PR using Claude for title and description ----

emit_status "Creating pull request"
echo "[githubber] Creating pull request with Claude..." >&2

PROMPT="Create a pull request for the following task. Generate a concise PR title and a markdown body.

Task: $TASK
Branch: $BRANCH_NAME
Diff summary:
$DIFF_SUMMARY

Use gh pr create to create the PR. Work in: $WORKTREE_PATH

The PR body should include:
- A brief summary of changes (2-3 bullet points)
- A test plan section

Output the PR URL when done.
"

PR_OUTPUT=$(echo "$PROMPT" | ${CLAUDE_CLI:-claude} --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --allowedTools "Bash,Read,Glob,Grep" \
  2>&2) || true

echo "[githubber] Claude output: $PR_OUTPUT" >&2

# Try to extract PR URL from Claude's output
PR_URL=$(echo "$PR_OUTPUT" | grep -oE 'https://github\.com/[^ ]+/pull/[0-9]+' | head -1 || echo "")

if [ -z "$PR_URL" ]; then
  # Fallback: create PR directly
  echo "[githubber] No PR URL found in Claude output, creating PR directly..." >&2
  source "$AGENT_DIR/tools/create-pr.sh"
  PR_URL=$(create_pr "$WORKTREE_PATH" "$TASK" "Automated PR for task $TASK_ID" 2>&1 | tail -1) || true
  echo "[githubber] Fallback PR result: $PR_URL" >&2
fi

PR_URL_JSON=$(json_escape_str "$PR_URL")
BRANCH_JSON=$(json_escape_str "$BRANCH_NAME")

# Clean up worktree after PR is published
if [ -n "$PR_URL" ]; then
  echo "[githubber] Cleaning up worktree after PR creation..." >&2
  CLEANUP_SCRIPT="$AGENT_DIR/../../scripts/cleanup-worktree.sh"
  if [ -f "$CLEANUP_SCRIPT" ]; then
    echo "{\"projectPath\":\"$PROJECT\",\"context\":{\"result\":{\"worktreePath\":\"$WORKTREE_PATH\",\"branchName\":\"$BRANCH_NAME\"}}}" \
      | TASK_ID="$TASK_ID" bash "$CLEANUP_SCRIPT" >/dev/null 2>&2 || echo "[githubber] Worktree cleanup failed (non-fatal)" >&2
  fi
fi

emit_result "{\"status\":\"complete\",\"prUrl\":$PR_URL_JSON,\"branchName\":$BRANCH_JSON}"

echo "[githubber] Done." >&2
