import { supabase } from "./supabase.js";
import { getAttendanceStatus } from "./face.js";

/* FINGERPRINT / WEBAUTHN */
export async function verifyFingerprint(userId) {
  if (!window.PublicKeyCredential) {
    showFingerprintMessage("WebAuthn is not supported in this browser.", true);
    return false;
  }

  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: "required",
      },
    });
  } catch (err) {
    console.error("WebAuthn error:", err);
    showFingerprintMessage("Fingerprint verification failed or was cancelled.", true);
    return false;
  }

  // Check if attendance already exists today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing, error: fetchError } = await supabase
    .from("attendance")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (fetchError) {
    showFingerprintMessage("Error checking existing attendance: " + fetchError.message, true);
    return false;
  }

  if (existing && existing.length > 0) {
    showFingerprintMessage("Attendance already recorded for today.", false);
    return false;
  }

  const status = getAttendanceStatus(new Date());

  const { error: insertError } = await supabase.from("attendance").insert({
    user_id: userId,
    status,
  });

  if (insertError) {
    showFingerprintMessage("Error recording attendance: " + insertError.message, true);
    return false;
  }

  showFingerprintMessage(`Fingerprint verified — marked ${status}`, false);
  return true;
}

/* UI FEEDBACK */
function showFingerprintMessage(msg, isError) {
  const el = document.getElementById("fingerprintMessage");
  if (!el) {
    alert(msg);
    return;
  }
  el.textContent = msg;
  el.className = `fp-message ${isError ? "error" : "success"}`;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 4000);
}