#!/usr/bin/env bash
set -euo pipefail

SERVER="joel.bystedt@35.228.54.40"

echo "Pulling latest main..."
ssh "$SERVER" 'cd ~/agents && git pull origin main'

echo "Installing dependencies..."
ssh "$SERVER" 'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && cd ~/agents && npm install && cd app && npm install && npm run build'

echo "Restarting server..."
ssh "$SERVER" 'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && pm2 restart agents'

echo "Deploy complete."
