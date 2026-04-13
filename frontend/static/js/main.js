/* ═══════════════════════════════════════════════════════════════════════════
   L.U.N.A — main.js  v8
   ═══════════════════════════════════════════════════════════════════════════
   NEW IN v8:
   ✅ "luna on" → mic starts instantly (no delay)
   ✅ "send" voice command → submits to AI  |  button click → stops only
   ✅ Auto-stop after 10s (NO auto-send — text stays in box)
   ✅ Real-time data: weather, news, date/time via /api/realtime
   ✅ System commands: open/close browsers & apps via /api/system
   ✅ Media playback: play songs/videos on YouTube/Spotify via voice
   ✅ Web search: voice search on Google/YouTube/DuckDuckGo etc.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

// ── Global State ──────────────────────────────────────────────────────────────
let connected = false;
let msgCount = 0;
let lunaActive = true;
let ttsEnabled = true;
let voiceSpeed = 1.0;
let voicesList = [];
let attachedFiles = [];
let streamAbort = null;

let history = [];
let richHistory = [];

// ── Voice System ──────────────────────────────────────────────────────────────
let voiceSystemOn = false;
let micInputMode = false;
let micBuffer = "";
let loopRecog = null;
let loopRestarting = false;
let micAutoTimer = null;
let micSilenceTimer = null;   // 5-second silence → auto-send

let manualRecog = null;
let manualActive = false;

// TTS
let ttsBuffer = "";
let ttsQueue = [];
let ttsSpeaking = false;

// Real-time context (fetched on connect)
let realtimeContext = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const chat = document.getElementById("chat");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const connBtn = document.getElementById("connBtn");
const modelSel = document.getElementById("modelSel");
const modelDisplayBtn = document.getElementById("modelDisplayBtn");
const modelDisplayName = document.getElementById("modelDisplayName");
const dot = document.getElementById("dot");
const statusTxt = document.getElementById("statusTxt");
const msgCountEl = document.getElementById("msgCount");
const activeModelEl = document.getElementById("activeModel");
const sideStatusEl = document.getElementById("sideStatus");
const assistantStateEl = document.getElementById("assistantState");
const micStatusEl = document.getElementById("micStatus");
const ttsStatusEl = document.getElementById("ttsStatus");
const wakeStatusEl = document.getElementById("wakeStatus");
const micStatusBar = document.getElementById("micStatusBar");
const lunaStateBadge = document.getElementById("lunaStateBadge");
const lunaToggleBtn = document.getElementById("lunaToggleBtn");
const voiceCmdBtn = document.getElementById("voiceCmdBtn");
const speedSlider = document.getElementById("speedSlider");
const speedValEl = document.getElementById("speedVal");
const quickChips = document.getElementById("quickChips");
const fileStrip = document.getElementById("fileStrip");
const fileInput = document.getElementById("fileInput");
const attachBtn = document.querySelector(".attach-btn");
const uploadProgress = document.getElementById("uploadProgress");
const uploadLabel = document.getElementById("uploadLabel");
const dropOverlay = document.getElementById("dropOverlay");
const historyPanel = document.getElementById("historyPanel");
const historyOverlay = document.getElementById("historyOverlay");
const historyList = document.getElementById("historyList");
const modelModal = document.getElementById("modelModal");
const modelModalOvl = document.getElementById("modelModalOverlay");
const modelGrid = document.getElementById("modelGrid");
const contextTurnsEl = document.getElementById("contextTurns");
const stopBtn = document.getElementById("stopBtn");
const speakerBtn = document.getElementById("speakerBtn");

// ══════════════════════════════════════════════════════════════════════════════
// TEXTAREA
// ══════════════════════════════════════════════════════════════════════════════
function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}
function resetTextarea() {
  msgInput.value = "";
  msgInput.style.height = "auto";
  msgInput.classList.remove("recording");
}
msgInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});
msgInput.addEventListener("input", () => autoResizeTextarea(msgInput));

// ══════════════════════════════════════════════════════════════════════════════
// MARKDOWN RENDERER WITH CODE BLOCKS
// ══════════════════════════════════════════════════════════════════════════════
function renderMarkdown(text) {
  // First escape HTML
  let html = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const codeId = "cb-" + Math.random().toString(36).slice(2, 9);
    const langHtml = lang ? `<span class="code-lang">${lang}</span>` : "";
    return `<div class="code-block">`
      + `<div class="code-header">${langHtml}<button class="code-copy-btn" onclick="copyCodeBlock('${codeId}')">⎘ COPY</button></div>`
      + `<pre id="${codeId}" class="code-pre">${code.trimEnd()}</pre>`
      + `</div>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h">$1</h1>');

  // Lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Line breaks (skip inside code blocks)
  html = html.replace(/\n/g, "<br>");

  return html;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function copyCodeBlock(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const txt = el.innerText || el.textContent;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = el.previousElementSibling?.querySelector(".code-copy-btn")
      || el.closest(".code-block")?.querySelector(".code-copy-btn");
    if (btn) { btn.textContent = "✓ COPIED"; setTimeout(() => btn.textContent = "⎘ COPY", 2000); }
  }).catch(() => fallbackCopy(txt));
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand("copy"); } catch (e) { }
  document.body.removeChild(ta);
}

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════
function showToast(msg) {
  let t = document.getElementById("lunaToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "lunaToast"; t.className = "luna-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ══════════════════════════════════════════════════════════════════════════════
// COPY BUBBLE / COPY FULL CHAT
// ══════════════════════════════════════════════════════════════════════════════
function copyBubble(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = "✓";
    setTimeout(() => btn.textContent = orig, 1800);
  }).catch(() => fallbackCopy(text));
}

function copyFullChat() {
  if (!richHistory.length) { addSysMsg("Nothing to copy yet."); return; }
  const lines = richHistory
    .filter(r => r.role !== "sys")
    .map(r => `[${r.time || ""}] ${r.role === "ai" ? "LUNA" : "YOU"}:\n${r.content}`)
    .join("\n\n---\n\n");
  navigator.clipboard.writeText(lines)
    .then(() => showToast("✓ Full chat copied!"))
    .catch(() => { fallbackCopy(lines); showToast("✓ Chat copied!"); });
}

function copyHistItem(idx) {
  const item = richHistory[idx]; if (!item) return;
  const who = item.role === "ai" ? "LUNA" : "YOU";
  const text = `[${item.time || ""}] ${who}:\n${item.content}`;
  navigator.clipboard.writeText(text)
    .then(() => showToast("✓ Message copied!"))
    .catch(() => { fallbackCopy(text); showToast("✓ Copied!"); });
}

// ══════════════════════════════════════════════════════════════════════════════
// STOP STREAM
// ══════════════════════════════════════════════════════════════════════════════
function stopStream() {
  if (streamAbort) { streamAbort.abort(); streamAbort = null; }
  stopTTS();
  if (stopBtn) stopBtn.classList.remove("active");
  sendBtn.disabled = false;
  setMicBar("");
}

// ══════════════════════════════════════════════════════════════════════════════
// SPEAKER TOGGLE (works during speech too)
// ══════════════════════════════════════════════════════════════════════════════
function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  ttsStatusEl.textContent = ttsEnabled ? "On" : "Off";
  if (speakerBtn) {
    speakerBtn.textContent = ttsEnabled ? "🔊" : "🔇";
    speakerBtn.title = ttsEnabled ? "Mute speaker" : "Unmute speaker";
    speakerBtn.classList.toggle("muted", !ttsEnabled);
  }
  if (!ttsEnabled) stopTTS();
  else showToast("🔊 Speaker ON");
}

// ══════════════════════════════════════════════════════════════════════════════
// TTS
// ══════════════════════════════════════════════════════════════════════════════
function loadVoices() { voicesList = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
if (window.speechSynthesis) { loadVoices(); speechSynthesis.addEventListener("voiceschanged", loadVoices); }

function getBestFemaleVoice() {
  if (!voicesList.length) voicesList = speechSynthesis.getVoices();
  const preferred = ["Microsoft Zira", "Microsoft Aria", "Microsoft Jenny", "Google US English",
    "Samantha", "Victoria", "Karen", "Moira", "Tessa", "Fiona"];
  for (const n of preferred) { const v = voicesList.find(v => v.name.includes(n)); if (v) return v; }
  const hints = ["zira", "aria", "jenny", "samantha", "victoria", "karen", "moira", "tessa", "fiona", "female", "woman"];
  for (const h of hints) { const v = voicesList.find(v => v.name.toLowerCase().includes(h)); if (v) return v; }
  return voicesList.find(v => v.lang === "en-US") || voicesList[0] || null;
}

function flushTTSBuffer(force = false) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  const re = /([.!?]\s+|[.!?]$|\n\n)/g;
  let match, last = 0;
  while ((match = re.exec(ttsBuffer)) !== null) {
    const s = ttsBuffer.slice(last, match.index + match[0].length).trim();
    last = match.index + match[0].length;
    if (s.length > 3) ttsQueue.push(s);
  }
  if (force && last < ttsBuffer.length) {
    const r = ttsBuffer.slice(last).trim(); if (r.length > 2) ttsQueue.push(r); ttsBuffer = "";
  } else ttsBuffer = ttsBuffer.slice(last);
  drainTTSQueue();
}

function drainTTSQueue() {
  if (ttsSpeaking || !ttsQueue.length || !ttsEnabled) return;
  const text = ttsQueue.shift(); if (!text) return;
  ttsSpeaking = true;
  const clean = text.replace(/<[^>]*>/g, "").replace(/[*_`#>]/g, "").trim();
  if (!clean) { ttsSpeaking = false; drainTTSQueue(); return; }
  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate = voiceSpeed; utt.pitch = 1.1; utt.volume = 1.0;
  const go = () => {
    const v = getBestFemaleVoice(); if (v) utt.voice = v;
    utt.onend = utt.onerror = () => { ttsSpeaking = false; drainTTSQueue(); };
    speechSynthesis.speak(utt);
  };
  voicesList.length > 0 ? go() : setTimeout(go, 300);
}

function speak(text) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  speechSynthesis.cancel(); ttsQueue = []; ttsSpeaking = false; ttsBuffer = "";
  const clean = text.replace(/<[^>]*>/g, "").replace(/[*_`#>]/g, "").replace(/\n+/g, ". ").trim().substring(0, 600);
  if (!clean) return;
  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate = voiceSpeed; utt.pitch = 1.1; utt.volume = 1.0;
  const go = () => { const v = getBestFemaleVoice(); if (v) utt.voice = v; speechSynthesis.speak(utt); };
  voicesList.length > 0 ? go() : setTimeout(go, 300);
}

function stopTTS() { speechSynthesis.cancel(); ttsQueue = []; ttsSpeaking = false; ttsBuffer = ""; }
function updateSpeed(val) { voiceSpeed = parseFloat(val); speedValEl.textContent = voiceSpeed.toFixed(1) + "×"; }

// ══════════════════════════════════════════════════════════════════════════════
// VOICE SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
function toggleVoiceCommands() {
  if (voiceSystemOn) stopVoiceSystem(); else startVoiceSystem();
}

function startVoiceSystem() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addSysMsg("⚠ Voice commands require Chrome or Edge browser."); return; }
  if (!isSecureCtx()) { addSysMsg("⚠ Voice commands require http://localhost:5000"); return; }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(() => {
      voiceSystemOn = true;
      loopRestarting = false;
      wakeStatusEl.textContent = "Active";
      voiceCmdBtn.textContent = "VOICE CMDS: ON";
      voiceCmdBtn.classList.add("active");
      micBtn.classList.add("wake-on");
      addSysMsg('✦ Voice system ON\n"luna on" → 🎤 starts recording instantly\nAuto-sends after 5s silence\nClick 🔴 → stop (no send)\n\nSystem commands:\n"open chrome/brave/edge/spotify"\n"play [song] on youtube/spotify"\n"search [query] on google/youtube"\n"close [app]"');
      speak('Voice system on. Say luna on to start.');
      spawnLoopRecog();
    })
    .catch(err => {
      addSysMsg("⚠ Mic denied: " + err.message + "\n\nFix: Click 🔒 → Microphone → Allow → Refresh");
    });
}

function spawnLoopRecog() {
  if (!voiceSystemOn || loopRestarting) return;
  loopRestarting = true;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { loopRestarting = false; return; }

  if (loopRecog) {
    try { loopRecog.onend = null; loopRecog.onerror = null; loopRecog.stop(); } catch (e) { }
    loopRecog = null;
  }

  const recog = new SR();
  recog.continuous = false;
  recog.interimResults = true;
  recog.lang = "en-US";
  recog.maxAlternatives = 1;
  loopRecog = recog;

  recog.onresult = (e) => {
    let interim = "", finalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }

    if (micInputMode) {
      // ─── Recording mode ───────────────────────────────────────────────────
      if (finalText) {
        const ft = finalText.toLowerCase().trim();
        // "send" as a standalone utterance → submit immediately
        if (ft === "send" || ft === "luna send" || ft === "okay send" || ft === "ok send") {
          executeMicOff(true);
          return;
        }
        micBuffer += finalText + " ";
      }
      const live = (micBuffer + (interim || "")).trim();
      msgInput.value = live;
      autoResizeTextarea(msgInput);
      // ← Reset 5-second silence countdown on every speech event
      if (interim || finalText) resetSilenceTimer();
      setMicBar(interim ? `🔴  "${interim}"` : '🔴  Listening — auto-sends after 5s silence…');
    } else {
      // ─── Wake / command mode ──────────────────────────────────────────────
      if (finalText) processVoiceCommand(finalText.toLowerCase().trim());
      if (interim) setMicBar(`👂  "${interim}"`);
      else setMicBar("");
    }
  };

  recog.onerror = (e) => {
    loopRestarting = false;
    if (e.error === "not-allowed") { stopVoiceSystem(); addSysMsg("⚠ Mic permission denied."); return; }
    scheduleRestart(400);
  };

  // Near-instant restart when in mic-input mode for continuous transcription
  recog.onend = () => {
    loopRestarting = false;
    if (voiceSystemOn) scheduleRestart(micInputMode ? 30 : 150);
  };

  const startDelay = micInputMode ? 20 : 80;
  setTimeout(() => {
    loopRestarting = false;
    if (!voiceSystemOn) return;
    try { recog.start(); } catch (e) { scheduleRestart(500); }
  }, startDelay);
}

function scheduleRestart(ms) {
  if (!voiceSystemOn || loopRestarting) return;
  setTimeout(() => { if (voiceSystemOn) spawnLoopRecog(); }, ms);
}

// ── System command dispatcher ─────────────────────────────────────────────────
async function callSystemAPI(cmd) {
  try {
    addSysMsg(`➤ ${cmd.action.replace(/_/g, " ")}: ${cmd.target || cmd.query || ""}`);
    const res = await fetch("/api/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd)
    });
    const data = await res.json();
    if (data.ok) { addSysMsg("✦ " + data.msg); speak(data.msg); }
    else { addSysMsg("⚠ " + data.msg); }
  } catch (e) {
    addSysMsg("⚠ System command failed: " + e.message);
  }
}

function handleSystemCommand(phrase) {
  const p = phrase.toLowerCase().trim();

  // Open browser (specific match first)
  const obm = p.match(/^(?:open|launch|start)\s+(chrome|brave|edge|firefox|opera|duckduckgo|duck\s*duck\s*go)/);
  if (obm) { callSystemAPI({ action: "open_browser", target: obm[1].replace(/\s+/g, "") }); return true; }

  // Close browser
  const cbm = p.match(/^(?:close|quit|exit|kill)\s+(chrome|brave|edge|firefox|opera|duckduckgo)/);
  if (cbm) { callSystemAPI({ action: "close_browser", target: cbm[1] }); return true; }

  // Play on YouTube
  const pym = p.match(/^play\s+(.+?)\s+(?:on\s+)?(?:youtube|yt)$/);
  if (pym) { callSystemAPI({ action: "play_media", query: pym[1], platform: "youtube" }); return true; }

  // Play on Spotify
  const psm = p.match(/^play\s+(.+?)\s+(?:on\s+)?spotify$/);
  if (psm) { callSystemAPI({ action: "play_media", query: psm[1], platform: "spotify" }); return true; }

  // Play on Netflix
  const pnm = p.match(/^(?:play|watch)\s+(.+?)\s+(?:on\s+)?netflix$/);
  if (pnm) { callSystemAPI({ action: "play_media", query: pnm[1], platform: "netflix" }); return true; }

  // Generic play → YouTube
  const pm = p.match(/^play\s+(.+)$/);
  if (pm) { callSystemAPI({ action: "play_media", query: pm[1], platform: "youtube" }); return true; }

  // Search [query] on [engine]
  const som = p.match(/^search\s+(.+?)\s+on\s+(google|bing|duckduckgo|ddg|youtube|yt|wikipedia|reddit)$/);
  if (som) { callSystemAPI({ action: "search_web", query: som[1], engine: som[2] }); return true; }

  // Search [engine] for [query]
  const sfm = p.match(/^search\s+(google|bing|duckduckgo|youtube|wikipedia|reddit)\s+for\s+(.+)$/);
  if (sfm) { callSystemAPI({ action: "search_web", query: sfm[2], engine: sfm[1] }); return true; }

  // YouTube search
  const ytm = p.match(/^(?:search\s+)?youtube\s+(?:for\s+)?(.+)$/);
  if (ytm) { callSystemAPI({ action: "search_web", query: ytm[1], engine: "youtube" }); return true; }

  // Open app (after browser checks)
  const oam = p.match(/^(?:open|launch|start)\s+(.+)$/);
  if (oam) {
    const browsers = ["chrome", "brave", "edge", "firefox", "opera", "duckduckgo"];
    const tgt = oam[1].trim();
    if (browsers.some(b => tgt.includes(b))) callSystemAPI({ action: "open_browser", target: tgt.replace(/\s+/g, "") });
    else callSystemAPI({ action: "open_app", target: tgt });
    return true;
  }

  // Close app
  const cam = p.match(/^(?:close|quit|exit|kill)\s+(.+)$/);
  if (cam) {
    const browsers = ["chrome", "brave", "edge", "firefox", "opera"];
    const tgt = cam[1].trim();
    if (browsers.some(b => tgt.includes(b))) callSystemAPI({ action: "close_browser", target: tgt });
    else callSystemAPI({ action: "close_app", target: tgt });
    return true;
  }

  return false;
}

function processVoiceCommand(phrase) {
  setMicBar("");

  // "luna on" / "mic on" — start recording instantly
  if ((phrase.includes("luna on") && !phrase.includes("luna only")) || phrase.includes("mic on")) {
    if (!micInputMode) {
      micInputMode = true;
      micBuffer = "";
      micBtn.classList.remove("wake-on");
      micBtn.classList.add("luna-recording");
      micBtn.textContent = "🔴";
      micStatusEl.textContent = "Recording…";
      msgInput.classList.add("recording");
      setMicBar('🔴  Recording — speak freely. Auto-sends after 5s silence. Click 🔴 to cancel.');
      speak("Recording");   // ← single word: near-zero delay before mic is live
      addSysMsg('✦ Mic ON — speak now. Auto-sends after 5s silence. Click 🔴 to cancel (no send).');
      resetSilenceTimer();  // start 5-second silence countdown immediately
      // Immediate restart so mic goes live right now
      if (loopRecog) {
        loopRecog.onend = () => { loopRestarting = false; spawnLoopRecog(); };
        try { loopRecog.stop(); } catch (e) { loopRestarting = false; spawnLoopRecog(); }
      }
    }
    return;
  }

  // System commands
  if (handleSystemCommand(phrase)) return;

  // Unknown phrase — show briefly
  setMicBar(`👂  Heard: "${phrase}"`);
  setTimeout(() => setMicBar(""), 2500);
}

function clearMicAutoTimer() {
  if (micAutoTimer) { clearTimeout(micAutoTimer); micAutoTimer = null; }
  if (micSilenceTimer) { clearTimeout(micSilenceTimer); micSilenceTimer = null; }
}

// Resets (or starts) the 5-second silence → auto-send countdown
function resetSilenceTimer() {
  if (!micInputMode) return;
  if (micSilenceTimer) clearTimeout(micSilenceTimer);
  micSilenceTimer = setTimeout(() => {
    if (!micInputMode) return;
    const captured = micBuffer.trim() || msgInput.value.trim();
    if (captured) {
      addSysMsg("✦ 5s silence detected — auto-sending to Luna…");
      executeMicOff(true);   // auto-send
    } else {
      addSysMsg("✦ 5s silence — nothing captured. Mic off.");
      executeMicOff(false);  // nothing to send, just stop
    }
  }, 5000);
}

function executeMicOff(autoSend = false) {
  clearMicAutoTimer();
  micInputMode = false;

  micBtn.classList.remove("luna-recording", "mic-input-active", "listening");
  if (voiceSystemOn) micBtn.classList.add("wake-on");
  micBtn.textContent = "🎤";
  micStatusEl.textContent = voiceSystemOn ? "Ready" : "Off";
  msgInput.classList.remove("recording");
  setMicBar("");

  const text = micBuffer.trim() || msgInput.value.trim();
  micBuffer = "";
  msgInput.value = text;
  autoResizeTextarea(msgInput);

  if (autoSend && text && connected && lunaActive) {
    speak("Got it. Sending.");
    addSysMsg("✦ Sending to Luna…");
    setTimeout(sendMsg, 300);
  } else if (text) {
    addSysMsg("✦ Mic OFF — text ready in input. Press SEND when ready.");
  } else {
    addSysMsg("✦ Mic OFF — nothing captured.");
  }
}

function stopVoiceSystem() {
  voiceSystemOn = false;
  micInputMode = false;
  micBuffer = "";
  loopRestarting = false;
  clearMicAutoTimer();

  if (loopRecog) {
    try { loopRecog.onend = null; loopRecog.onerror = null; loopRecog.stop(); } catch (e) { }
    loopRecog = null;
  }

  wakeStatusEl.textContent = "Off";
  voiceCmdBtn.textContent = "VOICE CMDS: OFF";
  voiceCmdBtn.classList.remove("active");
  micBtn.classList.remove("wake-on", "luna-recording", "mic-input-active", "listening");
  micBtn.textContent = "🎤";
  micStatusEl.textContent = "Off";
  msgInput.classList.remove("recording");
  setMicBar("");
  addSysMsg("✦ Voice system OFF");
}



// ── Manual mic (button click) ─────────────────────────────────────────────────
function manualMicToggle() {
  if (voiceSystemOn) {
    if (micInputMode) { executeMicOff(false); return; }  // button = stop only, no send
    micInputMode = true; micBuffer = "";
    micBtn.classList.remove("wake-on"); micBtn.classList.add("luna-recording");
    micBtn.textContent = "🔴";
    micStatusEl.textContent = "Recording…";
    msgInput.classList.add("recording");
    setMicBar('🔴  Recording — auto-sends after 5s silence. Click 🔴 to cancel.');
    addSysMsg("✦ Mic ON — auto-sends after 5s silence.");
    clearMicAutoTimer();
    resetSilenceTimer();   // 5-second silence → auto-send
    return;
  }


  if (!isSecureCtx()) { addMsg("ai", "Microphone requires http://localhost:5000"); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addSysMsg("Voice input requires Chrome or Edge."); return; }
  if (manualActive) { stopManualMic(); return; }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(() => startManualMic())
    .catch(err => addMsg("ai", "Microphone blocked.\n\n1. Click 🔒 in address bar\n2. Microphone → Allow\n3. Refresh\n\n" + err.message));
}

function startManualMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  manualRecog = new SR();
  manualRecog.continuous = false; manualRecog.interimResults = true; manualRecog.lang = "en-US";
  manualActive = true;
  micBtn.classList.add("listening"); micBtn.textContent = "🔴";
  micStatusEl.textContent = "Listening…"; setMicBar("🎤  Listening — speak now…");

  manualRecog.onresult = e => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    msgInput.value = final || interim;
    autoResizeTextarea(msgInput);
    setMicBar(interim ? `🎤  "${interim}"` : "");
  };
  manualRecog.onend = () => {
    manualActive = false; micBtn.classList.remove("listening"); micBtn.textContent = "🎤";
    micStatusEl.textContent = "Ready"; setMicBar("");
    if (msgInput.value.trim() && connected && lunaActive) setTimeout(sendMsg, 200);
  };
  manualRecog.onerror = e => {
    manualActive = false; micBtn.classList.remove("listening"); micBtn.textContent = "🎤"; setMicBar("");
    const m = { "not-allowed": "Mic denied.", "no-speech": "No speech detected.", "audio-capture": "No mic found." };
    if (m[e.error]) addMsg("ai", m[e.error]);
    micStatusEl.textContent = "Ready";
  };
  try { manualRecog.start(); } catch (e) { }
}

function stopManualMic() {
  if (manualRecog) { try { manualRecog.stop(); } catch (e) { } }
  manualActive = false; micBtn.classList.remove("listening"); micBtn.textContent = "🎤";
  micStatusEl.textContent = "Ready"; setMicBar("");
}

function isSecureCtx() {
  return location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
}

// ══════════════════════════════════════════════════════════════════════════════
// LUNA ASSISTANT ON / OFF
// ══════════════════════════════════════════════════════════════════════════════
function toggleAssistant() {
  lunaActive = !lunaActive; applyLunaState();
  addSysMsg(lunaActive ? "✦ LUNA ACTIVATED" : "✦ LUNA DEACTIVATED");
  if (lunaActive) speak("I am back online. How can I help you?");
}
function applyLunaState() {
  lunaToggleBtn.textContent = lunaActive ? "LUNA: ON" : "LUNA: OFF";
  lunaStateBadge.textContent = lunaActive ? "ACTIVE" : "OFFLINE";
  lunaStateBadge.classList.toggle("off", !lunaActive);
  assistantStateEl.textContent = lunaActive ? "On" : "Off";
  document.body.classList.toggle("luna-off", !lunaActive);
  const hb = document.getElementById("assistantHeaderBtn");
  if (hb) { hb.textContent = lunaActive ? "⏻ LUNA ON" : "⏻ LUNA OFF"; hb.classList.toggle("luna-off-btn", !lunaActive); }
}

// ══════════════════════════════════════════════════════════════════════════════
// STATUS
// ══════════════════════════════════════════════════════════════════════════════
function setStatus(state) {
  dot.className = "dot " + (state === "online" ? "online" : state === "error" ? "error" : "");
  statusTxt.className = "status-txt " + (state === "online" ? "online" : state === "error" ? "error" : "");
  statusTxt.textContent = state.toUpperCase();
  sideStatusEl.textContent = state === "online" ? "Online" : state === "error" ? "Error" : "Offline";
}
function setMicBar(text) { micStatusBar.textContent = text; micStatusBar.classList.toggle("active", !!text); }
function updateContextCounter() { if (contextTurnsEl) contextTurnsEl.textContent = history.length; }

// ══════════════════════════════════════════════════════════════════════════════
// CONNECT
// ══════════════════════════════════════════════════════════════════════════════
async function checkStatus() {
  connBtn.textContent = "CHECKING…"; connBtn.classList.remove("linked");
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.status === "online") {
      connected = true; setStatus("online");
      connBtn.textContent = "✓ LINKED"; connBtn.classList.add("linked"); sendBtn.disabled = false;
      if (data.models?.length) {
        modelSel.innerHTML = "";
        data.models.forEach(m => {
          const opt = document.createElement("option"); opt.value = m;
          const vis = ["llava", "llama3.2-vision", "moondream", "bakllava", "minicpm-v"].some(v => m.toLowerCase().includes(v));
          opt.textContent = m + (vis ? " 👁" : "");
          modelSel.appendChild(opt);
        });
      }
      updateModelDisplay(modelSel.value);
      clearChat(false);
      const greet = "Luna online. Running " + modelSel.value + ". How can I help?";
      addMsg("ai", greet); speak(greet);
      // Fetch real-time data in background
      fetchRealtimeData();
    } else throw new Error(data.error || "Ollama offline");
  } catch (e) {
    connected = false; setStatus("error"); connBtn.textContent = "RETRY"; sendBtn.disabled = true;
    addMsg("ai", "Cannot reach Ollama.\n\n1. Install Ollama → ollama.com\n2. Run: ollama pull llama3.2\n3. Run: OLLAMA_ORIGINS=* ollama serve\n   Windows: $env:OLLAMA_ORIGINS=\"*\"; ollama serve\n\nError: " + e.message);
  }
}

async function fetchRealtimeData() {
  try {
    const res = await fetch("/api/realtime");
    const data = await res.json();
    realtimeContext = data;
    const dt = data.datetime || {};
    const wx = data.weather || {};
    let info = `🕐 ${dt.date || ""} · ${dt.time || ""}`;
    if (wx.ok) info += `  ·  🌡 ${wx.temperature_c}°C ${wx.condition} in ${wx.city}`;
    addSysMsg("✦ Real-time data loaded: " + info);
  } catch (e) {
    console.warn("Realtime fetch failed:", e.message);
  }
}



// ══════════════════════════════════════════════════════════════════════════════
// MODEL SWITCHING
// ══════════════════════════════════════════════════════════════════════════════
const MODEL_DESC = {
  "llama3.2": "Fast, smart — best default", "llama3.2-vision": "Llama 3.2 with vision 👁",
  "llava": "Best general vision model 👁", "llava:13b": "Larger LLaVA 👁", "llava:7b": "Lighter LLaVA 👁",
  "llama3.1:8b": "Larger Llama — stronger reasoning", "phi3:mini": "Phi-3 — very lightweight",
  "mistral": "Excellent at coding & analysis", "gemma2:2b": "Google Gemma — compact & fast",
  "moondream": "Tiny vision model 👁", "qwen2.5:3b": "Qwen — multilingual", "deepseek-r1": "DeepSeek — reasoning",
};

function openModelModal() {
  if (!connected) { addSysMsg("Connect to Ollama first."); return; }
  const cur = modelSel.value;
  modelGrid.innerHTML = "";
  Array.from(modelSel.options).forEach(opt => {
    const card = document.createElement("div");
    card.className = "model-card" + (opt.value === cur ? " active-model" : "");
    const vis = opt.text.includes("👁");
    card.innerHTML = `
      <div class="mc-name">${opt.value}</div>
      <div class="mc-desc">${MODEL_DESC[opt.value] || "Local Ollama model"}</div>
      ${vis ? '<span class="mc-badge">VISION</span>' : ""}
      ${opt.value === cur ? '<span class="mc-cur">CURRENT</span>' : ""}
    `;
    card.onclick = () => { switchModel(opt.value); closeModelModal(); };
    modelGrid.appendChild(card);
  });
  modelModalOvl.classList.add("open"); modelModal.classList.add("open");
}
function closeModelModal() { modelModalOvl.classList.remove("open"); modelModal.classList.remove("open"); }
function updateModelDisplay(model) { modelDisplayName.textContent = model || "—"; activeModelEl.textContent = model || "—"; modelSel.value = model; }
function switchModel(newModel) {
  const old = modelSel.value; if (newModel === old) return;
  updateModelDisplay(newModel);
  const badge = document.createElement("div"); badge.className = "model-switch-msg";
  badge.textContent = `⟳  Model: ${old} → ${newModel}`;
  chat.appendChild(badge); chat.scrollTop = chat.scrollHeight;
  addSysMsg(`✦ Now using ${newModel} (full history preserved for context)`);
}

// ══════════════════════════════════════════════════════════════════════════════
// HISTORY PANEL
// ══════════════════════════════════════════════════════════════════════════════
function openHistory() { renderHistoryPanel(); historyPanel.classList.add("open"); historyOverlay.classList.add("open"); }
function closeHistory() { historyPanel.classList.remove("open"); historyOverlay.classList.remove("open"); }

function renderHistoryPanel() {
  historyList.innerHTML = "";
  if (!richHistory.length) { historyList.innerHTML = '<div class="history-empty">NO MESSAGES YET</div>'; return; }
  [...richHistory].reverse().forEach((item, ri) => {
    const origIdx = richHistory.length - 1 - ri;
    const div = document.createElement("div");
    div.className = `h-item ${item.role}-item`; div.id = "hitem-" + origIdx;
    const label = item.role === "ai" ? "LUNA" : item.role === "user" ? "YOU" : "SYS";
    const preview = item.content.substring(0, 280);
    const hasMore = item.content.length > 280;
    div.innerHTML = `
      <div class="h-meta">
        <div style="display:flex;align-items:center;gap:5px">
          <span class="h-role ${item.role}">${label}</span>
          ${item.model ? `<span class="h-model-badge">${item.model}</span>` : ""}
        </div>
        <span class="h-time">${item.time || ""}</span>
      </div>
      <div class="h-text" id="htxt-${origIdx}">${escHtml(preview)}${hasMore ? "…" : ""}</div>
      ${hasMore ? `<button class="h-expand" onclick="expandHistItem(${origIdx})">show more ▾</button>` : ""}
      <div class="h-actions">
        <button class="h-copy-btn" onclick="copyHistItem(${origIdx})">⎘ Copy</button>
        ${item.role !== "sys" ? `<button class="h-del" onclick="deleteHistItem(${origIdx})">✕ Delete</button>` : ""}
      </div>
    `;
    historyList.appendChild(div);
  });
}

function expandHistItem(idx) {
  const el = document.getElementById("htxt-" + idx);
  const btn = el?.nextElementSibling;
  if (el) el.textContent = richHistory[idx].content;
  if (btn?.classList.contains("h-expand")) btn.remove();
}

function deleteHistItem(idx) {
  richHistory.splice(idx, 1);
  history = richHistory.filter(r => r.role === "user" || r.role === "ai")
    .map(r => ({ role: r.role === "ai" ? "assistant" : "user", content: r.content }));
  msgCount = history.filter(h => h.role === "user").length;
  msgCountEl.textContent = msgCount;
  updateContextCounter();
  renderHistoryPanel();
}

function deleteAllHistory() {
  if (!confirm("Delete all session history? This cannot be undone.")) return;
  richHistory = []; history = []; msgCount = 0; msgCountEl.textContent = "0";
  updateContextCounter(); renderHistoryPanel();
  addSysMsg("✦ All history deleted");
  closeHistory();
}

// ══════════════════════════════════════════════════════════════════════════════
// EDIT USER MESSAGE (ChatGPT/Gemini style)
// ══════════════════════════════════════════════════════════════════════════════
function editUserMessage(wrap, originalText, histIdx) {
  const bubble = wrap.querySelector(".bubble");

  // Replace bubble content with textarea
  bubble.innerHTML = `
    <textarea class="edit-textarea">${originalText}</textarea>
    <div class="edit-actions">
      <button class="edit-save-btn" id="editSave">✓ Send Edit</button>
      <button class="edit-cancel-btn" id="editCancel">✕ Cancel</button>
    </div>
  `;
  const ta = bubble.querySelector("textarea");
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  bubble.querySelector("#editSave").onclick = () => commitEdit(wrap, ta.value.trim(), histIdx);
  bubble.querySelector("#editCancel").onclick = () => { bubble.innerHTML = escHtml(originalText); };

  ta.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(wrap, ta.value.trim(), histIdx); }
    if (e.key === "Escape") bubble.innerHTML = escHtml(originalText);
  });
}

function commitEdit(wrap, newText, histIdx) {
  if (!newText) return;
  const bubble = wrap.querySelector(".bubble");
  bubble.innerHTML = escHtml(newText);

  // Update history
  richHistory[histIdx].content = newText;

  // Remove all DOM elements after this wrap
  let next = wrap.nextElementSibling;
  while (next) { const n = next.nextElementSibling; chat.removeChild(next); next = n; }

  // Trim richHistory and history to this index
  richHistory.splice(histIdx + 1);
  history = richHistory
    .filter(r => r.role === "user" || r.role === "ai")
    .map(r => ({ role: r.role === "ai" ? "assistant" : "user", content: r.content }));
  updateContextCounter();

  if (!connected || !lunaActive) return;
  // Re-send
  history.push({ role: "user", content: newText });
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  richHistory.push({ role: "user", content: newText, time: t });
  updateContextCounter();
  sendStreamedReply(newText, [], null);
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════════════════════════
function addMsg(role, text, fileData = null) {
  const welcome = chat.querySelector(".welcome"); if (welcome) welcome.remove();
  const wrap = document.createElement("div"); wrap.className = "msg " + role;
  const label = role === "ai" ? "LUN" : "YOU";
  let inner = "";

  if (fileData) {
    const icon = catIcon(fileData.category);
    inner += `<div class="file-attach-preview"><span class="fa-icon">${icon}</span><div>
      <div class="fa-name">${escHtml(fileData.filename)}</div>
      <div class="fa-sum">${escHtml(fileData.summary || "")}</div></div></div>`;
    if (fileData.category === "image" && fileData.images?.[0])
      inner += `<img class="bubble-img" src="data:image/jpeg;base64,${fileData.images[0]}" onclick="openLightbox(this.src)" title="Click to expand"/>`;
    if (fileData.category === "video" && fileData.images?.length)
      fileData.images.forEach((b, i) => { inner += `<img class="bubble-img" src="data:image/jpeg;base64,${b}" onclick="openLightbox(this.src)" title="Frame ${i + 1}"/>`; });
  }

  const histIdx = richHistory.length;
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (role === "user") { msgCount++; msgCountEl.textContent = msgCount; }
  richHistory.push({ role, content: text, time: t, model: role === "ai" ? modelSel.value : undefined });

  if (role === "ai") {
    inner += renderMarkdown(text);
  } else {
    inner += escHtml(text);
  }

  // Bubble + actions
  const actCopy = `<button class="msg-copy-btn" title="Copy" onclick="copyMsgText(this, ${histIdx})">⎘</button>`;
  const actEdit = role === "user"
    ? `<button class="msg-edit-btn" title="Edit" onclick="editUserMessage(this.closest('.msg'), richHistory[${histIdx}].content, ${histIdx})">✎</button>`
    : "";

  wrap.innerHTML = `<div class="avatar ${role}">${label}</div><div class="bubble">${inner}</div><div class="msg-actions">${actCopy}${actEdit}</div>`;
  chat.appendChild(wrap); chat.scrollTop = chat.scrollHeight;
  return wrap;
}

function copyMsgText(btn, histIdx) {
  const item = richHistory[histIdx];
  if (!item) return;
  navigator.clipboard.writeText(item.content).then(() => {
    btn.textContent = "✓"; setTimeout(() => btn.textContent = "⎘", 1800);
  }).catch(() => fallbackCopy(item.content));
}

function addSysMsg(text) {
  const welcome = chat.querySelector(".welcome"); if (welcome) welcome.remove();
  const wrap = document.createElement("div"); wrap.className = "msg sys";
  wrap.innerHTML = `<div class="avatar sys">SYS</div><div class="bubble">${escHtml(text)}</div>`;
  chat.appendChild(wrap); chat.scrollTop = chat.scrollHeight;
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  richHistory.push({ role: "sys", content: text, time: t });
}

function catIcon(c) { return { image: "🖼", pdf: "📄", word: "📝", excel: "📊", csv: "📊", text: "💻", video: "🎬", audio: "🎵", archive: "🗂", unknown: "📁" }[c] || "📁"; }

function openLightbox(src) {
  let lb = document.getElementById("lightbox");
  if (!lb) { lb = document.createElement("div"); lb.className = "lightbox"; lb.id = "lightbox"; lb.innerHTML = `<img id="lbImg"/>`; lb.onclick = () => lb.classList.remove("open"); document.body.appendChild(lb); }
  document.getElementById("lbImg").src = src; lb.classList.add("open");
}

// ══════════════════════════════════════════════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════════════════════════════════════════════
async function sendMsg() {
  if (!connected) { addMsg("ai", "Please connect to Ollama first."); return; }
  if (!lunaActive) { addSysMsg("Luna is offline. Click LUNA: OFF to reactivate."); return; }

  const text = msgInput.value.trim();
  const hasFiles = attachedFiles.length > 0;
  if (!text && !hasFiles) return;

  resetTextarea();
  sendBtn.disabled = true;
  if (stopBtn) stopBtn.classList.add("active");

  const allImages = [], allTexts = [];
  attachedFiles.forEach(f => {
    if (f.images?.length) allImages.push(...f.images);
    if (f.text) allTexts.push(`[${f.filename}]\n${f.text}`);
  });
  const fileContext = allTexts.join("\n\n---\n\n") || null;
  const firstFile = attachedFiles[0] || null;

  addMsg("user", text || (hasFiles ? "(attached file)" : ""), firstFile);
  if (attachedFiles.length > 1) attachedFiles.slice(1).forEach(f => addMsg("user", "", f));

  history.push({ role: "user", content: text || "analyse the attached file" });
  updateContextCounter();
  clearAttachments();
  stopTTS(); ttsBuffer = "";

  await sendStreamedReply(text, allImages, fileContext);
}

async function sendStreamedReply(text, allImages = [], fileContext = null) {
  // Create AI placeholder bubble
  const aiWrap = document.createElement("div");
  aiWrap.className = "msg ai";
  aiWrap.innerHTML = `<div class="avatar ai">LUN</div><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div><div class="msg-actions"></div>`;
  chat.appendChild(aiWrap); chat.scrollTop = chat.scrollHeight;

  const bubble = aiWrap.querySelector(".bubble");
  const actionsEl = aiWrap.querySelector(".msg-actions");
  let fullReply = "";

  const aiHistIdx = richHistory.length;
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  richHistory.push({ role: "ai", content: "", time: t, model: modelSel.value });

  streamAbort = new AbortController();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: streamAbort.signal,
      body: JSON.stringify({
        model: modelSel.value,
        message: text,
        history: history.slice(0, -1),
        file_context: fileContext,
        images: allImages
      })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    bubble.innerHTML = "";

    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      const raw = decoder.decode(value, { stream: true });
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const obj = JSON.parse(line.slice(5).trim());
          if (obj.error) throw new Error(obj.error);
          fullReply += obj.token; ttsBuffer += obj.token;
          bubble.innerHTML = renderMarkdown(fullReply) + '<span class="cursor"></span>';
          chat.scrollTop = chat.scrollHeight;
          if (ttsEnabled) flushTTSBuffer(false);
          if (obj.done) {
            bubble.innerHTML = renderMarkdown(fullReply);
            if (ttsEnabled) flushTTSBuffer(true);
          }
        } catch (err) {
          if (err.name !== "AbortError") console.warn(err);
        }
      }
    }

    richHistory[aiHistIdx].content = fullReply;
    history.push({ role: "assistant", content: fullReply });
    updateContextCounter();
    updateQuickCommands(text, fullReply);

    // Attach copy button to completed AI message
    actionsEl.innerHTML = `<button class="msg-copy-btn" title="Copy" onclick="copyMsgText(this, ${aiHistIdx})">⎘</button>`;

  } catch (e) {
    if (e.name === "AbortError") {
      bubble.innerHTML = renderMarkdown(fullReply) + '<br><em style="color:var(--warn);font-size:11px;font-family:var(--mono)">⏹ Stopped by user</em>';
      richHistory[aiHistIdx].content = fullReply;
      history.push({ role: "assistant", content: fullReply });
      updateContextCounter();
      actionsEl.innerHTML = `<button class="msg-copy-btn" title="Copy" onclick="copyMsgText(this, ${aiHistIdx})">⎘</button>`;
    } else {
      bubble.innerHTML = escHtml("Connection error: " + e.message);
      setStatus("error"); connected = false; sendBtn.disabled = true;
    }
  } finally {
    streamAbort = null;
    sendBtn.disabled = false;
    if (stopBtn) stopBtn.classList.remove("active");
    chat.scrollTop = chat.scrollHeight;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// QUICK COMMANDS
// ══════════════════════════════════════════════════════════════════════════════
const DEFAULT_CHIPS = [
  { label: "capabilities", prompt: "What can you help me with?" },
  { label: "motivate me", prompt: "Give me a motivational quote" },
  { label: "productivity", prompt: "What are 3 tips for productivity?" },
  { label: "write code", prompt: "Write a Python hello world" },
  { label: "explain ML", prompt: "Explain machine learning simply" },
  { label: "fun fact", prompt: "Tell me a fun tech fact" },
];
const TOPIC_RULES = [
  {
    keywords: ["python", "code", "function", "script", "bug", "error", "class", "import", "def", "javascript", "typescript", "java", "cpp", "rust"],
    chips: [{ label: "debug this", prompt: "Help debug this" }, { label: "explain code", prompt: "Explain step by step" }, { label: "write tests", prompt: "Write unit tests" }, { label: "optimize", prompt: "How to optimize?" }]
  },
  {
    keywords: ["pdf", "document", "word", "excel", "csv", "spreadsheet", "file", "analyse", "analyze"],
    chips: [{ label: "summarize", prompt: "Give a brief summary" }, { label: "key insights", prompt: "Key insights?" }, { label: "extract data", prompt: "Extract important data" }, { label: "next steps", prompt: "What are the next steps?" }]
  },
  {
    keywords: ["image", "photo", "picture", "screenshot", "diagram", "chart", "video"],
    chips: [{ label: "describe", prompt: "Describe in detail" }, { label: "extract text", prompt: "Extract visible text" }, { label: "what's wrong", prompt: "What issues do you see?" }, { label: "improve", prompt: "How to improve this?" }]
  },
  {
    keywords: ["machine learning", "ml", "neural", "deep learning", "ai", "model", "train"],
    chips: [{ label: "explain more", prompt: "Explain in more detail" }, { label: "give example", prompt: "Real-world example" }, { label: "resources", prompt: "Best resources?" }]
  },
  {
    keywords: ["write", "essay", "email", "letter", "blog", "article", "story", "report"],
    chips: [{ label: "improve", prompt: "Improve what you wrote" }, { label: "make shorter", prompt: "Make more concise" }, { label: "make formal", prompt: "Make more formal" }, { label: "continue", prompt: "Continue writing" }]
  },
  {
    keywords: ["plan", "schedule", "goal", "habit", "routine", "workout"],
    chips: [{ label: "more detail", prompt: "More detail please" }, { label: "track progress", prompt: "How to track progress?" }, { label: "make harder", prompt: "Make it more challenging" }]
  },
  {
    keywords: ["math", "calculate", "equation", "formula", "solve", "algebra"],
    chips: [{ label: "show steps", prompt: "Show step-by-step solution" }, { label: "another example", prompt: "Give another example" }, { label: "explain concept", prompt: "Explain the concept" }]
  },
];

function updateQuickCommands(userMsg, aiReply) {
  const combined = (userMsg + " " + aiReply).toLowerCase();
  for (const rule of TOPIC_RULES) {
    if (rule.keywords.some(k => combined.includes(k))) { renderChips(rule.chips); return; }
  }
  if (history.length >= 4) renderChips([
    { label: "summarize", prompt: "Summarize our discussion" },
    { label: "go deeper", prompt: "Elaborate on the last point" },
    { label: "give examples", prompt: "Give more examples" },
    { label: "what's next", prompt: "What should I do next?" },
    { label: "downsides", prompt: "What are the downsides?" },
  ]);
}
function renderChips(chips) {
  quickChips.innerHTML = "";
  chips.forEach(c => { const d = document.createElement("div"); d.className = "chip new"; d.textContent = c.label; d.onclick = () => quickSend(c.prompt); quickChips.appendChild(d); });
}
function resetChips() {
  quickChips.innerHTML = "";
  DEFAULT_CHIPS.forEach(c => { const d = document.createElement("div"); d.className = "chip"; d.textContent = c.label; d.onclick = () => quickSend(c.prompt); quickChips.appendChild(d); });
}
function quickSend(text) { if (!connected) { checkStatus(); return; } msgInput.value = text; autoResizeTextarea(msgInput); sendMsg(); }

// ══════════════════════════════════════════════════════════════════════════════
// CLEAR CHAT
// ══════════════════════════════════════════════════════════════════════════════
function clearChat(showWelcome = true) {
  stopTTS();
  while (chat.firstChild) chat.removeChild(chat.firstChild);
  history = []; richHistory = []; msgCount = 0;
  msgCountEl.textContent = "0"; updateContextCounter();
  clearAttachments(); resetChips(); resetTextarea();
  if (showWelcome) {
    const w = document.createElement("div"); w.className = "welcome";
    w.innerHTML = `<div class="welcome-logo">L.U.N.A</div><div class="welcome-sub">Local Unified Neural Assistant</div><div class="welcome-hint">Session cleared. Ready for new commands.</div>`;
    chat.appendChild(w);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════════════════════
function onFilesSelected(files) { if (!files?.length) return; Array.from(files).forEach(uploadFile); fileInput.value = ""; }

async function uploadFile(file) {
  const id = "fc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
  const chip = document.createElement("div"); chip.className = "fchip loading"; chip.id = id;
  chip.innerHTML = `<span class="fchip-icon">⏳</span><span class="fchip-name">${escHtml(file.name)}</span><span class="fchip-state">uploading…</span>`;
  fileStrip.appendChild(chip); fileStrip.classList.add("has-files"); attachBtn.classList.add("has-files");
  uploadProgress.classList.add("show"); uploadLabel.textContent = "Processing " + file.name + "…";
  try {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.error) {
      chip.className = "fchip error";
      chip.innerHTML = `<span class="fchip-icon">❌</span><span class="fchip-name">${escHtml(file.name)}</span><span class="fchip-state">${escHtml(data.error.substring(0, 40))}</span><button class="fchip-del" onclick="removeChip('${id}')">×</button>`;
      addSysMsg("⚠ " + data.error);
    } else {
      data._chipId = id; attachedFiles.push(data);
      chip.className = "fchip";
      chip.innerHTML = `<span class="fchip-icon">${catIcon(data.category)}</span><span class="fchip-name">${escHtml(file.name)}</span><span class="fchip-state" style="color:var(--success)">✓</span><button class="fchip-del" onclick="removeChip('${id}')">×</button>`;
      chip.title = data.summary || "";
    }
  } catch (e) {
    chip.className = "fchip error";
    chip.innerHTML = `<span class="fchip-icon">❌</span><span class="fchip-name">${escHtml(file.name)}</span><span class="fchip-state">failed</span><button class="fchip-del" onclick="removeChip('${id}')">×</button>`;
    addSysMsg("Upload failed: " + e.message);
  } finally {
    uploadProgress.classList.remove("show");
    if (!fileStrip.querySelector(".fchip")) fileStrip.classList.remove("has-files");
  }
}
function removeChip(id) {
  attachedFiles = attachedFiles.filter(f => f._chipId !== id);
  document.getElementById(id)?.remove();
  if (!fileStrip.querySelectorAll(".fchip").length) { fileStrip.classList.remove("has-files"); attachBtn.classList.remove("has-files"); }
}
function clearAttachments() { attachedFiles = []; fileStrip.innerHTML = ""; fileStrip.classList.remove("has-files"); attachBtn.classList.remove("has-files"); }

// ══════════════════════════════════════════════════════════════════════════════
// DRAG & DROP
// ══════════════════════════════════════════════════════════════════════════════
let dragCtr = 0;
document.addEventListener("dragenter", e => { e.preventDefault(); dragCtr++; if (dragCtr === 1) dropOverlay.classList.add("active"); });
document.addEventListener("dragleave", e => { dragCtr--; if (dragCtr === 0) dropOverlay.classList.remove("active"); });
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => { e.preventDefault(); dragCtr = 0; dropOverlay.classList.remove("active"); if (e.dataTransfer.files.length) onFilesSelected(e.dataTransfer.files); });

// ══════════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════════════════════
modelSel.addEventListener("change", () => updateModelDisplay(modelSel.value));

document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "l") { e.preventDefault(); clearChat(); }
  if (e.key === "Escape") {
    if (manualActive) stopManualMic();
    if (micInputMode) executeMicOff(false);
    stopStream();
    closeHistory(); closeModelModal();
    document.getElementById("lightbox")?.classList.remove("open");
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
resetChips();
updateContextCounter();
