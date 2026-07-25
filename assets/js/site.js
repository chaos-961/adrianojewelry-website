/* ==========================================================================
   site.js — shell behaviour. Progressive enhancement only: every page must
   remain readable and navigable with this file blocked.

   Loaded with `defer`, so the DOM is parsed by the time this runs.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     Version. AUTO-MANAGED — do not hand-edit the string below.
     `node scripts/version.js bump` rewrites it here and in every .html file.
     ---------------------------------------------------------------------- */
  var SITE_VERSION = "0.0.3";

  var DESKTOP_QUERY = "(min-width: 62em)";

  var root = document.documentElement;

  /* ---- Version + copyright year ---------------------------------------- */

  function stampMetadata() {
    var versionTargets = document.querySelectorAll("[data-site-version]");
    for (var i = 0; i < versionTargets.length; i++) {
      versionTargets[i].textContent = "v" + SITE_VERSION;
    }

    var year = String(new Date().getFullYear());
    var yearTargets = document.querySelectorAll("[data-current-year]");
    for (var j = 0; j < yearTargets.length; j++) {
      yearTargets[j].textContent = year;
    }
  }

  /* ---- Header shadow on scroll ------------------------------------------ */

  function initHeaderState() {
    var header = document.querySelector("[data-site-header]");
    if (!header) return;

    var ticking = false;

    function apply() {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- Mobile navigation drawer ----------------------------------------- */

  function initNav() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var nav = document.querySelector("[data-nav]");
    if (!toggle || !nav) return;

    var desktop = window.matchMedia(DESKTOP_QUERY);

    /* State is read from the DOM rather than held in a variable, so the
       attribute, the button's aria-expanded and the CSS can never disagree. */
    function isOpen() {
      return root.hasAttribute("data-nav-open");
    }

    function open() {
      if (isOpen()) return;
      root.setAttribute("data-nav-open", "");
      toggle.setAttribute("aria-expanded", "true");
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      root.removeAttribute("data-nav-open");
      toggle.setAttribute("aria-expanded", "false");
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener("click", function () {
      if (isOpen()) {
        close(false);
      } else {
        open();
      }
    });

    /* Escape closes and hands focus back to the button. */
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen()) close(true);
    });

    /* Following a link inside the drawer should dismiss it. */
    nav.addEventListener("click", function (event) {
      var link = event.target.closest ? event.target.closest("a[href]") : null;
      if (link && nav.contains(link)) close(false);
    });

    /* Tapping the page behind the drawer closes it. */
    document.addEventListener("pointerdown", function (event) {
      if (!isOpen()) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      close(false);
    });

    /* Crossing into the desktop layout must not leave the page scroll-locked
       or the button reporting a stale expanded state. */
    function onBreakpoint(event) {
      if (event.matches) close(false);
    }

    if (typeof desktop.addEventListener === "function") {
      desktop.addEventListener("change", onBreakpoint);
    } else if (typeof desktop.addListener === "function") {
      /* Safari < 14 */
      desktop.addListener(onBreakpoint);
    }
  }

  /* ---- Current page indicator -------------------------------------------
     Marks the nav link matching the current URL. Comparing normalised
     pathnames keeps this correct under a GitHub Pages project sub-path.
     ---------------------------------------------------------------------- */

  function initActiveLink() {
    var links = document.querySelectorAll("[data-nav] a[href]");
    if (!links.length) return;

    function normalise(pathname) {
      var path = pathname.replace(/\/index\.html$/, "/");
      if (path.length > 1) path = path.replace(/\/+$/, "");
      return path.toLowerCase();
    }

    var here = normalise(window.location.pathname);

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.hasAttribute("aria-current")) continue;
      if (/^(https?:|mailto:|tel:|#)/i.test(link.getAttribute("href"))) continue;
      if (normalise(link.pathname) === here) {
        link.setAttribute("aria-current", "page");
      }
    }
  }

  /* ---- Boot -------------------------------------------------------------- */

  stampMetadata();
  initHeaderState();
  initNav();
  initActiveLink();
})();
