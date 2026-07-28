/* Adriano Jewelry — landing page motion.
 *
 * Loaded only by index.html, after gsap, ScrollTrigger and lenis, all with
 * `defer`, so by the time this runs the DOM is parsed and the three globals are
 * either present or provably absent.
 *
 * THE CONTRACT THIS FILE EXISTS TO KEEP
 *
 * 1. Reduced motion means OFF, not FASTER. Under
 *    `prefers-reduced-motion: reduce` this file never constructs Lenis, never
 *    registers a ScrollTrigger and never starts a tween. It paints every
 *    element in its final state and stops. That is a different code path, not a
 *    shorter duration.
 *
 * 2. Nothing is ever left hidden. The "before" states in home.css live under a
 *    `.motion` class that only exists when animation is both possible and
 *    permitted. If GSAP fails to arrive — blocked, offline, a bad deploy — the
 *    first thing this file does is remove that class, so the page falls back to
 *    a complete static document rather than a blank one. Same outcome with
 *    JavaScript switched off entirely, where the class is never added.
 *
 * 3. Nothing animates on a timer. Every tween here is triggered by page load
 *    (once), by scroll position, or by the user's own pointer.
 *
 * 4. Only transform and opacity are animated, so every frame is a composite.
 *    `will-change` is set immediately before a tween and cleared the moment it
 *    finishes — left on permanently it forces a layer per element and costs
 *    more memory than it saves time.
 *
 * The process section does NOT use ScrollTrigger's pin. It uses native
 * `position: sticky` and ScrollTrigger only decides which drawing is showing.
 * A pin injects a spacer element and re-measures on every resize; sticky is one
 * CSS line, cannot shift the layout, and keeps working if this file never runs.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---- Things that are not motion, and run unconditionally ------------- */

  /* The upload is the most important control on the page, so it must confirm
     that it caught the file. Without this the label looks identical before and
     after choosing, and people re-pick the same photo twice. */
  (function upload() {
    var input = document.getElementById("f-photo");
    var out = document.querySelector("[data-upload-name]");
    if (!input || !out) return;
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      out.textContent = f ? f.name : "";
    });
  })();

  /* Anchor links are handled here rather than with `scroll-behavior: smooth`,
     because Lenis owns the scroll position once it exists and the two fight.
     When Lenis is not running this falls through to the browser's own instant
     jump, which is the correct behaviour under reduced motion. */
  function initAnchors(lenis) {
    var links = document.querySelectorAll('a[href^="#"]');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function (e) {
        var id = this.getAttribute("href");
        if (!id || id === "#") return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { offset: 0 });
        else target.scrollIntoView();
        /* Move focus as well as the viewport, or a keyboard user's next Tab
           carries on from the link they just pressed rather than from where the
           page now is. */
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
    }
  }

  /* ---- Bail-outs -------------------------------------------------------- */

  /* GSAP absent: strip the class that hides things, wire the anchors natively,
     and leave. The page is complete without us. */
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove("motion");
    initAnchors(null);
    return;
  }

  var gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);

  var lenis = null;

  /* ---- Lenis ------------------------------------------------------------
     Smoothing only — never scroll-jacking. `lerp` is the whole difference: at
     0.08 the page trails the wheel by a few frames and settles, which reads as
     weight. Push it lower and the user is dragging the page through treacle,
     fighting an input they expect to be direct. Nothing here overrides scroll
     velocity, hijacks a wheel event into a section jump, or traps the keyboard:
     Page Down, Home, End, Space and Tab all behave exactly as they would on a
     page with no script at all. */
  function startLenis() {
    if (lenis || !window.Lenis) return;
    lenis = new window.Lenis({ lerp: 0.08, wheelMultiplier: 1, touchMultiplier: 1 });

    /* Lenis moves the page on its own rAF, so ScrollTrigger has to be told the
       scroll position changed; without this every trigger fires late or not at
       all. Driving Lenis from GSAP's ticker rather than its own rAF keeps both
       on one clock, which is what stops the scrub jittering. */
    lenis.on("scroll", window.ScrollTrigger.update);

    /* And again on the native event, which is not redundant. Lenis only emits
       its own `scroll` for movement it drives; anything that sets the scroll
       position out from under it — an in-page anchor, the browser restoring a
       position on reload, find-in-page walking down the document, a keyboard
       Home/End — moves the page without Lenis noticing. ScrollTrigger then
       keeps evaluating against a stale position and every trigger below freezes
       at whatever state it last saw. That is exactly the failure that left the
       process drawings stuck on stage 02 while the text carried on. Cheap to
       subscribe, passive, and it makes the two sources of truth agree. */
    window.addEventListener("scroll", window.ScrollTrigger.update, {
      passive: true,
    });

    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  function stopLenis() {
    if (!lenis) return;
    lenis.destroy();
    lenis = null;
  }

  /* ---- will-change helper ---------------------------------------------- */

  function hint(targets) {
    gsap.set(targets, { willChange: "transform, opacity" });
  }
  function unhint(targets) {
    gsap.set(targets, { willChange: "auto" });
  }

  /* ---- The build --------------------------------------------------------
     gsap.matchMedia is doing real work here, not decoration. It scopes every
     tween and trigger created inside it to a set of media conditions and
     reverts all of them — transforms cleared, triggers killed — the moment
     those conditions stop matching. That is what makes a mid-session switch of
     the OS "reduce motion" setting safe: the whole animation layer unwinds and
     the elements return to the state the CSS gives them, with no reload and
     nothing left half-tweened. */
  var mm = gsap.matchMedia();

  mm.add(
    {
      motion: "(prefers-reduced-motion: no-preference)",
      desktop: "(min-width: 64em)",
    },
    function (context) {
      var motion = context.conditions.motion;
      var desktop = context.conditions.desktop;

      if (!motion) {
        /* Reduced motion. No Lenis, no triggers, no tweens — just make sure
           anything the CSS was holding back is visible, and stop. */
        stopLenis();
        root.classList.remove("motion");
        gsap.set(".reveal, .line > span", { clearProps: "all" });
        return;
      }

      startLenis();

      /* --- Hero, on load. One orchestrated sequence, not scattered fades.
             Positions are absolute rather than relative so the total is
             legible: the last element starts at 0.54s and runs 0.8s, so the
             whole thing is done at 1.34s — inside the 1.6s ceiling. */
      var heroBits = ".hero__eyebrow, .hero__sub, .hero .btn-row";
      var heroLines = ".hero__title .line > span";
      hint(heroBits + ", " + heroLines);

      var intro = gsap.timeline({
        defaults: { duration: 0.8, ease: "expo.out" },
        onComplete: function () {
          unhint(heroBits + ", " + heroLines);
        },
      });

      intro
        .to(".hero__eyebrow", { opacity: 1, y: 0 }, 0)
        /* The mask reveal: each line rides up out of its own overflow-hidden
           box, so the type appears from behind a hard edge instead of fading
           in place. 0.12 between them is the brief's 120ms stagger.

           `y`, not `yPercent`, and that distinction is the whole tween. The
           initial offset is set in CSS as translateY(105%) so the line is
           already hidden at first paint; GSAP reads that back off the computed
           matrix, which is in pixels, so it lands in `y` (131.7px here) and
           leaves `yPercent` at 0. Animating yPercent to 0 therefore animates a
           value that is already 0 — a silent no-op that leaves the headline
           parked off-screen with everything around it correctly revealed. */
        .to(heroLines, { y: 0, stagger: 0.12 }, 0.12)
        .to(".hero__sub", { opacity: 1, y: 0 }, 0.42)
        .to(".hero .btn-row", { opacity: 1, y: 0 }, 0.54);

      /* The light holds a very slow settle as the sequence plays — 2.5s, far
         longer than anything else, so it is felt rather than watched. */
      gsap.fromTo(
        ".hero__light",
        { scale: 1.06 },
        { scale: 1, duration: 2.5, ease: "expo.out" }
      );

      /* Hero light parallaxes at 0.4x while the text leaves at 1x. Scrubbed, so
         it is tied to scroll position and not to a clock. */
      gsap.to(".hero__light", {
        yPercent: 24,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      /* --- Section entrances. Once each, and genuinely once: `once: true`
             kills the trigger after it fires, so scrolling back up does not
             replay the page.

             The hero's own elements carry .reveal too — they need the same
             hidden initial state from the CSS — but they are driven by the
             intro timeline above. Without this filter they would be claimed by
             both, and the scroll trigger would fight the timeline for the same
             properties on the very first frame. */
      gsap.utils
        .toArray(".reveal")
        .filter(function (el) {
          return !el.closest(".hero");
        })
        .forEach(function (el) {
          gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "expo.out",
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              once: true,
              onEnter: function () {
                hint(el);
              },
            },
            onComplete: function () {
              unhint(el);
            },
          });
        });

      /* --- The process cross-fade.
             Desktop only. The figure column is sticky in CSS; all this does is
             decide which of the five drawings is currently opaque, and which
             stage panel is lit. Below 64em the whole block never runs and each
             stage shows its own inline drawing instead. */
      if (desktop) {
        var plates = gsap.utils.toArray(".process__plate");
        var stages = gsap.utils.toArray(".stage");
        var current = -1;

        var show = function (i) {
          if (i === current) return;
          current = i;
          plates.forEach(function (plate, n) {
            gsap.to(plate, {
              opacity: n === i ? 1 : 0,
              duration: 0.8,
              ease: "power2.inOut",
              overwrite: "auto",
            });
          });
          stages.forEach(function (stage, n) {
            stage.classList.toggle("is-active", n === i);
          });
        };

        /* ONE trigger for the whole column, not one per stage.
           Per-stage triggers with onToggle look right and are subtly wrong in
           two ways. The stages do not touch — there is a gap of six to eleven
           rem between them — so at any scroll position that lands in a gap NO
           stage is active and the drawing is whatever was last lit rather than
           what the reader is looking at. Worse, onToggle only fires if a
           sampled frame falls inside a stage's range: a fast flick, a trackpad
           throw, or a jump to an anchor can cross an entire 160px stage between
           two frames, and that stage is then never activated at all. Measured
           on the built page, jumping 400px at a time skipped stage 03 outright
           and the drawing stuck on 02 for the rest of the section.

           Nearest-centre-to-a-reading-line cannot skip and cannot gap: whatever
           the scroll position, exactly one stage is closest, so there is always
           an answer and it is always the one level with the reader. */
        var centres = [];
        var measure = function () {
          centres = stages.map(function (s) {
            var r = s.getBoundingClientRect();
            return r.top + window.scrollY + r.height / 2;
          });
        };
        measure();
        /* Re-measure on refresh rather than reading layout every frame — this
           runs on scroll, and five getBoundingClientRect calls per frame would
           force a synchronous layout on the scroll path for no reason. */
        window.ScrollTrigger.addEventListener("refresh", measure);

        window.ScrollTrigger.create({
          trigger: ".process__stages",
          start: "top bottom",
          end: "bottom top",
          onUpdate: function () {
            var line = window.scrollY + window.innerHeight * 0.62;
            var best = 0;
            var bestDist = Infinity;
            for (var i = 0; i < centres.length; i++) {
              var d = Math.abs(centres[i] - line);
              if (d < bestDist) {
                bestDist = d;
                best = i;
              }
            }
            show(best);
          },
        });

        show(0);
      }

      initAnchors(lenis);

      /* Fonts land after first paint under font-display: swap, and the metric
         change moves every trigger below the fold. Without this the process
         cross-fade fires against stale positions on a cold load. */
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          window.ScrollTrigger.refresh();
        });
      }

      return function cleanup() {
        stopLenis();
      };
    }
  );

  /* matchMedia handles the reduce -> no-preference direction by rebuilding, but
     the class on <html> is ours and it has to be put back or the CSS keeps the
     reveal states hidden with nothing left to animate them. */
  var onPrefChange = function (e) {
    if (e.matches) root.classList.remove("motion");
    else root.classList.add("motion");
  };
  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener("change", onPrefChange);
  } else if (reduceQuery.addListener) {
    reduceQuery.addListener(onPrefChange);
  }
})();
