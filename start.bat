@echo off
echo.
echo   ╔══════════════════════════════════════╗
echo   ║   LUNA  —  Starting up...    ║
echo   ╚══════════════════════════════════════╝
echo.

:: Install dependencies
echo [1/3] Installing dependencies...
pip install -r requirements.txt -q

:: Start Ollama with CORS
echo [2/3] Starting Ollama server...
set OLLAMA_ORIGINS=*
start /B ollama serve
timeout /t 2 /nobreak >nul

:: Pull model if missing
ollama list | findstr "llama3.2" >nul 2>&1
if errorlevel 1 (
  echo Pulling llama3.2 model...
  ollama pull llama3.2
)

:: Start Flask
echo [3/3] Starting J.A.R.V.I.S...
echo.
echo   Open browser → http://localhost:5000
echo   Press Ctrl+C to stop.
echo.
python backend\server.py
