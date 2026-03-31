#!/usr/bin/env bash
set -euo pipefail

SERVER="joel.bystedt@35.228.54.40"

echo "Restarting server..."
ssh "$SERVER" 'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && pm2 restart agents'
echo "Done."
