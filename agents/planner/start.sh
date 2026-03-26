#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$AGENT_DIR/../lib.sh"

# Read handoff from stdin
HANDOFF=$(parse_handoff)

TASK=$(json_field "$HANDOFF" "instruction")
TASK_ID="${TASK_ID:-}"
PROJECT=$(json_field "$HANDOFF" "projectPath")

if [ -z "$TASK" ] || [ "$TASK" = "undefined" ]; then
  TASK="${TASK_DESCRIPTION:-}"
fi

if [ -z "$TASK" ]; then
  echo "Usage: echo '{...}' | ./start.sh"
  exit 1
fi

if [ -z "$PROJECT" ] || [ "$PROJECT" = "undefined" ]; then
  echo "[planner] ERROR: No project path provided"
  exit 1
fi

emit_status "Analyzing project at $PROJECT"

echo "[planner] Analyzing project at: $PROJECT" >&2

# Read the plan template
PLAN_TEMPLATE=$(cat "$AGENT_DIR/templates/plan.md")

# Build the prompt for claude
PROMPT="You are a planner agent. Your job is to create an implementation plan.

Task: $TASK
Project path: $PROJECT

First, explore the project directory to understand its structure, framework, and conventions.
Then write a plan following this template:

$PLAN_TEMPLATE

IMPORTANT: Output ONLY the plan in markdown format. Do not include any other text.
If the project uses the Ivy Framework (.NET/C# with Ivy), use the ask-ivy-questions tool to look up relevant documentation.
"

emit_status "Creating implementation plan"

echo "[planner] Creating plan with Claude..." >&2

# Run claude to generate the plan (stderr goes to our stderr for UI streaming)
PLAN_OUTPUT=$(echo "$PROMPT" | ${CLAUDE_CLI:-claude} --print \
  --system-prompt "$(cat "$AGENT_DIR/program.md")" \
  --allowedTools "Bash(read-only:true),Read,Glob,Grep" \
  2>&2) || true

echo "[planner] Plan generated." >&2

# Escape the plan for JSON
PLAN_JSON=$(echo "$PLAN_OUTPUT" | json_escape)
PROJECT_JSON=$(json_escape_str "$PROJECT")

# Emit the result — planner exits and server holds XState in awaitingApproval
emit_result "{\"status\":\"plan_ready\",\"plan\":{\"markdown\":$PLAN_JSON,\"projectPath\":$PROJECT_JSON}}"

echo "[planner] Done." >&2
