/* Adriano Studio, the gate.
 *
 * The dashboard this page exists to show is not in the page. It ships as
 * admin/payload.js, AES-256-GCM ciphertext with its key derived from the
 * studio password through 600,000 rounds of PBKDF2-SHA-256, so the markup
 * and the code of the admin surface are simply absent until the password
 * has proved itself. The password itself never ships anywhere: no hash of
 * it, no salt of it standing alone, nothing to grind offline except the
 * full derivation, which is the point of the 600,000 rounds. The builder
 * (scripts/admin-payload.js) reads the password from a local file that git
 * ignores; what the repo carries is ciphertext.
 *
 * Two locks turn on one key. The password that decrypts the payload is
 * also the Firebase admin account's password, so unlocking the STUDIO and
 * signing into the DATA are the same gesture, exactly the model this page
 * borrows from the Pavia studio it was asked to follow. Decrypting the
 * dashboard without the sign-in would show an empty shell (the rules
 * refuse every read to anybody else); signing in without the payload
 * would show nothing at all. Fifteen quiet minutes lock both again.
 *
 * What a failed guess costs: nothing readable. AES-GCM authenticates, so a
 * wrong password is indistinguishable from corrupt ciphertext; the gate
 * answers with a delay that grows per attempt, and the delay is the ONLY
 * signal. While FIREBASE_CONFIG is null the gate still works, opening the
 * dashboard in preview with the connection banner honest about it. */

import { FIREBASE_CONFIG, ADMIN_EMAIL, FIREBASE_SDK } from "./firebase-config.js";

(function () {
  "use strict";

  const PAYLOAD = window.ADRIANO_ADMIN_PAYLOAD;
  const USER = "admin";
  const WARN_SECONDS = 60;

  const gate = document.getElementById("studio-gate");
  const mount = document.getElementById("studio-mount");
  const form = document.getElementById("gate-form");
  const pass = document.getElementById("gate-pass");
  const toggle = document.getElementById("gate-toggle");
  const submit = document.getElementById("gate-submit");
  const statusEl = document.getElementById("gate-status");
  if (!gate || !mount || !form || !pass || !submit) return;

  const enc = new TextEncoder();
  const state = {
    unlocked: false,
    fails: 0,
    fb: null,
    inactivityTimer: 0,
    warnTimer: 0,
    warnInterval: 0,
    injected: null,
  };

  const b64 = (v) => Uint8Array.from(atob(v || ""), (c) => c.charCodeAt(0));

  function say(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", !!isError && !!text);
  }

  function busy(on) {
    submit.disabled = on;
    pass.disabled = on;
  }

  function resetToggle() {
    if (pass.type === "text") pass.type = "password";
    if (toggle) {
      toggle.textContent = "Show";
      toggle.setAttribute("aria-pressed", "false");
      toggle.setAttribute("aria-label", "Show password");
    }
  }

  toggle?.addEventListener("click", () => {
    const reveal = pass.type === "password";
    pass.type = reveal ? "text" : "password";
    toggle.textContent = reveal ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(reveal));
    toggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    pass.focus();
  });

  /* ---------------------------------------------------------- decryption */

  async function deriveKey(password, salt) {
    /* The key material is "admin", a NUL, then the password: a separator
     * neither part can contain, so no two (user, password) pairs can ever
     * collide into one string. The NUL is BUILT AT RUNTIME rather than
     * written in the source, because a zero byte in a string literal is
     * invisible in a diff, turns the file "binary" to every text tool, and
     * cost a debugging session the one time it happened. The builder
     * (scripts/admin-payload.js) constructs the same three pieces the same
     * way; the two derive identically or the vault never opens. */
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(USER + String.fromCharCode(0) + password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: Number(PAYLOAD?.iterations) || 600000,
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  async function decryptPayload(password) {
    if (!PAYLOAD?.ciphertext || !PAYLOAD?.salt || !PAYLOAD?.iv) {
      throw new Error("payload-missing");
    }
    const key = await deriveKey(password, b64(PAYLOAD.salt));
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: b64(PAYLOAD.iv),
        additionalData: enc.encode("adriano-admin:v" + (PAYLOAD.version || 1)),
      },
      key,
      b64(PAYLOAD.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /* ------------------------------------------------------------ firebase */

  async function connect(password) {
    if (!FIREBASE_CONFIG) return null;
    const [appM, authM, fsM] = await Promise.all([
      import(FIREBASE_SDK + "firebase-app.js"),
      import(FIREBASE_SDK + "firebase-auth.js"),
      import(FIREBASE_SDK + "firebase-firestore.js"),
    ]);
    const app = appM.getApps?.().length
      ? appM.getApp()
      : appM.initializeApp(FIREBASE_CONFIG);
    const auth = authM.getAuth(app);
    await authM.signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
    const db = fsM.getFirestore(app);
    const fb = { app, auth, db, authM, fsM };
    /* Losing the Firebase session while the studio is open is a lock, not a
     * quiet degradation: a dashboard that silently stopped being allowed to
     * read would look exactly like an empty diary. */
    authM.onAuthStateChanged(auth, (user) => {
      if (state.unlocked && !user) {
        lock("The Firebase session ended. Unlock again to continue.");
      }
    });
    return fb;
  }

  /* The context the decrypted dashboard runs against. It never touches the
   * SDK directly; these four verbs are the whole of its authority, and they
   * are only as strong as the signed-in account behind them. */
  function buildCtx() {
    const fb = state.fb;
    return Object.freeze({
      configured: !!fb,
      email: ADMIN_EMAIL,
      watch(cb) {
        if (!fb) {
          cb([], null);
          return () => {};
        }
        const q = fb.fsM.query(
          fb.fsM.collection(fb.db, "appointments"),
          fb.fsM.orderBy("createdAt", "desc"),
          fb.fsM.limit(500)
        );
        return fb.fsM.onSnapshot(
          q,
          (snap) => {
            const list = [];
            snap.forEach((doc) => {
              const d = doc.data() || {};
              list.push({
                id: doc.id,
                name: String(d.name || ""),
                phone: String(d.phone || ""),
                email: String(d.email || ""),
                service: String(d.service || "other"),
                date: String(d.date || ""),
                slot: String(d.slot || "any"),
                message: String(d.message || ""),
                status: String(d.status || "new"),
                createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : 0,
              });
            });
            cb(list, null);
          },
          (err) => cb(null, err)
        );
      },
      setStatus(id, status) {
        if (!fb) return Promise.reject(new Error("not-configured"));
        return fb.fsM.updateDoc(fb.fsM.doc(fb.db, "appointments", id), { status });
      },
      remove(id) {
        if (!fb) return Promise.reject(new Error("not-configured"));
        return fb.fsM.deleteDoc(fb.fsM.doc(fb.db, "appointments", id));
      },
      lock() {
        lock("");
      },
    });
  }

  /* ------------------------------------------------- inactivity and lock */

  function clearWarn() {
    if (state.warnInterval) {
      clearInterval(state.warnInterval);
      state.warnInterval = 0;
    }
    document.getElementById("studio-lock-warning")?.remove();
  }

  function showWarn() {
    if (!state.unlocked || document.getElementById("studio-lock-warning")) return;
    let left = WARN_SECONDS;
    const bar = document.createElement("div");
    bar.id = "studio-lock-warning";
    bar.className = "studio-lock";
    bar.setAttribute("role", "alertdialog");
    bar.setAttribute("aria-live", "assertive");
    const label = document.createElement("span");
    label.textContent = "Locking in " + left + "s for inactivity.";
    const stay = document.createElement("button");
    stay.type = "button";
    stay.className = "appt-btn";
    stay.textContent = "Stay signed in";
    stay.addEventListener("click", pokeActivity);
    bar.append(label, stay);
    document.body.appendChild(bar);
    state.warnInterval = window.setInterval(() => {
      left -= 1;
      label.textContent = "Locking in " + Math.max(0, left) + "s for inactivity.";
      if (left <= 0) clearWarn();
    }, 1000);
  }

  function pokeActivity() {
    clearTimeout(state.inactivityTimer);
    clearTimeout(state.warnTimer);
    clearWarn();
    if (!state.unlocked) return;
    const minutes = Number(PAYLOAD?.lockAfterMinutes) || 15;
    const total = minutes * 60 * 1000;
    state.warnTimer = window.setTimeout(showWarn, Math.max(0, total - WARN_SECONDS * 1000));
    state.inactivityTimer = window.setTimeout(() => {
      lock("Locked after inactivity. Enter the studio password again.");
    }, total);
  }

  for (const ev of ["click", "keydown", "pointermove", "scroll", "touchstart"]) {
    window.addEventListener(ev, pokeActivity, { passive: true });
  }

  function lock(message) {
    state.unlocked = false;
    /* The dashboard releases its own subscriptions and listeners BEFORE its
     * DOM goes, so nothing keeps firing into a removed tree and a second
     * unlock cannot stack duplicates. */
    try {
      window.__STUDIO_TEARDOWN?.();
    } catch (e) {
      /* best effort */
    }
    window.__STUDIO_TEARDOWN = undefined;
    window.__STUDIO_CTX = undefined;
    if (state.fb) {
      state.fb.authM.signOut(state.fb.auth).catch(() => {});
      state.fb = null;
    }
    clearTimeout(state.inactivityTimer);
    clearTimeout(state.warnTimer);
    clearWarn();
    mount.hidden = true;
    mount.replaceChildren();
    state.injected?.remove();
    state.injected = null;
    gate.hidden = false;
    pass.value = "";
    resetToggle();
    busy(false);
    if (message) say(message, false);
  }

  /* -------------------------------------------------------------- unlock */

  function inject(payload) {
    window.__STUDIO_CTX = buildCtx();
    mount.innerHTML = payload.html;
    const script = document.createElement("script");
    script.textContent = payload.code;
    state.injected = script;
    document.body.appendChild(script);
    gate.hidden = true;
    mount.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = pass.value;
    if (!password) return;
    busy(true);
    say("Unlocking.");

    /* The only signal a guess gets is time. */
    const delay = Math.min(state.fails * 900, 4500);
    if (delay) await new Promise((r) => setTimeout(r, delay));

    try {
      const payload = await decryptPayload(password);
      if (!payload?.html || !payload?.code) throw new Error("payload-shape");
      state.fb = await connect(password);
      state.fails = 0;
      state.unlocked = true;
      pass.value = "";
      resetToggle();
      say("");
      inject(payload);
      pokeActivity();
    } catch (err) {
      state.fails += 1;
      pass.value = "";
      resetToggle();
      busy(false);
      pass.focus();
      const code = String(err?.code || "");
      if (code === "auth/network-request-failed") {
        say("Could not reach Firebase. Check the connection and try again.", true);
      } else if (code.startsWith("auth/")) {
        say(
          "The studio opened but Firebase refused the sign-in. The admin account's password must match the studio password.",
          true
        );
      } else if (err?.message === "payload-missing") {
        say("The encrypted dashboard is missing. Rebuild admin/payload.js.", true);
      } else {
        say("That is not the password.", true);
      }
      return;
    }
    busy(false);
  });
})();
