"""
L.U.N.A Backend Server  v7
─────────────────────────────────────────────────────────────────────────────
NEW in v7:
  • /api/realtime  — live date/time, weather (Open-Meteo), news (BBC RSS)
  • /api/system    — open/close browsers & apps, web search, media playback
  • Real-time context auto-injected when user asks about weather/news/time
─────────────────────────────────────────────────────────────────────────────
"""

from flask import Flask, request, jsonify, render_template, Response
from flask_cors import CORS
import requests
import json
import logging

from file_processor  import process_file, is_vision_model
from realtime        import get_realtime_context, format_context_for_ai, get_datetime
from system_control  import execute_command

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s — %(message)s")
logger = logging.getLogger("LUNA")

app = Flask(
    __name__,
    template_folder="../frontend/templates",
    static_folder="../frontend/static"
)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024   # 100 MB

OLLAMA_URL = "http://localhost:11434"

# ── Prompts ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You are Luna — a highly intelligent, warm, and slightly witty female AI assistant "
    "running fully locally on the user's machine. You are loyal, caring, and helpful with "
    "any task: coding, writing, research, planning, analysis, file analysis, or casual "
    "conversation. Keep responses concise and direct. You have a calm, confident, and "
    "elegant personality. Occasionally add gentle warmth or light humor. "
    "Never break character as Luna.\n"
    "IMPORTANT: You always have access to the full conversation history in this session. "
    "Use it to give context-aware, consistent answers.\n"
    "REAL-TIME ACCESS: When real-time context (date, time, weather, news) is provided in "
    "the conversation, use it to give accurate, up-to-date answers. Never say you don't "
    "know the current date, time, or weather — use the provided data."
)

FILE_CONTEXT_PROMPT = (
    "The user has shared the following file content:\n\n"
    "--- FILE CONTENT START ---\n"
    "{content}\n"
    "--- FILE CONTENT END ---\n\n"
    "Please analyse the above and respond to the user's request. "
    "If no specific question is asked, provide a thorough summary and highlight key insights."
)

SUMMARY_PROMPT = (
    "Summarise the following conversation history in 3–5 sentences, "
    "capturing all key topics, facts, decisions, and any code or data discussed. "
    "This summary will be injected as context for a continuing conversation.\n\n"
    "{history_text}"
)

# ── Context window management ──────────────────────────────────────────────────
MAX_HISTORY_CHARS = 24_000
MAX_RECENT_TURNS  = 40

# ── Real-time keyword detection ────────────────────────────────────────────────
REALTIME_KEYWORDS = {
    "weather", "temperature", "forecast", "rain", "snow", "sunny", "cloudy",
    "wind", "humid", "hot", "cold", "warm",
    "news", "headline", "happening", "today", "latest",
    "time", "date", "day", "month", "year", "what time", "what day",
    "current", "right now", "at the moment",
}


def _needs_realtime(message: str) -> bool:
    msg = message.lower()
    return any(kw in msg for kw in REALTIME_KEYWORDS)


def _total_chars(messages: list) -> int:
    return sum(len(str(m.get("content", ""))) for m in messages)


def _summarise_old_turns(old_turns: list, model: str) -> str:
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in old_turns
    )
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": [{"role": "user", "content": SUMMARY_PROMPT.format(history_text=history_text)}],
                "stream": False
            },
            timeout=60
        )
        return resp.json().get("message", {}).get("content", "")
    except Exception as exc:
        logger.warning("Summary call failed: %s", exc)
        return ""


def build_message_list(history, user_content, user_images, model, file_context, inject_realtime=False):
    if len(history) > MAX_RECENT_TURNS:
        old    = history[:-MAX_RECENT_TURNS]
        recent = history[-MAX_RECENT_TURNS:]
    else:
        old    = []
        recent = history[:]

    if _total_chars(recent) > MAX_HISTORY_CHARS:
        recent = recent[-10:]
        old    = history[:-10] if len(history) > 10 else []

    context_prefix = []
    if old:
        summary = _summarise_old_turns(old, model)
        if summary:
            context_prefix = [{
                "role": "assistant",
                "content": "[Earlier conversation summary — use as context]\n" + summary
            }]
            logger.info("Summarised %d old turns", len(old))

    # Build system content (with optional realtime injection)
    system_content = SYSTEM_PROMPT
    if inject_realtime:
        try:
            ctx      = get_realtime_context()
            rt_text  = format_context_for_ai(ctx)
            if rt_text:
                system_content = SYSTEM_PROMPT + "\n\n[REAL-TIME DATA]\n" + rt_text
                logger.info("Injected real-time context into system prompt")
        except Exception as e:
            logger.warning("Real-time injection failed: %s", e)

    user_text = user_content
    if file_context:
        block     = FILE_CONTEXT_PROMPT.format(content=file_context[:13_000])
        user_text = block + ("\n\nUser question: " + user_content if user_content else "")

    user_msg: dict = {"role": "user", "content": user_text or "(analyse the attached file)"}
    if user_images:
        if is_vision_model(model):
            user_msg["images"] = user_images
        else:
            user_msg["content"] = (
                f"[Images attached but '{model}' doesn't support vision. "
                "Switch to llava or llama3.2-vision.]\n\n" + user_msg["content"]
            )

    messages = (
        [{"role": "system", "content": system_content}]
        + context_prefix
        + recent
        + [user_msg]
    )

    logger.info("Chat — model=%s  turns=%d  chars≈%d  realtime=%s",
                model, len(recent), _total_chars(messages), inject_realtime)
    return messages


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def status():
    try:
        res    = requests.get(f"{OLLAMA_URL}/api/tags", timeout=4)
        models = [m["name"] for m in res.json().get("models", [])]
        return jsonify({"status": "online", "models": models})
    except Exception as e:
        return jsonify({"status": "offline", "error": str(e)}), 503


@app.route("/api/models")
def list_models():
    try:
        res    = requests.get(f"{OLLAMA_URL}/api/tags", timeout=4)
        models = [m["name"] for m in res.json().get("models", [])]
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"models": [], "error": str(e)}), 503


@app.route("/api/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file received"}), 400
    f          = request.files["file"]
    filename   = f.filename or "unnamed"
    file_bytes = f.read()
    if not file_bytes:
        return jsonify({"error": "Uploaded file is empty"}), 400
    logger.info("Processing upload: %s (%d bytes)", filename, len(file_bytes))
    return jsonify(process_file(filename, file_bytes))


@app.route("/api/realtime")
def realtime():
    """Return current date/time, weather, and news headlines."""
    try:
        ctx = get_realtime_context()
        return jsonify(ctx)
    except Exception as e:
        logger.exception("Realtime fetch error")
        return jsonify({"error": str(e)}), 500


@app.route("/api/system", methods=["POST"])
def system_cmd():
    """Execute a system command (open/close app/browser, search, play media)."""
    data = request.json or {}
    logger.info("System command: %s", data)
    try:
        result = execute_command(data)
        return jsonify(result)
    except Exception as e:
        logger.exception("System command error")
        return jsonify({"ok": False, "msg": str(e)}), 500


@app.route("/api/chat", methods=["POST"])
def chat():
    data         = request.json or {}
    model        = data.get("model",        "llama3.2")
    history      = data.get("history",      [])
    message      = data.get("message",      "")
    file_context = data.get("file_context")
    images       = data.get("images",       [])

    inject_rt = _needs_realtime(message)
    messages  = build_message_list(history, message, images, model, file_context, inject_rt)

    def generate():
        try:
            with requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={"model": model, "messages": messages, "stream": True},
                stream=True,
                timeout=180
            ) as resp:
                for line in resp.iter_lines():
                    if line:
                        chunk = json.loads(line)
                        token = chunk.get("message", {}).get("content", "")
                        done  = chunk.get("done", False)
                        yield f"data: {json.dumps({'token': token, 'done': done})}\n\n"
                        if done:
                            break
        except Exception as exc:
            logger.exception("Stream error")
            yield f"data: {json.dumps({'error': str(exc), 'done': True})}\n\n"

    return Response(generate(), mimetype="text/event-stream")


if __name__ == "__main__":
    logger.info("🌙 L.U.N.A starting on http://localhost:5000")
    app.run(debug=True, port=5000, threaded=True)
