#!/usr/bin/env bash
set -e

echo "Starting TexFlow LaTeX Editor..."
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

exec python3 server.py "$@"
