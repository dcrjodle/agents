#!/usr/bin/env bash
# Delegate a task to another agent
# Usage: delegate <agent_name> <task_description>

delegate() {
  local agent="$1"
  local task="$2"
  local agents_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

  if [ ! -d "$agents_dir/$agent" ]; then
    echo "[delegate] Error: Agent '$agent' not found"
    return 1
  fi

  echo "[delegate] Delegating to $agent: $task"
  bash "$agents_dir/$agent/start.sh" "$task"
}
