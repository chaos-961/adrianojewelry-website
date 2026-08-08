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
 * - A TIME IS A TIME. The slot enum is the diary's own half-hour grid,
 *   9:00 am through the 4:00 pm visit that ends at closing, so the studio's
 *   calendar can hang every request on a real hook. On the day itself the
 *   times already gone by (plus an hour of grace for the confirming call)
 *   are disabled in the picker and refused on submit, because offering
 *   3:00 pm at 2:59 is a promise nobody can keep.
 *
 * - THE ANSWER IS A POP-UP, NOT AN EMAIL. The store confirms by phone, so
 *   the machine sends nothing; the dialog thanks the visitor by name,
 *   repeats the day and the time back, and says we look forward to seeing
 *   them. Closing it rests the page on the same message in flow.
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
  const doneTitle = document.getElementById("bk-done-title");
  const doneCopy = document.getElementById("bk-done-copy");
  const status = document.getElementById("bk-status");
  const submit = document.getElementById("bk-submit");
  const pop = document.getElementById("book-pop");
  const popCard = document.getElementById("bk-pop-card");
  const popCopy = document.getElementById("bk-pop-copy");
  const popOk = document.getElementById("bk-pop-ok");
  const popVeil = document.getElementById("bk-pop-veil");
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
  const SERVICES = ["wedding", "custom", "repair", "restoration", "consultation", "other"];
  /* The diary's grid, identical to the enum in firestore.rules: half-hour
   * visits from opening to the last that still ends by 4:30. */
  const SLOTS = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
    "15:00", "15:30", "16:00",
  ];
  /* How close to a time today's booking may cut it. The store confirms by
   * phone before anything is final, and a call needs somewhere to land. */
  const LEAD_MS = 60 * 60000;
  const THROTTLE_KEY = "adriano-book-at";
  const THROTTLE_MS = 60000;
  /* Firestore does not fail, it WAITS: against an unreachable or not yet
   * provisioned backend the SDK queues the write and retries forever, so an
   * un-raced addDoc leaves a visitor staring at "Sending" until they give
   * up (measured, not imagined: twenty seconds and still spinning). Twelve
   * seconds is a lifetime on a working connection and the moment to offer
   * the phone on a broken one. If the queued write lands after we have
   * already apologised, the store gets a request and a call, which is a
   * duplicate conversation, not a lost customer. */
  const SEND_TIMEOUT_MS = 12000;

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

  const timeLabel = (t) => {
    const h = Number(t.slice(0, 2));
    const mer = h < 12 ? "am" : "pm";
    const h12 = h % 12 || 12;
    return h12 + ":" + t.slice(3) + " " + mer;
  };

  const dayLabel = (dv) =>
    new Date(dv + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

  /* A slot is bookable on a given day unless the day is today and the time
   * is already inside the lead window. Pure so submit and the picker agree. */
  function slotOpen(dv, t) {
    if (dv !== iso(new Date())) return true;
    const at = new Date(dv + "T" + t + ":00");
    return at.getTime() - Date.now() >= LEAD_MS;
  }

  /* Grey out what today can no longer offer, the moment the day is chosen.
   * The options themselves stay in the markup; this only decorates them. */
  function refreshSlots() {
    if (!date || !slot) return;
    const dv = date.value;
    for (const opt of slot.options) {
      if (!opt.value) continue;
      const closed = !!dv && /^\d{4}-\d{2}-\d{2}$/.test(dv) && !slotOpen(dv, opt.value);
      opt.disabled = closed;
      if (closed && slot.value === opt.value) slot.value = "";
    }
  }
  date?.addEventListener("change", refreshSlots);
  date?.addEventListener("input", refreshSlots);

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
    if (!slotOpen(dv, slot.value))
      return [slot, "That time is too close for today. Pick a later one, or call the store."];
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
    const inst = app.getApps?.().length ? app.getApp() : app.initializeApp(FIREBASE_CONFIG);
    firebase = {
      db: fs.getFirestore(inst),
      collection: fs.collection,
      addDoc: fs.addDoc,
      serverTimestamp: fs.serverTimestamp,
    };
    return firebase;
  }

  /* ------------------------------------------------------- the pop-up */

  let lastFocus = null;

  function openPop() {
    if (!pop || !popCard) return;
    lastFocus = document.activeElement;
    pop.hidden = false;
    /* A forced style flush pins the start state so the class added on the
     * next line transitions from it. requestAnimationFrame would be the
     * idiomatic tool, but a hidden or backgrounded tab is never granted a
     * frame, and a dialog waiting on one hangs invisible at opacity zero. */
    void pop.offsetWidth;
    pop.classList.add("is-on");
    popCard.focus();
    document.addEventListener("keydown", onPopKey);
  }

  function closePop() {
    if (!pop || pop.hidden) return;
    document.removeEventListener("keydown", onPopKey);
    pop.classList.remove("is-on");
    const hide = () => {
      pop.hidden = true;
      /* The page rests on the in-flow copy of the same message. */
      if (doneTitle) doneTitle.focus();
      else if (lastFocus?.focus) lastFocus.focus();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) hide();
    else setTimeout(hide, 380);
  }

  function onPopKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePop();
      return;
    }
    /* One button lives in the dialog; Tab has nowhere else honest to go. */
    if (e.key === "Tab" && pop && !pop.hidden) {
      e.preventDefault();
      popOk?.focus();
    }
  }

  popOk?.addEventListener("click", closePop);
  popVeil?.addEventListener("click", closePop);

  function finish(nv, dv, sv) {
    const line =
      "Thank you, " +
      nv +
      ". We have " +
      dayLabel(dv) +
      " at " +
      timeLabel(sv) +
      " for you, and we will call " +
      phone.value.trim() +
      " to confirm it.";
    if (popCopy) popCopy.textContent = line;
    doneCopy.textContent = line + " We look forward to seeing you.";
    form.hidden = true;
    done.hidden = false;
    say("");
    if (pop && popCard) openPop();
    else done.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  let sending = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;

    /* Software that fills every input it can see fills this one too. It is
     * thanked and nothing happens, which is the whole point. */
    if (company && company.value) {
      finish(
        name.value.trim() || "you",
        /^\d{4}-\d{2}-\d{2}$/.test(date.value) ? date.value : iso(today),
        SLOTS.includes(slot.value) ? slot.value : SLOTS[0]
      );
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
    submit.classList.add("is-busy");
    say("Sending your request.");
    try {
      await Promise.race([
        (async () => {
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
        })(),
        new Promise((resolve, reject) =>
          setTimeout(() => reject(new Error("send-timeout")), SEND_TIMEOUT_MS)
        ),
      ]);
      localStorage.setItem(THROTTLE_KEY, String(Date.now()));
      finish(name.value.trim(), date.value, slot.value);
    } catch (err) {
      say("The request could not be sent just now.", true, true);
      submit.disabled = false;
    }
    submit.classList.remove("is-busy");
    sending = false;
  });
})();
