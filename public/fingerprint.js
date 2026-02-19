import { supabase } from "./supabase.js";
import { getAttendanceStatus } from "./face.js";

/* ─────────────────────────────────────────────
   HELPERS – ArrayBuffer ↔ Base64
   Supabase stores the credential ID as a Base64
   string so we can save / load it easily.
───────────────────────────────────────────── */
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/* ─────────────────────────────────────────────
   STEP 1 – REGISTRATION  (call this once when
   the user sets up their account / profile)

   Saves the credential ID to the `users` table
   so it can be retrieved later for verification.

   Usage:
     import { registerFingerprint } from "./fingerprint.js";
     await registerFingerprint(user.id, user.username);
───────────────────────────────────────────── */
export async function registerFingerprint(userId, username) {
  if (!window.PublicKeyCredential) {
    showFingerprintMessage("WebAuthn is not supported in this browser.", true);
    return false;
  }

  try {
    // Ask the browser / device to create a new key pair.
    // The user will be prompted for their fingerprint / PIN.
    const credential = await navigator.credentials.create({
      publicKey: {
        // A random challenge prevents replay attacks.
        challenge: crypto.getRandomValues(new Uint8Array(32)),

        // Identifies YOUR web app (must match the current domain).
        rp: {
          name: "Attendance App",
          id: window.location.hostname,         // e.g. "yourdomain.com"
        },

        // Ties the credential to this specific user.
        user: {
          id: new TextEncoder().encode(String(userId)), // must be a BufferSource
          name: username,
          displayName: username,
        },

        // Only ask for public-key credentials.
        pubKeyCredParams: [
          { type: "public-key", alg: -7  },   // ES256 (preferred)
          { type: "public-key", alg: -257 },   // RS256 (fallback)
        ],

        // "required" forces biometric / PIN on the device.
        userVerification: "required",

        // Prevent registering the same authenticator twice.
        authenticatorSelection: {
          userVerification: "required",
          residentKey: "preferred",
        },
      },
    });

    // Convert the credential ID to Base64 for storage.
    const credentialIdBase64 = bufferToBase64(credential.rawId);

    // Save it to the user's row in Supabase.
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

/* ─────────────────────────────────────────────
   STEP 2 – VERIFICATION  (call this every time
   the user wants to record attendance)

   Flow:
   1. Fetch the stored credential ID from Supabase.
   2. Ask the browser to sign a challenge with that
      specific credential (triggers fingerprint prompt).
   3. If the browser resolves it → fingerprint matched.
   4. Check for duplicate attendance today.
   5. Insert attendance record.
───────────────────────────────────────────── */
export async function verifyFingerprint(userId) {
  if (!window.PublicKeyCredential) {
    showFingerprintMessage("WebAuthn is not supported in this browser.", true);
    return false;
  }

  /* 1. Fetch the stored credential ID ──────── */
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
    showFingerprintMessage(
      "No fingerprint registered. Please register your fingerprint first.",
      true
    );
    return false;
  }

  /* 2. Ask device to verify with that credential */
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),

        // IMPORTANT: tells the browser which credential to use.
        // Without this it may show a generic picker or fail.
        allowCredentials: [
          {
            type: "public-key",
            id: base64ToBuffer(userData.credential_id),
            // Hint the browser to check both platform (Touch ID / Windows Hello)
            // and roaming authenticators (YubiKey, etc.)
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

  /* 3. Fingerprint matched – check duplicate attendance */
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing, error: fetchError } = await supabase
    .from("attendance")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (fetchError) {
    showFingerprintMessage("Error checking attendance: " + fetchError.message, true);
    return false;
  }

  if (existing && existing.length > 0) {
    showFingerprintMessage("Attendance already recorded for today.", false);
    return false;
  }

  /* 4. Insert attendance record ─────────────── */
  const status = getAttendanceStatus(new Date());

  const { error: insertError } = await supabase.from("attendance").insert({
    user_id: userId,
    status,
  });

  if (insertError) {
    showFingerprintMessage("Error recording attendance: " + insertError.message, true);
    return false;
  }

  showFingerprintMessage(`Fingerprint verified – marked ${status}`, false);
  return true;
}

/* ─────────────────────────────────────────────
   UI FEEDBACK
───────────────────────────────────────────── */
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
