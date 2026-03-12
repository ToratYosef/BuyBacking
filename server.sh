#!/bin/bash
PORT=${PORT:-5050}
export PORT
export SPA_FALLBACK=0
echo "🚀 Starting Node server on port $PORT..."
node server.js
