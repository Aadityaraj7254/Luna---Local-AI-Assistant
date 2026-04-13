# LUNA — Your Local AI Assistant

> Just A Rather Very Intelligent System  
> 100% local · No API key · No cloud · Powered by Ollama

---

## Project Structure

```
jarvis/
├── backend/
│   ├── server.py          # Flask API server (main entry point)
│   ├── ollama_utils.py    # Ollama helper functions
│   └── voice.py           # Offline speech-to-text & text-to-speech
├── frontend/
│   ├── templates/
│   │   └── index.html     # Main UI page
│   └── static/
│       ├── css/
│       │   └── style.css  # All styles
│       └── js/
│           └── main.js    # Chat, streaming, voice logic
├── requirements.txt       # Python dependencies
├── start.sh               # One-click start (Mac/Linux)
├── start.bat              # One-click start (Windows)
└── README.md
```

---

## Quick Start

### Step 1 — Install Ollama
Download from https://ollama.com and install for your OS.

### Step 2 — Pull a model
```bash
# Recommended (needs ~2GB)
ollama pull llama3.2

# Lighter option
ollama pull phi3:mini

# Smarter option (needs 8GB RAM)
ollama pull llama3.1:8b
```

### Step 3 — Run J.A.R.V.I.S

**Mac / Linux:**
```bash
bash start.sh
```

**Windows:**
```bat
start.bat
```

**Manual start:**
```bash
# Terminal 1 — Start Ollama with CORS enabled
OLLAMA_ORIGINS=* ollama serve

# Terminal 2 — Install deps and run Flask
pip install -r requirements.txt
python backend/server.py
```

Then open: http://localhost:5000

---

## API Endpoints

| Method | Endpoint       | Description                        |
|--------|----------------|------------------------------------|
| GET    | `/`            | Serves the Jarvis web UI           |
| GET    | `/api/status`  | Check Ollama status + list models  |
| POST   | `/api/chat`    | Send message, get streamed reply   |
| GET    | `/api/models`  | List locally installed models      |

### POST /api/chat — request body
```json
{
  "model":   "llama3.2",
  "message": "What is quantum computing?",
  "history": [
    { "role": "user",      "content": "Hello" },
    { "role": "assistant", "content": "Hi sir, how can I help?" }
  ]
}
```

---

## Model Guide

| Model         | RAM needed | Best for                       |
|---------------|------------|--------------------------------|
| phi3:mini     | 2 GB       | Low-end PCs, fast responses    |
| gemma2:2b     | 3 GB       | Balanced, good reasoning       |
| llama3.2      | 4 GB       | Best default choice ✅          |
| mistral       | 5 GB       | Strong coding & analysis       |
| llama3.1:8b   | 8 GB       | Most capable local model       |

---

## Adding Voice (Optional)

Install voice dependencies:
```bash
pip install SpeechRecognition pyttsx3 pyaudio
```

Test voice features:
```bash
python backend/voice.py
```

---

## Keyboard Shortcuts

| Shortcut   | Action           |
|------------|------------------|
| Enter      | Send message     |
| Ctrl + L   | Clear chat       |
| 🎤 button  | Voice input      |

---

## Extending Jarvis

Add new tools in `backend/server.py`:

```python
@app.route("/api/tools/weather")
def weather():
    # Add your tool here
    pass
```

Ideas to add:
- Web search (via DuckDuckGo scrape or Brave API)
- File reader (read your PDFs, docs)
- Wake word ("Hey Jarvis") using pvporcupine
- System controls (open apps, set reminders)
- Home automation (via Home Assistant API)
