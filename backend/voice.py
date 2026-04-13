"""
Voice I/O module for J.A.R.V.I.S.
- Speech-to-Text  : SpeechRecognition (Google free API or offline Vosk)
- Text-to-Speech  : pyttsx3 (offline, cross-platform)
"""

import threading
import queue

try:
    import speech_recognition as sr
    STT_AVAILABLE = True
except ImportError:
    STT_AVAILABLE = False
    print("⚠  speech_recognition not installed. Run: pip install SpeechRecognition pyaudio")

try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False
    print("⚠  pyttsx3 not installed. Run: pip install pyttsx3")


# ── Text-to-Speech ─────────────────────────────────────────────────────────────

class Speaker:
    """Thread-safe TTS speaker."""

    def __init__(self, rate: int = 175, volume: float = 1.0):
        if not TTS_AVAILABLE:
            return
        self._engine = pyttsx3.init()
        self._engine.setProperty("rate", rate)
        self._engine.setProperty("volume", volume)
        self._queue: queue.Queue = queue.Queue()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        while True:
            text = self._queue.get()
            if text is None:
                break
            self._engine.say(text)
            self._engine.runAndWait()

    def speak(self, text: str):
        if TTS_AVAILABLE:
            self._queue.put(text)

    def stop(self):
        if TTS_AVAILABLE:
            self._queue.put(None)


# ── Speech-to-Text ─────────────────────────────────────────────────────────────

class Listener:
    """Microphone listener with noise calibration."""

    def __init__(self, language: str = "en-US"):
        if not STT_AVAILABLE:
            return
        self._recognizer = sr.Recognizer()
        self._language = language

    def listen_once(self, timeout: int = 5) -> str | None:
        """Listen for a single phrase and return transcription."""
        if not STT_AVAILABLE:
            return None
        with sr.Microphone() as source:
            print("🎤 Listening...")
            self._recognizer.adjust_for_ambient_noise(source, duration=0.5)
            try:
                audio = self._recognizer.listen(source, timeout=timeout)
                text = self._recognizer.recognize_google(audio, language=self._language)
                print(f"   You said: {text}")
                return text
            except sr.WaitTimeoutError:
                return None
            except sr.UnknownValueError:
                print("   Could not understand audio.")
                return None
            except sr.RequestError as e:
                print(f"   STT error: {e}")
                return None


# ── Quick test ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    speaker = Speaker()
    speaker.speak("J.A.R.V.I.S voice systems online. Ready to assist.")

    listener = Listener()
    text = listener.listen_once()
    if text:
        speaker.speak(f"You said: {text}")

    speaker.stop()
