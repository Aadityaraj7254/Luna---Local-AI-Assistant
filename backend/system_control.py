"""
System Control module for L.U.N.A (Windows)
Handles: opening/closing browsers & apps, media playback, web search.
"""

import os
import subprocess
import webbrowser
import urllib.parse
import logging

logger = logging.getLogger("LUNA.sysctl")

_APPDATA  = os.environ.get("APPDATA",      "")
_LOCALAPP = os.environ.get("LOCALAPPDATA", "")

# ── Known browser executables ─────────────────────────────────────────────────
BROWSER_EXES = {
    "chrome":     [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                   r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"],
    "brave":      [r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
                   r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe"],
    "edge":       [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                   r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"],
    "firefox":    [r"C:\Program Files\Mozilla Firefox\firefox.exe",
                   r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe"],
    "opera":      [r"C:\Program Files\Opera\opera.exe"],
    "duckduckgo": [r"C:\Program Files\DuckDuckGo\DuckDuckGo.exe"],
}
BROWSER_PROCS = {
    "chrome": "chrome.exe", "brave": "brave.exe", "edge": "msedge.exe",
    "firefox": "firefox.exe", "opera": "opera.exe", "duckduckgo": "DuckDuckGo.exe",
}

# ── Known app executables ─────────────────────────────────────────────────────
APP_EXES = {
    "spotify":      [os.path.join(_APPDATA,  "Spotify", "Spotify.exe"),
                     r"C:\Program Files\Spotify\Spotify.exe"],
    "notepad":      ["notepad.exe"],
    "calculator":   ["calc.exe"],
    "paint":        ["mspaint.exe"],
    "vscode":       [os.path.join(_LOCALAPP, "Programs", "Microsoft VS Code", "Code.exe"),
                     r"C:\Program Files\Microsoft VS Code\Code.exe"],
    "vlc":          [r"C:\Program Files\VideoLAN\VLC\vlc.exe",
                     r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"],
    "explorer":     ["explorer.exe"],
    "file explorer":["explorer.exe"],
    "powershell":   ["powershell.exe"],
    "cmd":          ["cmd.exe"],
    "terminal":     ["wt.exe"],
    "discord":      [os.path.join(_LOCALAPP, "Discord", "app-*", "Discord.exe")],
    "telegram":     [os.path.join(_APPDATA,  "Telegram Desktop", "Telegram.exe")],
    "whatsapp":     [os.path.join(_LOCALAPP, "WhatsApp", "WhatsApp.exe")],
    "slack":        [os.path.join(_LOCALAPP, "slack", "slack.exe")],
    "zoom":         [os.path.join(_APPDATA,  "Zoom", "bin", "Zoom.exe")],
    "word":         [r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"],
    "excel":        [r"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE"],
    "powerpoint":   [r"C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE"],
    "task manager": ["taskmgr.exe"],
}
APP_PROCS = {
    "spotify": "Spotify.exe", "notepad": "notepad.exe", "calculator": "CalculatorApp.exe",
    "paint": "mspaint.exe", "vscode": "Code.exe", "vlc": "vlc.exe",
    "discord": "Discord.exe", "telegram": "Telegram.exe", "whatsapp": "WhatsApp.exe",
    "slack": "slack.exe", "zoom": "Zoom.exe",
    "word": "WINWORD.EXE", "excel": "EXCEL.EXE", "powerpoint": "POWERPNT.EXE",
}

# ── Search engine URL templates ───────────────────────────────────────────────
SEARCH_URLS = {
    "google":     "https://www.google.com/search?q={}",
    "bing":       "https://www.bing.com/search?q={}",
    "duckduckgo": "https://duckduckgo.com/?q={}",
    "ddg":        "https://duckduckgo.com/?q={}",
    "youtube":    "https://www.youtube.com/results?search_query={}",
    "yt":         "https://www.youtube.com/results?search_query={}",
    "wikipedia":  "https://en.wikipedia.org/wiki/Special:Search?search={}",
    "reddit":     "https://www.reddit.com/search/?q={}",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _find_exe(paths: list) -> str | None:
    import glob as _glob
    for p in paths:
        expanded = os.path.expandvars(p)
        if "*" in expanded:
            matches = _glob.glob(expanded)
            if matches:
                return matches[0]
        elif os.path.exists(expanded):
            return expanded
    return None


def _kill_proc(proc_name: str) -> bool:
    try:
        result = subprocess.run(
            ["taskkill", "/F", "/IM", proc_name],
            capture_output=True, text=True
        )
        return result.returncode == 0
    except Exception as e:
        logger.warning("taskkill failed for %s: %s", proc_name, e)
        return False


def _launch(exe_list: list, extra_args: list = None) -> bool:
    exe = _find_exe(exe_list)
    if exe:
        try:
            cmd = [exe] + (extra_args or [])
            subprocess.Popen(cmd)
            return True
        except Exception as e:
            logger.warning("Popen failed for %s: %s", exe, e)
    return False


# ── Public API ────────────────────────────────────────────────────────────────

def open_browser(name: str) -> dict:
    name = name.lower().strip().replace(" ", "")
    exes = BROWSER_EXES.get(name)
    if exes and _launch(exes):
        return {"ok": True,  "msg": f"Opened {name.capitalize()}"}
    # Fallback: shell 'start'
    try:
        subprocess.Popen(["start", name], shell=True)
        return {"ok": True,  "msg": f"Opened {name.capitalize()}"}
    except Exception as e:
        return {"ok": False, "msg": f"Could not open {name}: {e}"}


def close_browser(name: str) -> dict:
    name     = name.lower().strip().replace(" ", "")
    proc     = BROWSER_PROCS.get(name, name + ".exe")
    if _kill_proc(proc):
        return {"ok": True,  "msg": f"Closed {name.capitalize()}"}
    return {"ok": False, "msg": f"{name.capitalize()} was not running"}


def open_app(name: str) -> dict:
    key  = name.lower().strip()
    exes = APP_EXES.get(key)
    if exes and _launch(exes):
        return {"ok": True,  "msg": f"Opened {name}"}
    # Fallback: try shell start
    try:
        subprocess.Popen(["start", key], shell=True)
        return {"ok": True,  "msg": f"Attempted to open {name}"}
    except Exception as e:
        return {"ok": False, "msg": f"Could not open {name}: {e}"}


def close_app(name: str) -> dict:
    key  = name.lower().strip()
    proc = APP_PROCS.get(key, name + ".exe")
    if _kill_proc(proc):
        return {"ok": True,  "msg": f"Closed {name}"}
    # Try capitalised variant
    if _kill_proc(name.capitalize() + ".exe"):
        return {"ok": True,  "msg": f"Closed {name}"}
    return {"ok": False, "msg": f"{name} was not running or could not be closed"}


def play_media(query: str, platform: str = "youtube") -> dict:
    platform = platform.lower().strip()
    if platform in ("youtube", "yt"):
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(query)}"
    elif platform == "spotify":
        url = f"https://open.spotify.com/search/{urllib.parse.quote_plus(query)}"
    elif platform == "soundcloud":
        url = f"https://soundcloud.com/search?q={urllib.parse.quote_plus(query)}"
    elif platform == "netflix":
        url = f"https://www.netflix.com/search?q={urllib.parse.quote_plus(query)}"
    else:
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(query)}"
    try:
        webbrowser.open(url)
        return {"ok": True,  "msg": f"Playing '{query}' on {platform.capitalize()}", "url": url}
    except Exception as e:
        return {"ok": False, "msg": f"Could not open media player: {e}"}


def search_web(query: str, engine: str = "google") -> dict:
    engine   = engine.lower().strip()
    template = SEARCH_URLS.get(engine, SEARCH_URLS["google"])
    url      = template.format(urllib.parse.quote_plus(query))
    try:
        webbrowser.open(url)
        return {"ok": True,  "msg": f"Searching '{query}' on {engine.capitalize()}", "url": url}
    except Exception as e:
        return {"ok": False, "msg": f"Could not open search: {e}"}


def execute_command(cmd: dict) -> dict:
    """
    Dispatch a system command dict, e.g.:
      {"action": "open_browser",  "target": "chrome"}
      {"action": "close_app",     "target": "spotify"}
      {"action": "play_media",    "query":  "shape of you", "platform": "youtube"}
      {"action": "search_web",    "query":  "python docs",  "engine":   "google"}
    """
    action = cmd.get("action", "")
    if   action == "open_browser":  return open_browser(cmd.get("target", "chrome"))
    elif action == "close_browser": return close_browser(cmd.get("target", "chrome"))
    elif action == "open_app":      return open_app(cmd.get("target", ""))
    elif action == "close_app":     return close_app(cmd.get("target", ""))
    elif action == "play_media":    return play_media(cmd.get("query", ""), cmd.get("platform", "youtube"))
    elif action == "search_web":    return search_web(cmd.get("query", ""), cmd.get("engine", "google"))
    else:
        return {"ok": False, "msg": f"Unknown action: {action}"}
