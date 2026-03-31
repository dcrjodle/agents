#!/usr/bin/env bash
set -euo pipefail

SERVER="joel.bystedt@35.228.54.40"

echo "Pulling latest main on server..."
ssh "$SERVER" 'cd ~/agents && git pull origin main'
echo "Done."
