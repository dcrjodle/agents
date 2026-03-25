#!/usr/bin/env bash
# Decompose a goal into tasks
# Usage: decompose <goal>

decompose() {
  local goal="$1"
  local memory_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/memory"
  local plan_file="$memory_dir/plans/plan-$(date +%s).md"

  mkdir -p "$memory_dir/plans"
  echo "# Plan: $goal" > "$plan_file"
  echo "" >> "$plan_file"
  echo "Created: $(date -Iseconds)" >> "$plan_file"
  echo "" >> "$plan_file"
  echo "## Tasks" >> "$plan_file"
  echo "<!-- Add tasks here -->" >> "$plan_file"

  echo "[decompose] Plan template created: $plan_file"
}
