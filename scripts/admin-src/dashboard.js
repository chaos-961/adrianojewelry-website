/* The Studio dashboard, the plaintext code. Injected by the gate as an
 * inline script after decryption; it runs against window.__STUDIO_CTX and
 * nothing else, so its whole authority is the four verbs the gate built
 * over the signed-in admin session.
 *
 * EVERY FIELD A VISITOR TYPED IS RENDERED THROUGH textContent, never
 * through markup. The list is user-supplied strings shown inside the one
 * signed-in session on the site; innerHTML here would hand any visitor a
 * script slot in the admin's browser, which is the exact bug this comment
 * exists to keep out. */
(function () {
  "use strict";

  var ctx = window.__STUDIO_CTX;
  if (!ctx) return;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var conn = $("st-conn");
  var views = $("st-views");
  var search = $("st-search");
  var sortSel = $("st-sort");
  var listEl = $("st-list");
  var emptyEl = $("st-empty");

  var SERVICE_TEXT = {
    custom: "Custom design",
    repair: "A repair",
    restoration: "A restoration",
    consultation: "A consultation",
    other: "Something else",
  };
  var SLOT_TEXT = {
    morning: "morning, 9:00 to 11:00",
    midday: "midday, 11:00 to 1:00",
    afternoon: "afternoon, 1:00 to 4:30",
    any: "any time that suits the bench",
  };
  var STATUS_TEXT = { new: "New", confirmed: "Confirmed", done: "Completed", cancelled: "Cancelled" };

  var state = { items: [], view: "new", q: "", sort: "newest", error: null };
  var unsub = null;

  function dayText(dv) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dv)) return dv || "no day given";
    return new Date(dv + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function agoText(ms) {
    if (!ms) return "just now";
    var s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + "s ago";
    var m = Math.round(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + "h ago";
    return Math.round(h / 24) + "d ago";
  }

  function counts() {
    var c = { new: 0, confirmed: 0, done: 0, cancelled: 0, all: state.items.length };
    for (var i = 0; i < state.items.length; i++) {
      var s = state.items[i].status;
      if (c[s] !== undefined) c[s] += 1;
    }
    return c;
  }

  function visible() {
    var q = state.q.toLowerCase();
    var out = state.items.filter(function (it) {
      if (state.view !== "all" && it.status !== state.view) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().indexOf(q) !== -1 ||
        it.phone.toLowerCase().indexOf(q) !== -1 ||
        it.email.toLowerCase().indexOf(q) !== -1 ||
        it.message.toLowerCase().indexOf(q) !== -1
      );
    });
    out.sort(function (a, b) {
      if (state.sort === "oldest") return a.createdAt - b.createdAt;
      if (state.sort === "day") return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      return b.createdAt - a.createdAt;
    });
    return out;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function actionBtn(label, primary, danger, fn) {
    var b = el(
      "button",
      "appt-btn" + (primary ? " appt-btn--primary" : "") + (danger ? " appt-btn--danger" : ""),
      label
    );
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }

  function move(it, status) {
    ctx.setStatus(it.id, status).catch(function () {
      window.alert("Firestore refused the change. Check the connection and the rules.");
    });
  }

  function card(it) {
    var root = el("article", "appt");

    var head = el("div", "appt__head");
    head.appendChild(el("h2", "appt__name", it.name || "No name"));
    var badge = el("span", "appt__badge", STATUS_TEXT[it.status] || it.status);
    badge.dataset.s = it.status;
    head.appendChild(badge);
    root.appendChild(head);

    var when = el("p", "appt__when");
    when.appendChild(document.createTextNode(dayText(it.date) + ", " + (SLOT_TEXT[it.slot] || it.slot) + " "));
    when.appendChild(el("span", "appt__service", "· " + (SERVICE_TEXT[it.service] || it.service)));
    root.appendChild(when);

    var contact = el("p", "appt__contact");
    if (it.phone) {
      var tel = el("a", null, it.phone);
      tel.href = "tel:" + it.phone.replace(/[^0-9+]/g, "");
      contact.appendChild(tel);
    }
    if (it.email) {
      var mail = el("a", null, it.email);
      mail.href = "mailto:" + encodeURIComponent(it.email);
      contact.appendChild(mail);
    }
    if (contact.childNodes.length) root.appendChild(contact);

    if (it.message) root.appendChild(el("p", "appt__msg", it.message));

    root.appendChild(el("p", "appt__meta", "Requested " + agoText(it.createdAt)));

    var actions = el("div", "appt__actions");
    if (it.status === "new") {
      actions.appendChild(actionBtn("Confirm", true, false, function () { move(it, "confirmed"); }));
      actions.appendChild(actionBtn("Cancel", false, false, function () { move(it, "cancelled"); }));
    } else if (it.status === "confirmed") {
      actions.appendChild(actionBtn("Mark completed", true, false, function () { move(it, "done"); }));
      actions.appendChild(actionBtn("Cancel", false, false, function () { move(it, "cancelled"); }));
    } else {
      actions.appendChild(actionBtn("Reopen", false, false, function () { move(it, "new"); }));
    }
    actions.appendChild(
      actionBtn("Delete", false, true, function () {
        if (window.confirm("Delete this request outright? Cancelling keeps it as history.")) {
          ctx.remove(it.id).catch(function () {
            window.alert("Firestore refused the delete. Check the connection and the rules.");
          });
        }
      })
    );
    root.appendChild(actions);

    return root;
  }

  function render() {
    var c = counts();
    views.querySelectorAll(".studio-seg__count").forEach(function (n) {
      n.textContent = String(c[n.dataset.count] || 0);
    });
    views.querySelectorAll(".studio-seg__btn").forEach(function (b) {
      var on = b.dataset.view === state.view;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });

    var list = visible();
    listEl.replaceChildren();
    for (var i = 0; i < list.length; i++) listEl.appendChild(card(list[i]));

    var empty = "";
    if (state.error) {
      empty =
        "Firestore refused the read. Deploy firestore.rules and confirm the admin account; the console's own error was: " +
        state.error;
    } else if (!ctx.configured) {
      empty =
        "The Studio is not connected yet. Paste the Firebase web config into assets/js/firebase-config.js, create the admin account, and deploy firestore.rules; scripts/firebase-setup.md walks through all of it.";
    } else if (!list.length) {
      empty = state.q
        ? "Nothing matches that search in this view."
        : "Nothing in this view yet. New requests appear here the moment a visitor sends the booking form.";
    }
    emptyEl.hidden = !empty;
    emptyEl.textContent = empty;
  }

  /* ------------------------------------------------------------- wiring */

  views.addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]");
    if (!b) return;
    state.view = b.dataset.view;
    render();
  });

  var searchT = 0;
  search.addEventListener("input", function () {
    clearTimeout(searchT);
    searchT = setTimeout(function () {
      state.q = search.value.trim();
      render();
    }, 120);
  });

  sortSel.addEventListener("change", function () {
    state.sort = sortSel.value;
    render();
  });

  $("st-lock").addEventListener("click", function () {
    ctx.lock();
  });

  if (ctx.configured) {
    conn.textContent = "Live, as " + ctx.email;
    conn.classList.add("is-live");
  } else {
    conn.textContent = "Not connected";
  }

  unsub = ctx.watch(function (list, err) {
    if (err) {
      state.error = String(err.code || err.message || err);
    } else {
      state.error = null;
      state.items = list || [];
    }
    render();
  });

  render();

  /* The gate calls this before tearing the DOM down, so the snapshot
   * listener never fires into a removed tree and a lock and unlock cannot
   * stack two of everything. */
  window.__STUDIO_TEARDOWN = function () {
    if (unsub) unsub();
    unsub = null;
    clearTimeout(searchT);
  };
})();
