#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# J.A.R.V.I.S startup script
# Usage: bash start.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   J.A.R.V.I.S  —  Starting up...    ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# 1. Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3 not found. Install from https://python.org"
  exit 1
fi

# 2. Check Ollama
if ! command -v ollama &>/dev/null; then
  echo "❌ Ollama not found. Install from https://ollama.com"
  exit 1
fi

# 3. Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt -q

# 4. Start Ollama in background (with CORS enabled)
echo "🦙 Starting Ollama server..."
OLLAMA_ORIGINS="*" ollama serve &>/dev/null &
OLLAMA_PID=$!
sleep 2

# 5. Pull default model if not present
DEFAULT_MODEL="llama3.2"
if ! ollama list | grep -q "$DEFAULT_MODEL"; then
  echo "⬇  Pulling $DEFAULT_MODEL (first-time setup)..."
  ollama pull "$DEFAULT_MODEL"
fi

echo "✅ Ollama running (PID $OLLAMA_PID)"
echo ""

# 6. Start Flask backend
echo "🚀 Starting J.A.R.V.I.S on http://localhost:5000"
echo ""
echo "  Open your browser → http://localhost:5000"
echo "  Press Ctrl+C to stop."
echo ""

python3 backend/server.py

# Cleanup
kill $OLLAMA_PID 2>/dev/null || true
