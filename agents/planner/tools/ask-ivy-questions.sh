#!/usr/bin/env bash
# Ask the Ivy MCP server documentation questions
# Usage: ask_ivy_questions <question>
# Requires: claude CLI with ivy MCP server configured

ask_ivy_questions() {
  local question="$1"
  if [ -z "$question" ]; then
    echo "[ask-ivy-questions] Usage: ask_ivy_questions \"<question>\""
    return 1
  fi

  echo "[ask-ivy-questions] Querying Ivy docs: $question"

  # Use claude CLI to query the Ivy MCP server
  ${CLAUDE_CLI:-claude} --print \
    --system-prompt "You are a documentation lookup assistant. Answer the question using the ivy-questions MCP tool. Return only the relevant documentation content." \
    "Use the ivy-questions tool to answer: $question" \
    2>/dev/null

  return $?
}
