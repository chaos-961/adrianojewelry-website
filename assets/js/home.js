/* Adriano Jewelry — landing page motion.
 *
 * One file, no libraries. Everything scroll-driven runs off a single cached
 * geometry pass and a single requestAnimationFrame writer, so the page never
 * reads layout in the same breath as it writes style. What this drives:
 *
 *   - the --p progress property on each scrub scene (the hero, the two
 *     rings interlocking, the craft build, the daylight curtain, sheet 06)
 *   - the small parallax drift on gallery photographs (--drift)
 *   - .in on reveals and act seams, via IntersectionObserver
 *   - .lit on photographs crossing the middle of the viewport (colour)
 *   - the craft deck: which stage card (and which drafting-board sheet) is
 *     current, at fifths of the build scene's own --p — the same fifths
 *     film.js plays the model to, so the words and the work agree
 *   - the top bar: docked state and ground (dark / light)
 *
 * THE MID-PAGE RELOAD RULE. A reveal that never fires because its section is
 * already above the fold would leave hidden content behind the reader's
 * back. So the first pass marks everything already scrolled past as .in
 * .no-anim (final state, no transition), and only elements still to come get
 * the animated entrance. The same is true of every scrub scene: progress is
 * computed from absolute offsets on the first frame, so loading halfway down
 * the page lands every scene at exactly the state that scroll position
 * deserves.
 *
 * Reduced motion: the inline <head> script withholds html.motion, which
 * strips every hidden state and every scrub transform in home.css. This file
 * still runs the parts that are function rather than motion — the top bar's
 * docking and ground tracking — because a reader who asked for less
 * animation still deserves working chrome. The craft deck needs no such
 * care: without motion it is an ordinary list, complete on arrival. */

(function () {
  "use strict";

  var doc = document.documentElement;
  var motion = doc.classList.contains("motion");
  var reduceQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  var main = document.querySelector("main.home");
  if (!main) return;

  /* If anything below throws, the page must not be left with content parked
     in a hidden "before" state — lifting .motion resolves every one of them
     to the finished page. The same guard the old landing kept for a GSAP
     that never arrived, kept here for a script that dies. */
  try {
    run();
  } catch (err) {
    doc.classList.remove("motion");
    if (window.console && console.error) console.error(err);
    return;
  }

  function run() {

  /* --- geometry ------------------------------------------------------- */

  var vh = window.innerHeight;

  /* Document offset via the offsetParent chain: unlike getBoundingClientRect
     this is unaffected by the transforms this very file applies. */
  function docTop(el) {
    var y = 0;
    while (el) {
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return y;
  }

  /* --- registries ------------------------------------------------------ */

  var scenes = []; // {el, top, span} -> writes --p
  var drifts = []; // {el, top, h, speed} -> writes --drift
  var grounds = []; // {el, top, h, dark}

  var bar = document.querySelector(".page-top--home");
  var hero = document.querySelector(".film-hero");
  var ringsScene = document.querySelector(".vow-rings");
  var buildScene = document.querySelector('[data-scene="build"]');
  var buildCards = buildScene
    ? Array.prototype.slice.call(buildScene.querySelectorAll(".bstage"))
    : [];
  var buildPlates = buildScene
    ? Array.prototype.slice.call(
        buildScene.querySelectorAll(".craft-build__plate")
      )
    : [];

  document.querySelectorAll("[data-scene]").forEach(function (el) {
    scenes.push({ el: el, top: 0, span: 1, p: -1 });
  });

  if (motion) {
    document.querySelectorAll("[data-drift]").forEach(function (el) {
      drifts.push({
        el: el,
        top: 0,
        h: 0,
        speed: parseFloat(el.getAttribute("data-drift")) || 0,
        v: null,
      });
    });
  }

  document.querySelectorAll("[data-ground]").forEach(function (el) {
    grounds.push({
      el: el,
      top: 0,
      h: 0,
      dark: el.getAttribute("data-ground") === "dark",
    });
  });

  function measure() {
    vh = window.innerHeight;
    scenes.forEach(function (s) {
      if (s.el === hero) {
        /* The hero starts at the top and plays out over most of its own
           height rather than any overflow. */
        s.top = 0;
        s.span = Math.max(1, s.el.offsetHeight * 0.9);
      } else {
        s.top = docTop(s.el);
        s.span = Math.max(1, s.el.offsetHeight - vh);
      }
    });
    drifts.forEach(function (d) {
      d.top = docTop(d.el);
      d.h = d.el.offsetHeight;
    });
    grounds.forEach(function (g) {
      g.top = docTop(g.el);
      g.h = g.el.offsetHeight;
    });
  }

  /* --- the single writer ----------------------------------------------- */

  var ticking = false;
  var barState = { docked: null, dark: null };
  var mainDark = null;
  var currentCard = -1;
  var ringsSet = null;

  function clamp01(n) {
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  /* The craft deck: the current stage is the current fifth of the build
     scene's progress — the SAME arithmetic film.js plays the model to, so
     the card on top always names the thing on the board. */
  function deal(p) {
    var idx = Math.min(4, Math.floor(p * 5));
    if (idx === currentCard) return;
    currentCard = idx;
    buildCards.forEach(function (c, k) {
      c.classList.toggle("is-current", k === idx);
    });
    buildPlates.forEach(function (pl, k) {
      pl.classList.toggle("is-current", k === idx);
    });
  }

  function frame() {
    ticking = false;
    var y = window.pageYOffset;

    if (motion) {
      scenes.forEach(function (s) {
        var p = clamp01((y - s.top) / s.span);
        if (Math.abs(p - s.p) > 0.0008) {
          s.p = p;
          s.el.style.setProperty("--p", p.toFixed(4));
        }
        if (s.el === ringsScene) {
          var set = p > 0.72;
          if (set !== ringsSet) {
            ringsSet = set;
            ringsScene.classList.toggle("is-set", set);
          }
        }
        if (s.el === buildScene) deal(p);
      });

      var centre = y + vh / 2;
      drifts.forEach(function (d) {
        var rel = (centre - (d.top + d.h / 2)) / vh;
        var v = Math.max(-52, Math.min(52, rel * d.speed));
        v = Math.round(v * 10) / 10;
        if (v !== d.v) {
          d.v = v;
          d.el.style.setProperty("--drift", v + "px");
        }
      });
    }

    /* Ground under the bar, and under the viewport's midline. */
    var barPoint = y + 34;
    var barDark = groundAt(barPoint);
    var midIsDark = groundAt(y + vh / 2);

    /* The film grain reads the midline: it lies over the dark chapter and
       is lifted from the paper. On <main>, so the CSS can gate any
       ground-aware dressing off one class. */
    if (midIsDark !== mainDark) {
      mainDark = midIsDark;
      main.classList.toggle("is-dark-view", midIsDark);
    }

    if (bar) {
      var docked = hero ? y > hero.offsetHeight * 0.85 : y > vh * 0.85;
      if (docked !== barState.docked) {
        barState.docked = docked;
        bar.classList.toggle("is-docked", docked);
      }
      if (barDark !== barState.dark) {
        barState.dark = barDark;
        bar.classList.toggle("on-dark", barDark);
        bar.classList.toggle("on-light", !barDark);
      }
    }
  }

  function groundAt(point) {
    var dark = false;
    for (var i = 0; i < grounds.length; i++) {
      var g = grounds[i];
      if (point >= g.top && point < g.top + g.h) dark = g.dark;
    }
    return dark;
  }

  function requestTick() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(frame);
    }
  }

  /* --- reveals ---------------------------------------------------------- */

  function initReveals() {
    var els = Array.prototype.slice.call(
      document.querySelectorAll(
        ".reveal, .lines, .act-seam, .film-hero__title.split"
      )
    );
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("in", "no-anim");
      });
      return;
    }

    /* Anything the reader has already scrolled past snaps to its final
       state — the whole point of this file's reload rule. */
    els = els.filter(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0) {
        el.classList.add("no-anim", "in");
        return false;
      }
      return true;
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    els.forEach(function (el) {
      io.observe(el);
    });
  }

  /* Photographs take their colour as they cross the middle of the screen.
     Ones already above it at load are lit at once. */
  function initLit() {
    if (!motion) return;
    var items = Array.prototype.slice.call(document.querySelectorAll(".g-item"));
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("lit");
      });
      return;
    }
    items = items.filter(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < vh * 0.62) {
        el.classList.add("lit");
        return false;
      }
      return true;
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("lit");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -38% 0px", threshold: 0.2 }
    );
    items.forEach(function (el) {
      io.observe(el);
    });
  }

  /* --- hero title ------------------------------------------------------- */

  function splitTitle() {
    var title = document.querySelector('[data-split="chars"]');
    if (!title || !motion) return;
    var text = title.textContent;
    title.textContent = "";
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement("span");
      span.className = "ch";
      span.style.setProperty("--i", i);
      span.textContent = text[i];
      title.appendChild(span);
    }
    title.classList.add("split");
    /* Let the webfont land before the letters rise, so they do not swap
       faces mid-flight; 400ms is the cap, not the wait. */
    var started = false;
    function start() {
      if (started) return;
      started = true;
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          title.classList.add("in");
        });
      });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start);
    }
    window.setTimeout(start, 400);
  }

  /* --- wiring ----------------------------------------------------------- */

  if (bar) bar.classList.add("enhanced");

  var measureQueued = null;
  function scheduleMeasure() {
    if (measureQueued) window.clearTimeout(measureQueued);
    measureQueued = window.setTimeout(function () {
      measureQueued = null;
      measure();
      requestTick();
    }, 120);
  }

  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", scheduleMeasure);
  window.addEventListener("orientationchange", scheduleMeasure);
  window.addEventListener("load", scheduleMeasure);
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) scheduleMeasure();
  });

  /* Every photograph that has not finished decoding re-measures the page
     when it does — heights below it move by its full height. */
  Array.prototype.slice
    .call(document.images)
    .forEach(function (img) {
      if (!img.complete) {
        img.addEventListener("load", scheduleMeasure, { once: true });
        img.addEventListener("error", scheduleMeasure, { once: true });
      }
    });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleMeasure);
  }

  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(scheduleMeasure);
    ro.observe(document.body);
  }

  /* If the reader flips reduced motion on mid-visit, reload the page into
     the static presentation rather than trying to unwind live state. */
  if (reduceQuery && reduceQuery.addEventListener) {
    reduceQuery.addEventListener("change", function () {
      window.location.reload();
    });
  }

    measure();
    splitTitle();
    initReveals();
    initLit();
    frame();

    /* Anchor glide is unlocked only after load settles: the browser's own
       arrival scroll — a #fragment deep link, a restored reload — must be a
       cut, and Chrome can perform it as late as the load event. */
    function unlockSmooth() {
      window.setTimeout(function () {
        doc.classList.add("smooth");
      }, 80);
    }
    if (document.readyState === "complete") unlockSmooth();
    else window.addEventListener("load", unlockSmooth, { once: true });
  }
})();
