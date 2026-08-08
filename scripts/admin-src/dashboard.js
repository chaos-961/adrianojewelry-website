/* The Studio dashboard, the plaintext code. Injected by the gate as an
 * inline script after decryption; it runs against window.__STUDIO_CTX and
 * nothing else, so its whole authority is the few verbs the gate built
 * over the signed-in admin session.
 *
 * EVERY FIELD A VISITOR TYPED IS RENDERED THROUGH textContent, never
 * through markup. The list is user-supplied strings shown inside the one
 * signed-in session on the site; innerHTML here would hand any visitor a
 * script slot in the admin's browser, which is the exact bug this comment
 * exists to keep out.
 *
 * The shape: one source of truth (state.items, fed live by ctx.watch),
 * two views over it. The DIARY is a month calendar carrying counts and a
 * day panel hanging every request on the store's own half-hour grid, 9:00
 * to the 4:00 visit that ends at closing; the REQUESTS list is the same
 * data as a worked queue with status views, search and sort. Everything
 * repaints from scratch on every change, because a few hundred DOM nodes
 * are cheaper than a reconciler and can never drift from the data. */
(function () {
  "use strict";

  var ctx = window.__STUDIO_CTX;
  if (!ctx) return;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var conn = $("st-conn");
  var banner = $("st-banner");
  var bannerTitle = $("st-banner-title");
  var bannerCopy = $("st-banner-copy");
  var nToday = $("st-n-today");
  var nWeek = $("st-n-week");
  var nNew = $("st-n-new");
  var modeSeg = $("st-mode");
  var modeNew = $("st-mode-new");
  var viewDiary = $("st-view-diary");
  var viewList = $("st-view-list");
  var calTitle = $("st-cal-title");
  var calGrid = $("st-cal-grid");
  var dayTitle = $("st-day-title");
  var daySub = $("st-day-sub");
  var daySlots = $("st-day-slots");
  var dayPanel = daySlots ? daySlots.closest(".studio-day") : null;
  var views = $("st-views");
  var search = $("st-search");
  var sortSel = $("st-sort");
  var listEl = $("st-list");
  var emptyEl = $("st-empty");
  var toastEl = $("st-toast");

  /* The diary's grid, identical to the enum firestore.rules accepts and the
   * booking form offers: half-hour visits inside 9:00 am to 4:30 pm. */
  var TIMES = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
    "15:00", "15:30", "16:00",
  ];
  var SERVICE_TEXT = {
    wedding: "Wedding Ring",
    custom: "Custom design",
    repair: "A repair",
    restoration: "A restoration",
    consultation: "A consultation",
    other: "Something else",
  };
  var STATUS_TEXT = { new: "New", confirmed: "Confirmed", done: "Completed", cancelled: "Cancelled" };

  var pad2 = function (n) {
    return String(n).length < 2 ? "0" + n : String(n);
  };
  var isoOf = function (d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  };
  var todayIso = function () {
    return isoOf(new Date());
  };
  var looksDay = function (dv) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dv);
  };
  var looksTime = function (t) {
    return /^\d\d:\d\d$/.test(t);
  };
  var timeLabel = function (t) {
    if (!looksTime(t)) return "Any time";
    var h = Number(t.slice(0, 2));
    var mer = h < 12 ? "am" : "pm";
    return (h % 12 || 12) + ":" + t.slice(3) + " " + mer;
  };
  var dayText = function (dv) {
    if (!looksDay(dv)) return dv || "No day given";
    return new Date(dv + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  var dayShort = function (dv) {
    if (!looksDay(dv)) return dv || "no day";
    return new Date(dv + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };
  var agoText = function (ms) {
    if (!ms) return "just now";
    var s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + "s ago";
    var m = Math.round(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + "h ago";
    return Math.round(h / 24) + "d ago";
  };

  var boot = new Date();
  var state = {
    items: [],
    error: null,
    mode: "diary",
    view: "new",
    q: "",
    sort: "newest",
    cal: { y: boot.getFullYear(), m: boot.getMonth() },
    sel: todayIso(),
    dir: 0,
  };
  var unsub = null;
  var searchT = 0;
  var agoT = 0;

  /* ------------------------------------------------------------ helpers */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function itemsOn(dv) {
    return state.items.filter(function (it) {
      return it.date === dv;
    });
  }

  /* date -> { total, fresh }, cancelled requests carrying no weight: a
   * cancelled visit is history, not a claim on the day. */
  function byDate() {
    var map = {};
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (!looksDay(it.date) || it.status === "cancelled") continue;
      var d = map[it.date] || (map[it.date] = { total: 0, fresh: 0 });
      d.total += 1;
      if (it.status === "new") d.fresh += 1;
    }
    return map;
  }

  var toastT1 = 0;
  var toastT2 = 0;
  function toast(msg) {
    if (!toastEl) return;
    clearTimeout(toastT1);
    clearTimeout(toastT2);
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.remove("is-on");
    void toastEl.offsetWidth;
    toastEl.classList.add("is-on");
    toastT1 = window.setTimeout(function () {
      toastEl.classList.remove("is-on");
      toastT2 = window.setTimeout(function () {
        toastEl.hidden = true;
      }, 350);
    }, 3800);
  }

  function move(it, status, btn) {
    if (btn) btn.disabled = true;
    ctx.setStatus(it.id, status).catch(function () {
      if (btn) btn.disabled = false;
      toast("Firestore refused the change. Check the connection and the rules.");
    });
  }

  function actionBtn(label, kind, fn) {
    var b = el(
      "button",
      "appt-btn" +
        (kind === "primary" ? " appt-btn--primary" : "") +
        (kind === "danger" ? " appt-btn--danger" : ""),
      label
    );
    b.type = "button";
    if (fn) b.addEventListener("click", fn);
    return b;
  }

  /* Delete asks twice on the same button rather than through window.confirm:
   * the first press arms it for a breath, the second one means it. */
  function deleteBtn(it) {
    var b = actionBtn("Delete", "danger", null);
    var t = 0;
    b.addEventListener("click", function () {
      if (!b.classList.contains("is-armed")) {
        b.classList.add("is-armed");
        b.textContent = "Sure?";
        t = window.setTimeout(function () {
          b.classList.remove("is-armed");
          b.textContent = "Delete";
        }, 2600);
        return;
      }
      clearTimeout(t);
      b.disabled = true;
      ctx.remove(it.id).catch(function () {
        b.disabled = false;
        b.classList.remove("is-armed");
        b.textContent = "Delete";
        toast("Firestore refused the delete. Check the connection and the rules.");
      });
    });
    return b;
  }

  function statusActions(it) {
    var actions = el("div", "appt__actions");
    if (it.status === "new") {
      actions.appendChild(
        actionBtn("Confirm", "primary", function (e) {
          move(it, "confirmed", e.currentTarget);
        })
      );
      actions.appendChild(
        actionBtn("Cancel", "", function (e) {
          move(it, "cancelled", e.currentTarget);
        })
      );
    } else if (it.status === "confirmed") {
      actions.appendChild(
        actionBtn("Mark completed", "primary", function (e) {
          move(it, "done", e.currentTarget);
        })
      );
      actions.appendChild(
        actionBtn("Cancel", "", function (e) {
          move(it, "cancelled", e.currentTarget);
        })
      );
    } else {
      actions.appendChild(
        actionBtn("Reopen", "", function (e) {
          move(it, "new", e.currentTarget);
        })
      );
    }
    actions.appendChild(deleteBtn(it));
    return actions;
  }

  /* One card, both views. compact is the diary's cut: the slot row already
   * names the day and the time, so the card carries the person. */
  function card(it, compact, idx) {
    var root = el("article", "appt" + (compact ? " appt--slot" : ""));
    root.style.setProperty("--i", String(Math.min(idx || 0, 8)));
    if (it.status === "cancelled") root.classList.add("is-cancelled");

    var head = el("div", "appt__head");
    head.appendChild(el("h2", "appt__name", it.name || "No name"));
    var badge = el("span", "appt__badge", STATUS_TEXT[it.status] || it.status);
    badge.dataset.s = it.status;
    head.appendChild(badge);
    root.appendChild(head);

    var when = el("p", "appt__when");
    if (compact) {
      when.appendChild(document.createTextNode(SERVICE_TEXT[it.service] || it.service));
    } else {
      when.appendChild(
        document.createTextNode(dayShort(it.date) + " at " + timeLabel(it.slot) + " ")
      );
      when.appendChild(el("span", "appt__service", "\u00b7 " + (SERVICE_TEXT[it.service] || it.service)));
    }
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

    var actions = statusActions(it);
    if (!compact && looksDay(it.date)) {
      actions.appendChild(
        actionBtn("See the day", "", function () {
          openDay(it.date);
        })
      );
    }
    root.appendChild(actions);

    return root;
  }

  function openDay(dv) {
    state.sel = dv;
    var d = new Date(dv + "T12:00:00");
    state.cal = { y: d.getFullYear(), m: d.getMonth() };
    state.mode = "diary";
    renderAll();
    if (dayPanel && window.matchMedia("(max-width: 47.99em)").matches) {
      dayPanel.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }

  /* ------------------------------------------------------------ renders */

  function renderConn() {
    if (ctx.connected) {
      conn.textContent = "Live, signed in as " + ctx.email;
      conn.classList.add("is-live");
    } else {
      conn.textContent = "Not connected";
      conn.classList.remove("is-live");
    }
    var t = "";
    var c = "";
    if (state.error) {
      t = "Firestore refused the read.";
      c =
        "Deploy firestore.rules and confirm the signed-in account is the admin. " +
        "The console's own error: " + state.error;
    } else if (!ctx.connected) {
      if (ctx.issue === "auth") {
        t = "The diary is locked out of Firebase.";
        c =
          "The studio password opened the vault, but Firebase refused the sign-in, " +
          "so nothing can be read or changed yet. Create the " + ctx.email + " account " +
          "in Firebase Authentication with this same password (scripts/firebase-setup.md, " +
          "step 3), then sign out here and unlock again.";
      } else if (ctx.issue === "network") {
        t = "Firebase is unreachable.";
        c = "The studio opened offline. Check the connection, then sign out and unlock again.";
      } else if (ctx.issue === "unconfigured") {
        t = "The Studio is in preview.";
        c =
          "Paste the Firebase web config into assets/js/firebase-config.js and deploy; " +
          "scripts/firebase-setup.md walks through the whole switch-on.";
      } else if (ctx.issue) {
        t = "Firebase sign-in failed.";
        c = "Sign out and unlock again. If this keeps happening, the browser console has the detail.";
      }
    }
    banner.hidden = !t;
    bannerTitle.textContent = t;
    bannerCopy.textContent = c;
  }

  function tickTo(node, v) {
    var s = String(v);
    if (node.textContent === s) return;
    node.textContent = s;
    node.classList.remove("is-tick");
    void node.offsetWidth;
    node.classList.add("is-tick");
  }

  function renderStats() {
    var t = todayIso();
    var week = {};
    for (var i = 0; i < 7; i++) {
      var d = new Date();
      d.setDate(d.getDate() + i);
      week[isoOf(d)] = true;
    }
    var cToday = 0;
    var cWeek = 0;
    var cNew = 0;
    for (var j = 0; j < state.items.length; j++) {
      var it = state.items[j];
      if (it.status === "new") cNew += 1;
      if (it.status === "cancelled") continue;
      if (it.date === t) cToday += 1;
      if (week[it.date]) cWeek += 1;
    }
    tickTo(nToday, cToday);
    tickTo(nWeek, cWeek);
    tickTo(nNew, cNew);
    modeNew.textContent = String(cNew);
  }

  function renderMode() {
    var btns = modeSeg.querySelectorAll("[data-mode]");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].dataset.mode === state.mode;
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-selected", String(on));
    }
    viewDiary.hidden = state.mode !== "diary";
    viewList.hidden = state.mode !== "list";
  }

  function renderCal() {
    var y = state.cal.y;
    var m = state.cal.m;
    calTitle.textContent = new Date(y, m, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    var startDow = new Date(y, m, 1).getDay();
    var map = byDate();
    var t = todayIso();
    calGrid.replaceChildren();
    /* Six rows always, so the diary never changes height under the hand. */
    for (var i = 0; i < 42; i++) {
      var d = new Date(y, m, 1 - startDow + i);
      var dv = isoOf(d);
      var info = map[dv];
      var cell = el("button", "studio-cal__cell");
      cell.type = "button";
      cell.dataset.date = dv;
      if (d.getMonth() !== m) cell.classList.add("is-out");
      if (dv === t) cell.classList.add("is-today");
      if (dv === state.sel) cell.classList.add("is-sel");
      cell.appendChild(el("span", "studio-cal__num", String(d.getDate())));
      var label = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      if (info) {
        cell.classList.add(info.fresh ? "has-new" : "has-some");
        cell.appendChild(el("span", "studio-cal__chip", String(info.total)));
        label +=
          ", " + info.total + (info.total === 1 ? " request" : " requests") +
          (info.fresh ? ", " + info.fresh + " new" : "");
      }
      cell.setAttribute("aria-label", label);
      cell.setAttribute("aria-pressed", String(dv === state.sel));
      calGrid.appendChild(cell);
    }
    if (state.dir) {
      calGrid.dataset.dir = state.dir > 0 ? "next" : "prev";
      calGrid.classList.remove("is-turn");
      void calGrid.offsetWidth;
      calGrid.classList.add("is-turn");
      state.dir = 0;
    }
  }

  function slotRow(label, cards, fresh) {
    var row = el("div", "studio-slot" + (cards.length ? " has-items" : " is-free"));
    if (fresh) row.classList.add("has-new");
    row.appendChild(el("span", "studio-slot__time", label));
    var body = el("div", "studio-slot__body");
    if (!cards.length) {
      body.appendChild(el("span", "studio-slot__free", "Free"));
    } else {
      for (var i = 0; i < cards.length; i++) body.appendChild(cards[i]);
    }
    row.appendChild(body);
    return row;
  }

  function renderDay() {
    var dv = state.sel;
    dayTitle.textContent = dayText(dv);
    var list = itemsOn(dv);
    var active = list.filter(function (it) {
      return it.status !== "cancelled";
    });
    var fresh = active.filter(function (it) {
      return it.status === "new";
    }).length;

    if (!ctx.connected) {
      daySub.textContent = "The diary fills in once the connection is live.";
    } else if (!active.length) {
      daySub.textContent = "Nothing booked. The day is free.";
    } else {
      daySub.textContent =
        active.length + (active.length === 1 ? " visit" : " visits") +
        (fresh ? ", " + fresh + " awaiting a call" : "");
    }

    daySlots.replaceChildren();
    var idx = 0;
    for (var i = 0; i < TIMES.length; i++) {
      var tv = TIMES[i];
      var matches = [];
      var freshHere = false;
      for (var j = 0; j < list.length; j++) {
        if (list[j].slot === tv) {
          matches.push(card(list[j], true, idx++));
          if (list[j].status === "new") freshHere = true;
        }
      }
      daySlots.appendChild(slotRow(timeLabel(tv), matches, freshHere));
    }
    /* Whatever does not fit the grid (older test data, an "any" from the
     * first cut of the form) still deserves a hook to hang from. */
    var loose = [];
    var looseFresh = false;
    for (var k = 0; k < list.length; k++) {
      if (TIMES.indexOf(list[k].slot) === -1) {
        loose.push(card(list[k], true, idx++));
        if (list[k].status === "new") looseFresh = true;
      }
    }
    if (loose.length) daySlots.appendChild(slotRow("Any time", loose, looseFresh));
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
      if (state.sort === "day") {
        var ka = a.date + " " + a.slot;
        var kb = b.date + " " + b.slot;
        return ka < kb ? -1 : ka > kb ? 1 : a.createdAt - b.createdAt;
      }
      return b.createdAt - a.createdAt;
    });
    return out;
  }

  function renderList() {
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
    for (var i = 0; i < list.length; i++) listEl.appendChild(card(list[i], false, i));

    var empty = "";
    if (!ctx.connected) {
      empty = "The list fills in once the connection is live. The banner above says what is left to switch on.";
    } else if (!list.length) {
      empty = state.q
        ? "Nothing matches that search in this view."
        : "Nothing in this view yet. New requests appear here the moment a visitor sends the booking form.";
    }
    emptyEl.hidden = !empty;
    emptyEl.textContent = empty;
  }

  function renderAll() {
    renderConn();
    renderStats();
    renderMode();
    renderCal();
    renderDay();
    renderList();
  }

  /* ------------------------------------------------------------- wiring */

  modeSeg.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode]");
    if (!b || b.dataset.mode === state.mode) return;
    state.mode = b.dataset.mode;
    renderMode();
  });

  calGrid.addEventListener("click", function (e) {
    var cell = e.target.closest(".studio-cal__cell");
    if (!cell) return;
    state.sel = cell.dataset.date;
    renderCal();
    renderDay();
  });

  $("st-cal-prev").addEventListener("click", function () {
    state.cal.m -= 1;
    if (state.cal.m < 0) {
      state.cal.m = 11;
      state.cal.y -= 1;
    }
    state.dir = -1;
    renderCal();
  });

  $("st-cal-next").addEventListener("click", function () {
    state.cal.m += 1;
    if (state.cal.m > 11) {
      state.cal.m = 0;
      state.cal.y += 1;
    }
    state.dir = 1;
    renderCal();
  });

  $("st-cal-today").addEventListener("click", function () {
    openDay(todayIso());
  });

  views.addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]");
    if (!b) return;
    state.view = b.dataset.view;
    renderList();
  });

  search.addEventListener("input", function () {
    clearTimeout(searchT);
    searchT = setTimeout(function () {
      state.q = search.value.trim();
      renderList();
    }, 120);
  });

  sortSel.addEventListener("change", function () {
    state.sort = sortSel.value;
    renderList();
  });

  $("st-lock").addEventListener("click", function () {
    ctx.lock();
  });

  unsub = ctx.watch(function (list, err) {
    if (err) {
      state.error = String(err.code || err.message || err);
    } else {
      state.error = null;
      state.items = list || [];
    }
    renderAll();
  });

  renderAll();

  /* "Requested 4m ago" ages even when nothing else changes. */
  agoT = window.setInterval(function () {
    if (state.items.length) {
      renderDay();
      renderList();
    }
  }, 60000);

  /* The gate calls this before tearing the DOM down, so the snapshot
   * listener never fires into a removed tree and a lock and unlock cannot
   * stack two of everything. */
  window.__STUDIO_TEARDOWN = function () {
    if (unsub) unsub();
    unsub = null;
    clearTimeout(searchT);
    clearInterval(agoT);
  };
})();
