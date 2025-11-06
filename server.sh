#!/bin/bash
PORT=${PORT:-5050}
export PORT
echo "🚀 Starting Node server on port $PORT..."
node server.js
