// llm.js — AI Attendance Assistant (Messenger-style floating popup)

import { supabase } from "./supabase.js";

const SUPABASE_URL = "https://elijcrrdpfaczxtgqctp.supabase.co";
const PROXY_URL    = `${SUPABASE_URL}/functions/v1/ai-proxy`;

let chatHistory = [];

// ─── MAIN: Ask the AI ────────────────────────────────────────────────────────
export async function askAttendanceAI(userMessage, currentUser) {
  if (!currentUser) return "Please log in first.";

  const { data: records, error } = await supabase
    .from("attendance")
    .select("date, time_in, time_out, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) return "Sorry, I couldn't retrieve your attendance data right now.";

  const formatTime = (ts) => {
    if (!ts) return "—";
    const n = /[Z+\-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + "Z";
    return new Date(n).toLocaleString("en-PH", {
      timeZone: "Asia/Manila", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  };

  const recordsSummary = records?.length
    ? records.map(r =>
        `Date: ${formatTime(r.time_in)} | Time In: ${formatTime(r.time_in)} | Time Out: ${r.time_out ? formatTime(r.time_out) : "Not yet"}`
      ).join("\n")
    : "No attendance records found.";

  const totalDays    = records?.length ?? 0;
  const completeDays = records?.filter(r => r.time_out).length ?? 0;
  const pendingDays  = totalDays - completeDays;

  const systemPrompt = `You are a friendly AI attendance assistant for a Philippine school system.
Speaking with: ${currentUser.full_name} (${currentUser.major}, ID: ${currentUser.student_id}).

Attendance data:
${recordsSummary}

Stats: Total: ${totalDays} | Complete (In+Out): ${completeDays} | Pending: ${pendingDays}

Be concise (1-3 sentences). Calculate from data when asked. Be encouraging.`;

  chatHistory.push({ role: "user", content: userMessage });
  if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const reason = data?.error?.message ?? JSON.stringify(data);
      if (reason.includes("loading") || response.status === 503)
        return "⏳ Model warming up (~20s). Please try again shortly.";
      return `Sorry, AI error: ${reason}`;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() ?? "Sorry, no response.";
    chatHistory.push({ role: "assistant", content: reply });
    return reply;

  } catch (err) {
    return "Network error — please check your connection.";
  }
}

// ─── UI: Floating messenger-style popup ──────────────────────────────────────
export function initAIAssistant(currentUser) {
  if (document.getElementById("aiLaunchBtn")) return;

  const firstName = currentUser.full_name.split(" ")[0];

  // ── Floating button ──
  const btn = document.createElement("button");
  btn.id = "aiLaunchBtn";
  btn.title = "AI Attendance Assistant";
  btn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;
  btn.style.display = "flex";
  document.body.appendChild(btn);

  // ── Popup ──
  const popup = document.createElement("div");
  popup.id = "aiPopup";
  popup.innerHTML = `
    <div class="ai-popup-header">
      <div class="ai-popup-avatar">✦</div>
      <div class="ai-popup-info">
        <div class="ai-popup-name">AI Attendance Assistant</div>
        <div class="ai-popup-status">Online</div>
      </div>
      <button class="ai-popup-close" id="aiPopupClose" title="Close">✕</button>
    </div>

    <div id="aiChatHistory" class="ai-chat-history" role="log" aria-live="polite">
      <div class="ai-bubble ai-bubble-bot">
        <span class="ai-avatar">✦</span>
        <div class="ai-bubble-text">
          Hi ${firstName}! 👋 I'm your attendance assistant.<br><br>
          Ask me anything like <em>"How many times was I present?"</em> or <em>"Did I time out today?"</em>
        </div>
      </div>
    </div>

    <div class="ai-suggestions" id="aiSuggestions">
      <button class="ai-suggestion-chip" type="button">How many absences?</button>
      <button class="ai-suggestion-chip" type="button">Did I time out today?</button>
      <button class="ai-suggestion-chip" type="button">This week's attendance</button>
    </div>

    <div class="ai-input-row">
      <input id="aiUserInput" type="text" class="ai-input"
        placeholder="Ask about your attendance…" autocomplete="off" maxlength="300" />
      <button id="aiSendBtn" class="ai-send-btn" type="button" aria-label="Send">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(popup);

  // ── Toggle open/close ──
  let isOpen = false;

  function openPopup() {
    isOpen = true;
    popup.classList.remove("ai-popup-closing");
    popup.classList.add("ai-popup-open");
    setTimeout(() => document.getElementById("aiUserInput")?.focus(), 250);
  }

  function closePopup() {
    isOpen = false;
    popup.classList.add("ai-popup-closing");
    setTimeout(() => {
      popup.classList.remove("ai-popup-open", "ai-popup-closing");
    }, 180);
  }

  btn.addEventListener("click", () => isOpen ? closePopup() : openPopup());
  document.getElementById("aiPopupClose").addEventListener("click", closePopup);

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (isOpen && !popup.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      closePopup();
    }
  });

  // ── Send message ──
  const input   = document.getElementById("aiUserInput");
  const sendBtn = document.getElementById("aiSendBtn");

  async function sendMessage(text) {
    const message = (text || input.value).trim();
    if (!message) return;

    input.value      = "";
    sendBtn.disabled = true;
    input.disabled   = true;

    document.getElementById("aiSuggestions").style.display = "none";
    appendBubble("user", message);
    const typingId = appendTyping();

    const reply = await askAttendanceAI(message, currentUser);

    removeTyping(typingId);
    appendBubble("bot", reply);

    sendBtn.disabled = false;
    input.disabled   = false;
    input.focus();
  }

  sendBtn.addEventListener("click", () => sendMessage());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  document.querySelectorAll(".ai-suggestion-chip").forEach(chip => {
    chip.addEventListener("click", () => sendMessage(chip.textContent));
  });
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function appendBubble(role, text) {
  const history = document.getElementById("aiChatHistory");
  if (!history) return;
  const div = document.createElement("div");
  div.className = `ai-bubble ai-bubble-${role === "user" ? "user" : "bot"}`;
  div.innerHTML = role === "bot"
    ? `<span class="ai-avatar">✦</span><div class="ai-bubble-text">${escapeHtml(text)}</div>`
    : `<div class="ai-bubble-text">${escapeHtml(text)}</div>`;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
}

let _tc = 0;
function appendTyping() {
  const id = "typing-" + (++_tc);
  const history = document.getElementById("aiChatHistory");
  if (!history) return id;
  const div = document.createElement("div");
  div.className = "ai-bubble ai-bubble-bot";
  div.id = id;
  div.innerHTML = `
    <span class="ai-avatar">✦</span>
    <div class="ai-bubble-text ai-typing"><span></span><span></span><span></span></div>`;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
  return id;
}

function removeTyping(id) { document.getElementById(id)?.remove(); }

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}
