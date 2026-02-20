import { supabase } from "./supabase.js";

/* STATE */
let modelsLoaded    = false;
let registeredUsers = [];
let registrationMode = "new";

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

let _opts = null;
function getOpts() {
  // inputSize 416 gives a richer, more discriminative descriptor than 224
  if (!_opts) _opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
  return _opts;
}

function getVideo() { return document.getElementById("video"); }

/* ─── ATTENDANCE SESSION HELPERS ─────────────────────────── */

// Returns today's date in Manila time (YYYY-MM-DD) for matching attendance sessions
function todayPH() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// Fetch the true UTC time directly from Supabase server — avoids wrong client clock
async function getServerTime() {
  const { data } = await supabase.rpc("get_server_time");
  return data ?? new Date().toISOString(); // fallback to client if rpc fails
}

// Store timestamps as UTC (toISOString). Display is converted to Manila time separately.

// Returns today's session row for the user, or null if none exists.
// Uses created_at within the past 24h to avoid any date/timezone mismatch
// between client-supplied date strings and the DB's UTC CURRENT_DATE.
export async function getTodaySession(userId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("attendance")
    .select("id, time_in, time_out")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) { console.error("getTodaySession error:", error); return null; }
  return data?.[0] ?? null;
}

// "TIME IN" if no session yet, "TIME OUT" if session has no time_out, "DONE" if complete
export async function getAttendanceType(userId) {
  const session = await getTodaySession(userId);
  if (!session)          return "TIME IN";
  if (!session.time_out) return "TIME OUT";
  return "DONE";
}

/* LOAD MODELS */
async function loadModels() {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log("Face-api models loaded");
    await loadRegisteredUsers();
  } catch (err) {
    console.error("Model load error:", err);
    showFaceStatus("Failed to load face models. Check your connection.", true);
  }
}

/* LOAD USERS + FACE DESCRIPTORS */
async function loadRegisteredUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, student_id, full_name, major, face_images(descriptor)");

  if (error) { console.error("Load users error:", error); return; }

  registeredUsers = (data ?? [])
    .filter(u => u.face_images?.length > 0)
    .map(u => ({
      id:          u.id,
      student_id:  u.student_id,
      name:        u.full_name,
      major:       u.major,
      descriptors: u.face_images.map(f => new Float32Array(f.descriptor)),
    }));

  console.log(`Loaded ${registeredUsers.length} registered face(s)`);
}

/* FACE UTILITIES */
function euclideanDistance(d1, d2) {
  let sum = 0;
  for (let i = 0; i < d1.length; i++) sum += (d1[i] - d2[i]) ** 2;
  return Math.sqrt(sum);
}

function isDuplicateFace(descriptor, threshold = 0.35) {
  for (const user of registeredUsers)
    for (const saved of user.descriptors)
      if (euclideanDistance(descriptor, saved) < threshold) return true;
  return false;
}

function capturePhoto(video) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg");
}

/* REGISTER FACE */
// Average multiple Float32Array descriptors into one for a more stable template
function averageDescriptors(descriptors) {
  const len = descriptors[0].length;
  const avg = new Float32Array(len);
  for (const d of descriptors)
    for (let i = 0; i < len; i++) avg[i] += d[i] / descriptors.length;
  return avg;
}

const REGISTER_SAMPLES = 3; // number of captures to average

async function registerFace() {
  if (!modelsLoaded) { showFaceStatus("Models are still loading, please wait…", true); return; }

  const video     = getVideo();
  const studentId = document.getElementById("faceStudentId")?.value.trim();
  const name      = document.getElementById("faceName")?.value.trim();
  const major     = document.getElementById("faceMajor")?.value.trim();

  if (!studentId || !name || !major) {
    showFaceStatus("Please complete all fields before registering.", true); return;
  }
  if (!video?.srcObject) {
    showFaceStatus('Camera not ready. Click "Start Camera" first.', true); return;
  }

  // Collect REGISTER_SAMPLES descriptors with short pauses between captures
  const samples = [];
  for (let i = 0; i < REGISTER_SAMPLES; i++) {
    showFaceStatus(`Capturing sample ${i + 1} of ${REGISTER_SAMPLES} — hold still…`);
    // Small delay so each sample is slightly different (natural micro-movements)
    await new Promise(r => setTimeout(r, 400));
    const det = await faceapi
      .detectSingleFace(video, getOpts())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) {
      showFaceStatus(`Sample ${i + 1} failed — no face detected. Try again.`, true);
      return;
    }
    samples.push(det.descriptor);
  }

  // Average all samples into one stable descriptor
  const avgDescriptor = averageDescriptors(samples);

  if (isDuplicateFace(avgDescriptor)) {
    showFaceStatus("This face is already registered.", true); return;
  }

  let user;

  if (registrationMode === "addFace") {
    const { data, error } = await supabase
      .from("users")
      .select("id, student_id, full_name, major")
      .eq("student_id", studentId)
      .maybeSingle();
    if (error || !data) { showFaceStatus("Student not found. Check the Student ID.", true); return; }
    user = { ...data, name: data.full_name };
  } else {
    const { data, error } = await supabase
      .from("users")
      .insert({ student_id: studentId, full_name: name, major, username: studentId })
      .select("id, student_id, full_name, major")
      .single();
    if (error) { showFaceStatus("Registration error: " + error.message, true); return; }
    user = { ...data, name: data.full_name };
  }

  const photo = capturePhoto(video);

  const { error: imgError } = await supabase.from("face_images").insert({
    user_id:    user.id,
    descriptor: Array.from(avgDescriptor), // store averaged descriptor
    photo,
  });
  if (imgError) { showFaceStatus("Failed to save face image: " + imgError.message, true); return; }

  showProfile(user, photo);
  await loadRegisteredUsers();
  showFaceStatus(`Face registered successfully ✓ (${REGISTER_SAMPLES} samples averaged)`, false);
}

/* MARK ATTENDANCE (Time In / Time Out) */
async function markAttendance() {
  if (!modelsLoaded) { showFaceStatus("Models are still loading, please wait…", true); return; }
  if (registeredUsers.length === 0) { showFaceStatus("No registered faces found.", true); return; }

  const video = getVideo();
  if (!video?.srcObject) {
    showFaceStatus('Camera not ready. Click "Start Camera" first.', true); return;
  }

  showFaceStatus("Scanning face…");

  const detection = await faceapi
    .detectSingleFace(video, getOpts())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) { hideProfile(); showFaceStatus("No face detected. Please try again.", true); return; }

  // ── Strict threshold: 0.42 rejects similar-looking faces that 0.6 would pass ──
  const MATCH_THRESHOLD = 0.5;
  const matcher = new faceapi.FaceMatcher(
    registeredUsers.map(u => new faceapi.LabeledFaceDescriptors(u.student_id, u.descriptors)),
    MATCH_THRESHOLD
  );
  const match1 = matcher.findBestMatch(detection.descriptor);

  if (match1.label === "unknown") { hideProfile(); showFaceStatus("Face not recognised. Please register first.", true); return; }

  // ── Double-scan confirmation: take a second reading 600ms later ──
  showFaceStatus("Hold still — confirming identity…");
  await new Promise(r => setTimeout(r, 600));

  const det2 = await faceapi.detectSingleFace(video, getOpts()).withFaceLandmarks().withFaceDescriptor();
  if (!det2) { hideProfile(); showFaceStatus("Confirmation scan failed. Please try again.", true); return; }

  const match2 = matcher.findBestMatch(det2.descriptor);

  // Both scans must agree on the same person
  if (match2.label !== match1.label || match2.label === "unknown") {
    hideProfile();
    showFaceStatus("Identity could not be confirmed. Please try again.", true);
    return;
  }

  // Both distances must be below threshold (average them for extra confidence)
  const avgDistance = (match1.distance + match2.distance) / 2;
  if (avgDistance > MATCH_THRESHOLD) {
    hideProfile();
    showFaceStatus("Face similarity too low. Please try again in better lighting.", true);
    return;
  }

  const user = registeredUsers.find(u => u.student_id === match1.label);
  if (!user) { showFaceStatus("Matched user not found in local data.", true); return; }

  // Verify face belongs to the logged-in student
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser || user.student_id !== currentUser.student_id) {
    hideProfile();
    showFaceStatus("Face does not match the logged-in account. Please use your own face.", true);
    return;
  }

  const session = await getTodaySession(user.id);

  if (!session) {
    // ── TIME IN: create a new session row ──
    const { error } = await supabase.from("attendance").insert({
      user_id:  user.id,
      // time_in and date default to now()/CURRENT_DATE server-side
    });
    if (error) { showFaceStatus("Error recording Time In: " + error.message, true); return; }
    showFaceStatus(`Time In recorded — ${user.name}`, false);

  } else if (!session.time_out) {
    // ── TIME OUT: update the existing session row ──
    const { error } = await supabase
      .from("attendance")
      .update({ time_out: await getServerTime() })
      .eq("id", session.id);
    if (error) { showFaceStatus("Error recording Time Out: " + error.message, true); return; }
    showFaceStatus(`Time Out recorded — ${user.name}`, false);

  } else {
    showFaceStatus("You have already timed in and out today.", false);
    return;
  }

  showProfile(user);
  loadDashboard();
}

/* PROFILE CARD */
export function showProfile(user, photo = null) {
  const card = document.getElementById("profileCard");
  if (!card) return;
  card.hidden = false;
  const displayName = user.full_name ?? user.name;
  document.getElementById("profileName").textContent      = displayName;
  document.getElementById("profileStudentId").textContent = user.student_id;
  document.getElementById("profileMajor").textContent     = user.major;
  const photoEl = document.getElementById("profilePhoto");
  if (photo && photoEl) photoEl.src = photo;
}

export function hideProfile() {
  const card = document.getElementById("profileCard");
  if (card) card.hidden = true;
}

/* STATUS FEEDBACK */
function showFaceStatus(msg, isError = false) {
  const el = document.getElementById("faceStatus");
  if (!el) return;
  el.textContent   = msg;
  el.className     = `face-status ${isError ? "error" : "info"}`;
  el.style.display = "block";
}

/* ─── DASHBOARD ──────────────────────────────────────────── */
export async function loadDashboard() {
  const tbody      = document.getElementById("dashboard-body");
  const emptyState = document.getElementById("dashboardEmpty");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" class="loading-row">Loading…</td></tr>`;

  const { data: rows, error } = await supabase
    .from("attendance")
    .select("user_id, date, time_in, time_out")
    .order("date",    { ascending: false })
    .order("time_in", { ascending: false })
    .limit(50);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-row">Failed to load data.</td></tr>`;
    return;
  }

  if (!rows?.length) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  const ids = [...new Set(rows.map(r => r.user_id))];
  const { data: users } = await supabase.from("users").select("id, full_name").in("id", ids);
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]));

  if (emptyState) emptyState.style.display = "none";

  function formatTimePH(ts) {
    if (!ts) return "—";
    // Supabase timestamptz columns return UTC strings like "2026-02-20T06:02:00+00:00"
    // Ensure it's treated as UTC by appending Z if no timezone info present
    const normalized = /[Z+\-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + "Z";
    const d = new Date(normalized);
    if (isNaN(d)) return "—";
    return d.toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      hour:     "2-digit",
      minute:   "2-digit",
      hour12:   true,
    });
  }

  tbody.innerHTML = rows.map(row => {
    const name    = userMap[row.user_id]?.full_name ?? "Unknown";
    // Derive the display date from time_in in Manila timezone (not the stored date column
    // which uses UTC CURRENT_DATE and can be off by one day before 8 AM UTC / 4 PM Manila)
    const dateStr = row.time_in
      ? (() => {
          const normalized = /[Z+\-]\d{2}:?\d{2}$/.test(row.time_in) ? row.time_in : row.time_in + "Z";
          return new Date(normalized).toLocaleDateString("en-PH", {
            timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric"
          });
        })()
      : "—";
    const timeIn  = formatTimePH(row.time_in);
    const timeOut = formatTimePH(row.time_out);
    const badge   = row.time_out
      ? `<span class="badge badge-ontime">Complete</span>`
      : `<span class="badge badge-late">Pending Out</span>`;

    return `<tr>
      <td>${name}</td>
      <td data-label="Date">${dateStr}</td>
      <td data-label="Time In">${timeIn}</td>
      <td data-label="Time Out">${timeOut}</td>
      <td>${badge}</td>
    </tr>`;
  }).join("");
}

/* MODE TOGGLE */
document.getElementById("newStudentBtn")?.addEventListener("click", () => {
  registrationMode = "new";
  document.getElementById("newStudentBtn")?.classList.add("active");
  document.getElementById("existingStudentBtn")?.classList.remove("active");
  showFaceStatus("New Student mode active.", false);
});

document.getElementById("existingStudentBtn")?.addEventListener("click", () => {
  registrationMode = "addFace";
  document.getElementById("existingStudentBtn")?.classList.add("active");
  document.getElementById("newStudentBtn")?.classList.remove("active");
  showFaceStatus("Add Face mode active.", false);
});

/* INIT */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("registerFaceBtn")?.addEventListener("click", registerFace);
  document.getElementById("attendanceBtn")?.addEventListener("click", markAttendance);
  loadModels();
  loadDashboard();
  setInterval(loadDashboard, 30_000);
});
