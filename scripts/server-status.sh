#!/usr/bin/env bash
set -euo pipefail

SERVER="joel.bystedt@35.228.54.40"

ssh "$SERVER" 'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && pm2 status agents'
