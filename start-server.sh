#!/bin/bash
PORT=${PORT:-3000}
export PORT
echo "🚀 Serving project ROOT (and subfolders) on port $PORT..."
node server.js
