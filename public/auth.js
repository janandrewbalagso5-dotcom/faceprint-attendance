import { supabase } from "./supabase.js";

/* SESSION MANAGEMENT */
export function getCurrentUser() {
  const raw = sessionStorage.getItem("currentUser");
  return raw ? JSON.parse(raw) : null;
}

export function setCurrentUser(user) {
  sessionStorage.setItem("currentUser", JSON.stringify(user));
}

export function clearCurrentUser() {
  sessionStorage.removeItem("currentUser");
}

/* UI HELPERS */
function showSection(sectionId) {
  ["authSection", "appSection"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === sectionId ? "block" : "none";
  });
}

function setAuthMessage(msg, isError = false) {
  const el = document.getElementById("authMessage");
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-message ${isError ? "error" : "success"}`;
  el.style.display = msg ? "block" : "none";
}

function setButtonLoading(btnId, loading, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Please wait…" : originalText;
}

/* SIGN UP */
export async function signUp() {
  const username  = document.getElementById("authUsername")?.value.trim();
  const password  = document.getElementById("authPassword")?.value;
  const studentId = document.getElementById("regStudentId")?.value.trim();
  const fullName  = document.getElementById("regFullName")?.value.trim();
  const major     = document.getElementById("regMajor")?.value;

  if (!username || !password || !studentId || !fullName || !major) {
    setAuthMessage("Please fill in all fields.", true);
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Password must be at least 6 characters.", true);
    return;
  }

  setButtonLoading("signupBtn", true, "Create Account");

  // Check for duplicate username
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    setAuthMessage("Username already taken.", true);
    setButtonLoading("signupBtn", false, "Create Account");
    return;
  }

  const { error } = await supabase.from("users").insert([
    {
      username,
      password,
      student_id: studentId,
      full_name: fullName,
      major,
    },
  ]);

  setButtonLoading("signupBtn", false, "Create Account");

  if (error) {
    setAuthMessage(`Sign-up failed: ${error.message}`, true);
  } else {
    setAuthMessage("Account created! You can now log in.", false);
    // Switch to login tab
    document.getElementById("tabLogin")?.click();
  }
}

/* LOGIN */
export async function login() {
  const username = document.getElementById("authUsername")?.value.trim();
  const password = document.getElementById("authPassword")?.value;

  if (!username || !password) {
    setAuthMessage("Enter your username and password.", true);
    return;
  }

  setButtonLoading("loginBtn", true, "Login");

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  setButtonLoading("loginBtn", false, "Login");

  if (error || !data) {
    setAuthMessage("Invalid username or password.", true);
    return;
  }

  if (data.password !== password) {
    setAuthMessage("Invalid username or password.", true);
    return;
  }

  setCurrentUser(data);
  initAppSection(data);
  showSection("appSection");
}

/*  LOGOUT */
export function logout() {
  clearCurrentUser();
  document.getElementById("authUsername").value = "";
  document.getElementById("authPassword").value = "";
  setAuthMessage("");
  showSection("authSection");
}

/* APP SECTION INIT */
export function initAppSection(user) {
  document.getElementById("profileName").textContent      = user.full_name;
  document.getElementById("profileStudentId").textContent = user.student_id;
  document.getElementById("profileMajor").textContent     = user.major;
  document.getElementById("profileCard").hidden           = false;
  document.getElementById("welcomeName").textContent      = user.full_name;
}

/* AUTO-RESTORE SESSION */
export function restoreSession() {
  const user = getCurrentUser();
  if (user) {
    initAppSection(user);
    showSection("appSection");
  } else {
    showSection("authSection");
  }
}