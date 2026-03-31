#!/usr/bin/env bash
set -euo pipefail

SERVER="joel.bystedt@35.228.54.40"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <github-url> <target-dir>"
  echo "Example: $0 https://github.com/Ivy-Interactive/Ivy ~/ivy/ivy"
  exit 1
fi

REPO_URL="$1"
TARGET_DIR="$2"

echo "Cloning $REPO_URL -> $TARGET_DIR on server..."
ssh "$SERVER" "git clone $REPO_URL $TARGET_DIR"
echo "Done."
