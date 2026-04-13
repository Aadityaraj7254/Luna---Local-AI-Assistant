"""
Ollama utility functions — pull models, check health, etc.
"""

import requests
import subprocess
import sys

OLLAMA_URL = "http://localhost:11434"


def is_ollama_running() -> bool:
    try:
        requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        return True
    except:
        return False


def get_installed_models() -> list[str]:
    try:
        res = requests.get(f"{OLLAMA_URL}/api/tags", timeout=4)
        return [m["name"] for m in res.json().get("models", [])]
    except:
        return []


def pull_model(model_name: str) -> None:
    """Pull a model from Ollama registry (blocking, shows progress)."""
    print(f"⬇  Pulling {model_name} — this may take a few minutes...")
    subprocess.run(["ollama", "pull", model_name], check=True)
    print(f"✅ {model_name} ready.")


def chat_once(model: str, prompt: str, system: str = "") -> str:
    """Single non-streaming chat call — useful for testing."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    res = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={"model": model, "messages": messages, "stream": False},
        timeout=60
    )
    return res.json()["message"]["content"]


if __name__ == "__main__":
    if not is_ollama_running():
        print("❌ Ollama is not running.")
        print("   Start it with:  OLLAMA_ORIGINS=* ollama serve")
        sys.exit(1)

    models = get_installed_models()
    print(f"✅ Ollama online  |  Models: {models or 'none installed'}")

    if models:
        reply = chat_once(models[0], "Say hello as Jarvis in one sentence.")
        print(f"\nJARVIS: {reply}")
