#!/usr/bin/env bash
set -euo pipefail

SERVER="joel.bystedt@35.228.54.40"
LOCAL_PORT="${1:-3001}"
REMOTE_PORT="3001"

# Kill existing processes on the port
existing=$(lsof -ti tcp:"$LOCAL_PORT" 2>/dev/null || true)
if [ -n "$existing" ]; then
  echo "Killing existing processes on port $LOCAL_PORT"
  echo "$existing" | xargs kill -9 2>/dev/null || true
  # Wait until port is actually free
  for i in $(seq 1 10); do
    lsof -ti tcp:"$LOCAL_PORT" &>/dev/null || break
    sleep 0.5
  done
fi

echo "Opening SSH tunnel: localhost:$LOCAL_PORT -> $SERVER:$REMOTE_PORT"
ssh -f -N -L "$LOCAL_PORT":localhost:"$REMOTE_PORT" "$SERVER"
echo "Tunnel open. Server available at http://localhost:$LOCAL_PORT"
echo "Run 'npm run app' to start the frontend."
