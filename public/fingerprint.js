import { supabase } from "./supabase.js";
import { getAttendanceStatus } from "./face.js";

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
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

        // Ties the credential to this specific user.
        user: {
          id: new TextEncoder().encode(String(userId)), // must be a BufferSource
          name: username,
          displayName: username,
        },

        // Only ask for public-key credentials.
        pubKeyCredParams: [
          { type: "public-key", alg: -7  },   
          { type: "public-key", alg: -257 },   
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

export async function verifyFingerprint(userId) {
  if (!window.PublicKeyCredential) {
    showFingerprintMessage("WebAuthn is not supported in this browser.", true);
    return false;
  }

  // Fetch the stored credential ID 
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

  // Ask device to verify with that credential 
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

  // Fingerprint matched – check duplicate attendance
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

  // Insert attendance record 
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

// UI FEEDBACK
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
