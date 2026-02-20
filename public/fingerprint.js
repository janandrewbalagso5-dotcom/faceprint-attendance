import { supabase } from "./supabase.js";
import { getTodaySession } from "./face.js";

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Returns today's date string in PH time (YYYY-MM-DD)
function todayPH() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export async function registerFingerprint(userId, username) {
  if (!window.PublicKeyCredential) {
    showFingerprintMessage("WebAuthn is not supported in this browser.", true);
    return false;
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: "Attendance App",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(String(userId)),
          name: username,
          displayName: username,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7  },
          { type: "public-key", alg: -257 },
        ],
        userVerification: "required",
        authenticatorSelection: {
          userVerification: "required",
          residentKey: "preferred",
        },
      },
    });

    const credentialIdBase64 = bufferToBase64(credential.rawId);

    const { error } = await supabase
      .from("users")
      .update({ credential_id: credentialIdBase64 })
      .eq("id", userId);

    if (error) {
      showFingerprintMessage("Failed to save fingerprint: " + error.message, true);
      return false;
    }

    showFingerprintMessage("Fingerprint registered successfully!", false);
    return true;

  } catch (err) {
    console.error("WebAuthn registration error:", err);
    showFingerprintMessage("Fingerprint registration failed or was cancelled.", true);
    return false;
  }
}

export async function verifyFingerprint(userId) {
  if (!window.PublicKeyCredential) {
    showFingerprintMessage("WebAuthn is not supported in this browser.", true);
    return false;
  }

  // Fetch stored credential ID
  const { data: userData, error: fetchUserError } = await supabase
    .from("users")
    .select("credential_id")
    .eq("id", userId)
    .maybeSingle();

  if (fetchUserError || !userData) {
    showFingerprintMessage("Could not find your account.", true);
    return false;
  }

  if (!userData.credential_id) {
    showFingerprintMessage("No fingerprint registered. Please register your fingerprint first.", true);
    return false;
  }

  // Ask device to verify biometric
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [
          {
            type: "public-key",
            id: base64ToBuffer(userData.credential_id),
            transports: ["internal", "hybrid"],
          },
        ],
        userVerification: "required",
        rpId: window.location.hostname,
      },
    });
  } catch (err) {
    console.error("WebAuthn verification error:", err);
    showFingerprintMessage("Fingerprint verification failed or was cancelled.", true);
    return false;
  }

  // Biometric passed — now handle Time In / Time Out session logic
  const session = await getTodaySession(userId);
  const now     = new Date().toISOString();

  if (!session) {
    // ── TIME IN: create a new session row ──
    const { error } = await supabase.from("attendance").insert({
      user_id:  userId,
      date:     todayPH(),
      time_in:  now,
    });
    if (error) {
      showFingerprintMessage("Error recording Time In: " + error.message, true);
      return false;
    }
    showFingerprintMessage("Fingerprint verified — Time In recorded.", false);

  } else if (!session.time_out) {
    // ── TIME OUT: update the existing session row ──
    const { error } = await supabase
      .from("attendance")
      .update({ time_out: now })
      .eq("id", session.id);
    if (error) {
      showFingerprintMessage("Error recording Time Out: " + error.message, true);
      return false;
    }
    showFingerprintMessage("Fingerprint verified — Time Out recorded.", false);

  } else {
    showFingerprintMessage("You have already timed in and out today.", false);
    return false;
  }

  return true;
}

/* UI FEEDBACK */
function showFingerprintMessage(msg, isError) {
  const el = document.getElementById("fingerprintMessage");
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.className = `fp-message ${isError ? "error" : "success"}`;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 4000);
}
