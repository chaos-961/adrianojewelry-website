/* Adriano Jewelry, the booking form.
 *
 * The page is complete HTML; this module wires its one form to Firestore.
 * The shape of the system, and why it is shaped that way:
 *
 * - THE SDK IS FETCHED ON FIRST SUBMIT, not on load. A visitor who reads
 *   the page and calls the store instead costs the connection nothing, and
 *   the form's first paint never waits on gstatic. The import is cached
 *   after the first press, so a retry is instant.
 *
 * - EVERY RULE HERE IS RESTATED IN firestore.rules, and the server's copy
 *   is the one that binds. Client validation exists to give a person an
 *   answer they can act on before the round trip; it protects nobody. The
 *   rules accept exactly one shape of document (create only, status "new",
 *   server time, every field typed and capped) and reject everything else,
 *   whoever wrote the client.
 *
 * - THE HONEYPOT FAILS SILENTLY. A filled "company" field is software
 *   working through the raw form; it is shown the same thank-you and
 *   nothing is written. Telling a robot it was caught is free training.
 *
 * - ONE REQUEST A MINUTE PER BROWSER, kept in localStorage. Not security
 *   (the rules cannot see it and a determined pest clears it), just a
 *   kindness to the bench against a double-tapped submit and to the quota
 *   against a stuck key.
 *
 * With FIREBASE_CONFIG null the form still answers: it explains that online
 * booking is not switched on and offers the phone, which is the store's
 * preferred channel anyway. */

import { FIREBASE_CONFIG, FIREBASE_SDK } from "./firebase-config.js";

(function () {
  "use strict";

  const form = document.getElementById("book-form");
  const done = document.getElementById("book-done");
  const doneCopy = document.getElementById("bk-done-copy");
  const status = document.getElementById("bk-status");
  const submit = document.getElementById("bk-submit");
  if (!form || !done || !status || !submit) return;

  const field = (id) => document.getElementById(id);
  const name = field("bk-name");
  const phone = field("bk-phone");
  const email = field("bk-email");
  const service = field("bk-service");
  const date = field("bk-date");
  const slot = field("bk-slot");
  const message = field("bk-message");
  const company = field("bk-company");

  const PHONE_RE = /^[0-9+()\-. ]{7,25}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const SERVICES = ["custom", "repair", "restoration", "consultation", "other"];
  const SLOTS = ["morning", "midday", "afternoon", "any"];
  const THROTTLE_KEY = "adriano-book-at";
  const THROTTLE_MS = 60000;

  /* The date field's window: from today to about six months out, written as
   * the input's own min/max so the picker offers only days the form would
   * accept. The strings are local dates, because the appointment is at a
   * counter in Boston, not in UTC. */
  const iso = (d) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  const today = new Date();
  const horizon = new Date(today.getTime() + 180 * 86400000);
  if (date) {
    date.min = iso(today);
    date.max = iso(horizon);
  }

  function say(text, isError, withPhone) {
    status.classList.toggle("is-error", !!isError);
    status.textContent = "";
    status.append(text);
    if (withPhone) {
      status.append(" Call the store at ");
      const a = document.createElement("a");
      a.href = "tel:+18579911679";
      a.textContent = "857-991-1679";
      status.append(a);
      status.append(" and we will take it down the old way.");
    }
  }

  /* One answer per field, in the order the form reads, so a keyboard user is
   * dropped onto the first thing that needs them rather than handed a list. */
  function firstProblem() {
    const nv = name.value.trim();
    if (nv.length < 2 || nv.length > 80)
      return [name, "Give us a name to put the appointment under."];
    if (!PHONE_RE.test(phone.value.trim()))
      return [phone, "That phone number does not look complete."];
    const ev = email.value.trim();
    if (ev && (ev.length > 120 || !EMAIL_RE.test(ev)))
      return [email, "That email address does not look complete."];
    if (!SERVICES.includes(service.value))
      return [service, "Tell us what the visit is for."];
    const dv = date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dv) || dv < date.min || dv > date.max)
      return [date, "Pick a day from today up to six months out."];
    if (!SLOTS.includes(slot.value)) return [slot, "Pick a time that suits you."];
    if (message.value.length > 600)
      return [message, "Keep the note under six hundred characters."];
    return null;
  }

  /* The SDK, imported once and shared by every submit after the first. */
  let firebase = null;
  async function backend() {
    if (firebase) return firebase;
    const [app, fs] = await Promise.all([
      import(FIREBASE_SDK + "firebase-app.js"),
      import(FIREBASE_SDK + "firebase-firestore.js"),
    ]);
    const inst = app.initializeApp(FIREBASE_CONFIG);
    firebase = {
      db: fs.getFirestore(inst),
      collection: fs.collection,
      addDoc: fs.addDoc,
      serverTimestamp: fs.serverTimestamp,
    };
    return firebase;
  }

  const SLOT_TEXT = {
    morning: "in the morning",
    midday: "around midday",
    afternoon: "in the afternoon",
    any: "at whatever time suits the bench",
  };

  function finish(nv, dv, sv) {
    const day = new Date(dv + "T12:00:00");
    const dayText = day.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    doneCopy.textContent =
      "Thank you, " +
      nv +
      ". We will call you at " +
      phone.value.trim() +
      " to confirm " +
      dayText +
      " " +
      SLOT_TEXT[sv] +
      ".";
    form.hidden = true;
    done.hidden = false;
    done.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  let sending = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;

    /* Software that fills every input it can see fills this one too. It is
     * thanked and nothing happens, which is the whole point. */
    if (company && company.value) {
      finish(name.value.trim() || "you", date.value || iso(today), slot.value || "any");
      return;
    }

    const problem = firstProblem();
    if (problem) {
      say(problem[1], true);
      problem[0].focus();
      return;
    }

    if (!FIREBASE_CONFIG) {
      say(
        "Online booking is being switched on. Until it is, call the store at ",
        false
      );
      const a = document.createElement("a");
      a.href = "tel:+18579911679";
      a.textContent = "857-991-1679";
      status.append(a);
      status.append(" and we will set the appointment over the phone.");
      return;
    }

    const last = Number(localStorage.getItem(THROTTLE_KEY) || 0);
    if (Date.now() - last < THROTTLE_MS) {
      say("One moment. Your last request is still on its way to us.", true);
      return;
    }

    sending = true;
    submit.disabled = true;
    say("Sending your request.");
    try {
      const fb = await backend();
      await fb.addDoc(fb.collection(fb.db, "appointments"), {
        name: name.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        service: service.value,
        date: date.value,
        slot: slot.value,
        message: message.value.trim(),
        status: "new",
        createdAt: fb.serverTimestamp(),
      });
      localStorage.setItem(THROTTLE_KEY, String(Date.now()));
      say("");
      finish(name.value.trim(), date.value, slot.value);
    } catch (err) {
      say("The request could not be sent just now.", true, true);
      submit.disabled = false;
    }
    sending = false;
  });
})();
