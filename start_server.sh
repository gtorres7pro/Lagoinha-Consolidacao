#!/bin/bash
# Move to the project root directory
cd "$(dirname "$0")"

# Activate the virtual environment
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

echo "🚀 Starting Lagoinha Consolidação Backend Server..."
# Move to the backend folder and start uvicorn
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
