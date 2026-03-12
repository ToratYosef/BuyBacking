#!/bin/bash
PORT=${PORT:-3000}
export PORT
export SPA_FALLBACK=0
echo "🚀 Serving project ROOT (and subfolders) on port $PORT..."
node server.js
