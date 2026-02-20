import { supabase } from "./supabase.js";

/* STATE */
let modelsLoaded    = false;
let registeredUsers = [];
let registrationMode = "new";

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

// faceapi CDN must finish loading before first use
let _opts = null;
function getOpts() {
  if (!_opts) _opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  return _opts;
}

// Always fetch fresh
function getVideo() { return document.getElementById("video"); }

/* EXPORTED HELPERS */
// Returns "TIME IN" if no record exists today, "TIME OUT" if one already does.
export async function getAttendanceType(userId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from("attendance")
    .select("id")
    .eq("user_id", userId)
    .gte("timestamp", startOfDay.toISOString());

  return existing && existing.length > 0 ? "TIME OUT" : "TIME IN";
}

// Kept for backward-compat; no longer used internally
export function getAttendanceStatus(date = new Date()) {
  return "TIME IN";
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
    console.log("✅ Face-api models loaded");
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
    showFaceStatus("Camera not ready. Click \"Start Camera\" first.", true); return;
  }

  showFaceStatus("Detecting face…");

  const detection = await faceapi
    .detectSingleFace(video, getOpts())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) { showFaceStatus("No face detected. Ensure good lighting and face the camera.", true); return; }
  if (isDuplicateFace(detection.descriptor)) { showFaceStatus("This face is already registered.", true); return; }

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
    descriptor: Array.from(detection.descriptor),
    photo,
  });
  if (imgError) { showFaceStatus("Failed to save face image: " + imgError.message, true); return; }

  showProfile(user, photo);
  await loadRegisteredUsers();
  showFaceStatus("Face registered successfully ✓", false);
}

/* MARK ATTENDANCE */
async function markAttendance() {
  if (!modelsLoaded) { showFaceStatus("Models are still loading, please wait…", true); return; }
  if (registeredUsers.length === 0) { showFaceStatus("No registered faces found.", true); return; }

  const video = getVideo();
  if (!video?.srcObject) {
    showFaceStatus("Camera not ready. Click \"Start Camera\" first.", true); return;
  }

  showFaceStatus("Scanning face…");

  const detection = await faceapi
    .detectSingleFace(video, getOpts())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) { hideProfile(); showFaceStatus("No face detected. Please try again.", true); return; }

  const matcher = new faceapi.FaceMatcher(
    registeredUsers.map(u => new faceapi.LabeledFaceDescriptors(u.student_id, u.descriptors)),
    0.6
  );
  const match = matcher.findBestMatch(detection.descriptor);

  if (match.label === "unknown") { hideProfile(); showFaceStatus("Face not recognised. Please register first.", true); return; }

  const user = registeredUsers.find(u => u.student_id === match.label);
  if (!user) { showFaceStatus("Matched user not found in local data.", true); return; }

  // Verify the recognised face belongs to the currently logged-in student
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser || user.student_id !== currentUser.student_id) {
    hideProfile();
    showFaceStatus("Face does not match the logged-in account. Please use your own face.", true);
    return;
  }

  const type = await getAttendanceType(user.id);

  // Prevent duplicate TIME OUT (only allow up to 2 records per day)
  if (type === "TIME OUT") {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data: dayRecords } = await supabase.from("attendance").select("id").eq("user_id", user.id).gte("timestamp", startOfDay.toISOString());
    if (dayRecords && dayRecords.length >= 2) {
      showFaceStatus("You have already timed in and out today.", false); return;
    }
  }

  const { error } = await supabase.from("attendance").insert({ user_id: user.id, status: type });

  if (error) { showFaceStatus("Error recording attendance: " + error.message, true); return; }

  showProfile(user);
  showFaceStatus(`${type} recorded — ${user.name}`, false);
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

/* DASHBOARD */
export async function loadDashboard() {
  const tbody      = document.getElementById("dashboard-body");
  const emptyState = document.getElementById("dashboardEmpty");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="3" class="loading-row">Loading…</td></tr>`;

  const { data: rows, error } = await supabase
    .from("attendance")
    .select("user_id, timestamp, status")
    .order("timestamp", { ascending: false })
    .limit(50);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="error-row">Failed to load data.</td></tr>`;
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

  tbody.innerHTML = rows.map(row => {
const raw = row.timestamp ?? null;
const date   = raw ? new Date(raw) : null;
const timePH = date && !isNaN(date)
  ? date.toLocaleString("en-PH", {
      timeZone: "Asia/Manila", year: "numeric", month: "short",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true,
    })
  : "—";
    const name   = userMap[row.user_id]?.full_name ?? "Unknown";
    const isOut  = row.status === "TIME OUT";
    return `<tr>
      <td>${name}</td>
      <td>${timePH}</td>
      <td><span class="badge ${isOut ? "badge-late" : "badge-ontime"}">${row.status ?? "—"}</span></td>
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
