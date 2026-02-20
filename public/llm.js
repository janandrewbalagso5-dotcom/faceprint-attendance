// llm.js — AI Attendance Assistant
// Uses Hugging Face Inference API (free, just needs an email signup)
// Get your free token at: https://huggingface.co/settings/tokens

// Lazy-load supabase so an error in llm.js never crashes the rest of the app
let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const mod = await import("./supabase.js");
    _supabase = mod.supabase;
  }
  return _supabase;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// 1. Go to https://huggingface.co and sign up (just email + password, no CAPTCHA)
// 2. Go to https://huggingface.co/settings/tokens
// 3. Click "New token" → name it anything → Role: "Read" → click Generate
// 4. Paste your token below (starts with hf_...)
const HF_TOKEN = "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";

// ─── STATE ───────────────────────────────────────────────────────────────────
let chatHistory = [];

// ─── MAIN: Ask the AI a question ─────────────────────────────────────────────
export async function askAttendanceAI(userMessage, currentUser) {
  if (!currentUser) return "Please log in first.";

  // 1. Pull this student's last 60 attendance records from Supabase
  const supabase = await getSupabase();
  const { data: records, error } = await supabase
    .from("attendance")
    .select("date, time_in, time_out, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("Supabase fetch error:", error);
    return "Sorry, I couldn't retrieve your attendance data right now.";
  }

  // 2. Format records for AI context
  const formatTime = (ts) => {
    if (!ts) return "—";
    const normalized = /[Z+\-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + "Z";
    return new Date(normalized).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short", day: "2-digit",
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

  // 3. Build the full prompt (Hugging Face uses a single text prompt)
  // We manually format the conversation history into the prompt
  const systemPrompt = `You are a friendly and helpful AI attendance assistant for a Philippine school attendance system.
You are speaking with: ${currentUser.full_name} (${currentUser.major}, Student ID: ${currentUser.student_id}).

Recent attendance data:
${recordsSummary}

Stats: Total days: ${totalDays} | Complete (In+Out): ${completeDays} | Pending (no Time Out): ${pendingDays}

Rules: Be concise (1-3 sentences). Calculate from data when asked. Be encouraging and supportive.`;

  // Build conversation turns into a single prompt string
  const historyText = chatHistory.map(m =>
    m.role === "user" ? `Student: ${m.content}` : `Assistant: ${m.content}`
  ).join("\n");

  const fullPrompt = `${systemPrompt}

${historyText}
Student: ${userMessage}
Assistant:`;

  // Save user message to history
  chatHistory.push({ role: "user", content: userMessage });
  if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

  // 4. Call Hugging Face Inference API
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${HF_TOKEN}`,
        },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: {
            max_new_tokens: 256,
            temperature: 0.7,
            return_full_text: false,  // only return the new generated text
            stop: ["Student:", "\nStudent"],
          },
        }),
      }
    );

    // Model may be loading (cold start) — HF returns 503 for this
    if (response.status === 503) {
      return "⏳ The AI model is warming up (this takes ~20 seconds on first use). Please try again in a moment.";
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const reason = errData?.error ?? "Unknown error";
      console.error("HF API error:", errData);

      if (response.status === 401) {
        return "⚠️ Invalid token. Double-check the HF token you pasted in llm.js.";
      }
      if (response.status === 429) {
        return "⚠️ Rate limit hit — please wait a moment and try again.";
      }
      return `Sorry, I ran into an error (${response.status}): ${reason}`;
    }

    const data = await response.json();

    // HF returns an array: [{ generated_text: "..." }]
    let reply = data?.[0]?.generated_text ?? "";

    // Clean up any trailing incomplete sentences or leftover prompt artifacts
    reply = reply
      .split("Student:")[0]   // cut off if it starts hallucinating a new turn
      .trim();

    if (!reply) reply = "Sorry, I didn't get a response. Please try again.";

    // Save assistant reply to history
    chatHistory.push({ role: "assistant", content: reply });

    return reply;

  } catch (err) {
    console.error("Network error calling Hugging Face:", err);
    return "Network error — please check your connection and try again.";
  }
}

// ─── UI: Render the chat widget ───────────────────────────────────────────────
export function initAIAssistant(currentUser) {
  if (document.getElementById("aiAssistantCard")) return;

  const card = document.createElement("div");
  card.className = "card ai-assistant-card";
  card.id = "aiAssistantCard";
  card.innerHTML = `
    <div class="card-header">
      <h2 class="card-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:var(--accent);flex-shrink:0;">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        AI Attendance Assistant
      </h2>
      <button id="aiClearBtn" class="btn btn-ghost" type="button" style="font-size:0.75rem;padding:4px 10px;height:auto;">
        Clear
      </button>
    </div>

    <div id="aiChatHistory" class="ai-chat-history" role="log" aria-live="polite" aria-label="Chat history">
      <div class="ai-bubble ai-bubble-bot">
        <span class="ai-avatar">✦</span>
        <div class="ai-bubble-text">
          Hi ${currentUser.full_name.split(" ")[0]}! 👋 I'm your attendance assistant.
          Ask me anything — like <em>"How many times was I present this month?"</em>
          or <em>"Did I time out yesterday?"</em>
          <br><br>
          <small style="color:var(--text-3);">⚠️ First message may take ~20 seconds while the model loads.</small>
        </div>
      </div>
    </div>

    <div class="ai-input-row">
      <input
        id="aiUserInput"
        type="text"
        class="ai-input"
        placeholder="Ask about your attendance…"
        autocomplete="off"
        maxlength="300"
      />
      <button id="aiSendBtn" class="btn btn-primary ai-send-btn" type="button" aria-label="Send">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>

    <div class="ai-suggestions" id="aiSuggestions">
      <button class="ai-suggestion-chip" type="button">How many absences do I have?</button>
      <button class="ai-suggestion-chip" type="button">Did I time out today?</button>
      <button class="ai-suggestion-chip" type="button">Show my attendance this week</button>
    </div>
  `;

  const rightCol = document.querySelector(".right-col");
  if (rightCol) rightCol.appendChild(card);
  else document.querySelector(".app-main")?.appendChild(card);

  const input    = document.getElementById("aiUserInput");
  const sendBtn  = document.getElementById("aiSendBtn");
  const clearBtn = document.getElementById("aiClearBtn");

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

  clearBtn.addEventListener("click", () => {
    chatHistory = [];
    document.getElementById("aiChatHistory").innerHTML = `
      <div class="ai-bubble ai-bubble-bot">
        <span class="ai-avatar">✦</span>
        <div class="ai-bubble-text">Chat cleared. How can I help you?</div>
      </div>`;
    document.getElementById("aiSuggestions").style.display = "flex";
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

let _typingCounter = 0;
function appendTyping() {
  const id = "typing-" + (++_typingCounter);
  const history = document.getElementById("aiChatHistory");
  if (!history) return id;
  const div = document.createElement("div");
  div.className = "ai-bubble ai-bubble-bot";
  div.id = id;
  div.innerHTML = `
    <span class="ai-avatar">✦</span>
    <div class="ai-bubble-text ai-typing">
      <span></span><span></span><span></span>
    </div>`;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
  return id;
}

function removeTyping(id) { document.getElementById(id)?.remove(); }

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}