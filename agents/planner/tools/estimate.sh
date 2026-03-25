#!/usr/bin/env bash
# Estimate complexity of a task
# Usage: estimate <task_description>

estimate() {
  local task="$1"
  local word_count=$(echo "$task" | wc -w | tr -d ' ')

  if [ "$word_count" -lt 10 ]; then
    echo "low"
  elif [ "$word_count" -lt 30 ]; then
    echo "medium"
  else
    echo "high"
  fi
}
