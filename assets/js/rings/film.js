/* The film's jewels: one canvas over the dark chapter, three pieces of metal.
 *
 * This is the successor to stage.js (v0.1.4, recoverable from history), rebuilt
 * for the five-act landing page. The old stage ran a self-contained reel with
 * its own acts; this one plays SUPPORTING CAST to the page's existing film —
 * home.js still directs every reveal and every --p, and this file only puts
 * three real objects into two of its scenes:
 *
 *   THE HERO. The solitaire — the same 57-facet brilliant on six platinum claws
 *   that closed v0.1.4 — hangs in the lamp above the store's name. The scroll
 *   turns it through a limited arc and eases it toward the centre of the frame
 *   as the title sinks away beneath it, and then it lifts out of the top of
 *   the page: it follows, and then it goes, which is the whole choreography.
 *
 *   THE FITTING. Where two drawn circles used to stand in, two real wedding
 *   bands — one yellow gold, one platinum — fly in from the wings, bloom open
 *   from profile to face-on in flight, and settle threaded through one
 *   another. A circle drawn in CSS could only cross its partner; two tori
 *   under a depth buffer actually interlock, top edge behind, bottom edge in
 *   front.
 *
 * After the fitting the stage empties, the canvas fades, and the loop is
 * STOPPED, not idled — the light chapter of the page costs nothing. A scroll
 * back up wakes it.
 *
 * Everything the old stage learned about staying cheap is kept: one geometry
 * pass before any style write, a capped pixel ratio, measured frame times that
 * give up quality in steps rather than stuttering, and a loop that halts when
 * the tab is hidden. Reduced motion never reaches this file at all — the boot
 * refuses to load it, and the page's own photo hero stands. */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  MathUtils,
  NeutralToneMapping,
  Group,
  Mesh,
  Vector3,
  Box3,
} from "../vendor/three.module.min.js";
import { studioEnvironment } from "./environment.js";
import { createMaterials, disposeMaterials } from "./materials.js";
import { DESIGNS } from "./designs.js";
import { sweepBand } from "./metal.js";

/* The same long lens as the old stage, for the same reason: at 12° a ring away
   from the centre of the frame does not lean, and this ring spends the whole
   hero away from the centre of the frame. */
const FOV = 12;
const VISIBLE_HEIGHT = 3; // world units the viewport spans vertically

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (x) => 1 - (1 - x) ** 3;
const inCubic = (x) => x * x * x;
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

/* --- the shots -----------------------------------------------------------
 * Pure arithmetic, reel.js style: scroll fractions in, WORLD units out —
 * x/y/z in world coordinates, scale as the piece's world span. `ctx` carries
 * the viewport's shape so one cut works from a 320px portrait to a cinema
 * display without a breakpoint. Every resting pose obeys the old law: the
 * scrub never parks a ring edge-on, because in a scroll-linked film every
 * frame is somewhere a reader is entitled to stop and live. */

/* THE SOLITAIRE'S ARC. It rests three-quarters on with its crown tipped
   toward the viewer — the pose a ring is shown in across a counter — and the
   whole hero scroll turns it barely 70°: a piece being considered, not a
   turntable. The title block is anchored to the LOWER third of the hero (see
   home.css), so the ring owns the upper: it hangs at about a quarter of the
   frame down, and eases toward the centre as the title sinks and fades.

   On a viewport under 600px tall — a phone on its side, the smallest
   handsets — there is no upper third to own: the CSS keeps the photographed
   hero there and this shot simply never casts. */
function heroShot(p, exit, ctx) {
  if (ctx.short) {
    return { visible: false, x: 0, y: 0, z: 0, scale: 1, spin: 0, tilt: 0 };
  }
  const portrait = ctx.aspect < 0.9;
  // Sized against the frame's tight side: over half the width of a portrait
  // frame, a shade over a quarter the height of a wide one. Portrait hangs
  // the ring lower and larger — a phone's title block is short, and a ring
  // held at desktop height leaves a storey of empty dark between them.
  const span = portrait
    ? Math.min(ctx.worldW * 0.58, VISIBLE_HEIGHT * 0.34)
    : Math.min(ctx.worldW * 0.42, VISIBLE_HEIGHT * 0.28);
  const restY = (portrait ? 0.21 : 0.29) * VISIBLE_HEIGHT;

  const settle = smooth(p);
  const gone = inCubic(exit);
  return {
    visible: exit < 1,
    x: 0,
    y: lerp(restY, VISIBLE_HEIGHT * 0.05, settle) + gone * VISIBLE_HEIGHT * 1.1,
    z: settle * 0.9 - gone * 2.2,
    scale: span * lerp(1, 1.18, settle) * (1 - gone * 0.22),
    spin: -0.62 + p * 1.2 + gone * 0.55,
    tilt: lerp(0.46, 0.3, settle),
  };
}

/* THE BANDS. Each enters in profile from its own wing — a thin bright line
   that blooms open as it turns to face the reader — and they settle
   overlapped by the same 9% of their own width the CSS circles keep, so the
   fallback and the film agree about where the pair stands. The gold rides a
   hair nearer the camera; their opposing leans are what let the tori
   genuinely thread. */
const BANDS = [
  { wing: -1, spin: -TAU * 0.34, restSpin: -0.14, lean: 0.3, from: 0.02, to: 0.56 },
  { wing: 1, spin: TAU * 0.34, restSpin: 0.16, lean: 0.58, from: 0.1, to: 0.66 },
];

function bandShot(i, p, ridePx, ctx) {
  const b = BANDS[i];
  const arrive = outCubic(clamp01((p - b.from) / (b.to - b.from)));
  // min(46vw, 34vh), exactly the size the CSS circles are cut to.
  const span = Math.min(ctx.worldW * 0.46, VISIBLE_HEIGHT * 0.34);
  const wingX = ctx.worldW * 0.5 + span; // fully off screen, plus its own width
  return {
    visible: p > 0.005 && arrive > 0.001,
    x: b.wing * lerp(wingX, span * 0.09, arrive),
    y:
      (1 - arrive) * VISIBLE_HEIGHT * -0.05 +
      (ridePx / ctx.height) * VISIBLE_HEIGHT,
    z: i === 0 ? 0.05 : -0.05,
    scale: span * lerp(0.84, 1, arrive),
    // The flight is a turn about the vertical, so the band opens from a line
    // to a circle as it lands. After landing, the drift is an OSCILLATION —
    // a plain band turned steadily about the vertical would sooner or later
    // stand edge-on, which is the one pose the film never allows.
    spin: lerp(b.spin, b.restSpin, arrive),
    tilt: b.lean + (1 - arrive) * 0.35,
    sway: arrive,
  };
}

/** Coarse guess at what this machine can afford, before a frame is drawn. */
function detectTier() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (memory <= 2 || cores <= 2) return "low";
  if (coarse || memory <= 4 || cores <= 4) return "medium";
  return "high";
}

const DPR_CAP = { high: 1.75, medium: 1.4, low: 1.15 };

/* A slow turn that keeps running while the reader stands still. Without it a
   stopped scroll is a photograph; with it the light keeps walking across the
   facets, which is the entire argument for rendering the ring instead of
   shipping one. */
const IDLE = 0.055;

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {HTMLElement} o.hero      .film-hero — the solitaire's scene
 * @param {HTMLElement} o.fitting   .vow-rings — the bands' scene
 * @param {HTMLElement} o.lamp      .film-hero__lamp — receives --rx/--ry/--ra
 */
export function createFilm({ canvas, hero, fitting, lamp }) {
  const tier = detectTier();

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true, // the lamp the page paints shows through behind the metal
    antialias: tier !== "low",
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setClearAlpha(0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.z = VISIBLE_HEIGHT / 2 / Math.tan(MathUtils.degToRad(FOV / 2));

  const size = tier === "high" ? 512 : tier === "medium" ? 256 : 128;
  const environment = studioEnvironment(renderer, {
    size: Math.max(128, size / 2),
    room: "metal",
  });
  const gemEnvironment = studioEnvironment(renderer, { size, room: "gem" });
  scene.environment = environment;

  const materials = createMaterials(tier, gemEnvironment);

  /* --- the cast ---------------------------------------------------------- */

  /** Recentres a built group on its bounding box and wraps it so the stage
      turns it about its own middle — the same normalisation designs.js gives
      the four-ring set, applied to a cast of three. */
  const box = new Box3();
  const centre = new Vector3();
  const extent = new Vector3();
  function member(inner) {
    box.setFromObject(inner);
    box.getCenter(centre);
    box.getSize(extent);
    inner.position.sub(centre);
    const wrapper = new Group();
    wrapper.scale.setScalar(1 / Math.max(extent.x, extent.y, extent.z));
    wrapper.add(inner);
    const holder = new Group();
    holder.add(wrapper);
    holder.visible = false;
    scene.add(holder);
    return { holder, spinner: wrapper, drift: 0 };
  }

  // The solitaire as designs.js cuts it, asked up to a 2ct stone — the hero
  // shows this ring alone at half the frame, and the 1.5ct proportion reads
  // under-stoned at that magnification. See the note in designs.js.
  const solitaire = member(
    DESIGNS.find((d) => d.id === "solitaire").build(materials, { stone: 0.494 })
  );

  /* The wedding bands are new, and deliberately plain: the fitting's caption
     is "two rings · one appointment", and what is fitted in that appointment
     is a band, not a showpiece. A comfort-court profile each — outerN 2.6
     softens the outer wall — the gold cut a touch wider than the platinum,
     because that is how couples' pairs are actually made. */
  const band = (width, outerN, material) => {
    const g = new Group();
    g.add(
      new Mesh(
        sweepBand({ inner: 1, width: () => width, depth: () => 0.17, outerN }),
        material
      )
    );
    return member(g);
  };
  // Two profiles as well as two metals: the gold is a rounder dome, the
  // platinum a crisper court, so the pair reads as two pieces chosen by two
  // people rather than one shape cast twice.
  const gold = band(0.3, 3.0, materials.yellowGold);
  const plat = band(0.24, 2.2, materials.platinum);

  const cast = [solitaire, gold, plat];

  /* --- geometry ----------------------------------------------------------- */

  const ctx = { aspect: 1, worldW: 0, height: 1, short: false };
  let width = 0;
  let height = 0;
  let vh = window.innerHeight;

  function measure() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    vh = window.innerHeight || height;
    if (!width || !height) return false;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    ctx.aspect = camera.aspect;
    ctx.worldW = VISIBLE_HEIGHT * camera.aspect;
    ctx.height = height;
    // Under 600px there is no upper third for the solitaire to own — the CSS
    // holds the photographed hero there, and the shot never casts. One
    // number, shared with the @media block in home.css.
    ctx.short = height < 600;
    return true;
  }

  /* --- the pointer -------------------------------------------------------
   * A fine pointer leans the piece a few degrees toward the cursor, lerped so
   * it reads as weight rather than as tracking. Coarse pointers never attach
   * the listener; the scroll is their whole control. */
  const aim = { x: 0, y: 0, tx: 0, ty: 0 };
  const fine = window.matchMedia("(pointer: fine)").matches;
  const onPointer = (e) => {
    aim.tx = (e.clientX / Math.max(1, width)) * 2 - 1;
    aim.ty = (e.clientY / Math.max(1, height)) * 2 - 1;
  };
  if (fine) window.addEventListener("pointermove", onPointer, { passive: true });

  /* --- the frame ----------------------------------------------------------
   * Reads first — two rectangles — then writes. Same law as home.js: never
   * ask the browser for layout in the same breath as changing it. */

  const auraShown = { x: null, y: null, o: null };
  let parked = false;
  let exposure = -1;

  function direct(dt) {
    const heroBox = hero.getBoundingClientRect();
    const fitBox = fitting.getBoundingClientRect();

    // The hero plays over 90% of its own height — the same span home.js
    // gives its --p, so the render and the CSS read one clock. The exit is
    // the half-screen after it.
    const ph = clamp01(-heroBox.top / Math.max(1, heroBox.height * 0.9));
    const exit = clamp01(
      (-heroBox.top - heroBox.height * 0.9) / Math.max(1, vh * 0.55)
    );

    // 0 at the fitting's start, 1 when its sticky stage has played out; once
    // the stage un-sticks, the pair rides out of the top with the page
    // instead of hanging in a scene that has left.
    const span = Math.max(1, fitBox.height - vh);
    const pf = clamp01(-fitBox.top / span);
    const ride = fitBox.bottom < vh ? vh - fitBox.bottom : 0;

    aim.x += (aim.tx - aim.x) * Math.min(dt * 3.5, 1);
    aim.y += (aim.ty - aim.y) * Math.min(dt * 3.5, 1);

    const shots = [
      heroShot(ph, exit, ctx),
      bandShot(0, pf, ride, ctx),
      bandShot(1, pf, ride, ctx),
    ];

    let any = false;
    cast.forEach((m, i) => {
      const s = shots[i];
      m.holder.visible = s.visible;
      if (!s.visible) return;
      any = true;
      m.drift += IDLE * dt;
      // The solitaire turns forever; the bands sway about their rest, never
      // through it — see bandShot for why.
      const idle = i === 0 ? m.drift : Math.sin(m.drift * 1.4) * 0.06 * (s.sway || 0);
      m.holder.position.set(s.x + aim.x * 0.05, s.y, s.z);
      m.holder.scale.setScalar(s.scale);
      m.holder.rotation.x = s.tilt + aim.y * -0.05;
      m.spinner.rotation.y = s.spin + idle + aim.x * 0.07;
    });

    /* The aura — the pool of light the CSS paints behind the solitaire —
       follows the ring's true position, and dies with it. The lamp layer
       lives INSIDE the hero, so the ring's viewport position is converted to
       hero-local coordinates before it is written. Three custom properties,
       and only on change. */
    const s = shots[0];
    const ax = Math.round(50 + (s.x / Math.max(1e-3, ctx.worldW)) * 100);
    const ay = Math.round(
      ((height * (0.5 - s.y / VISIBLE_HEIGHT) - heroBox.top) /
        Math.max(1, heroBox.height)) *
        100
    );
    const ao = s.visible ? Math.round((1 - inCubic(exit)) * 100) / 100 : 0;
    if (ax !== auraShown.x || ay !== auraShown.y || ao !== auraShown.o) {
      auraShown.x = ax;
      auraShown.y = ay;
      auraShown.o = ao;
      lamp.style.setProperty("--rx", ax + "%");
      lamp.style.setProperty("--ry", ay + "%");
      lamp.style.setProperty("--ra", ao);
    }

    /* As the fitting plays out toward the opening of the case, the render
       eases down half a stop, so the metal dims with the act it belongs to
       instead of glowing on against the arriving daylight. */
    const dim = 1.12 - clamp01(pf * 1.4 - 0.3) * 0.24;
    if (Math.abs(dim - exposure) > 0.005) {
      exposure = dim;
      renderer.toneMappingExposure = dim;
    }

    return any;
  }

  /* --- quality, measured rather than guessed ------------------------------ */

  let degraded = 0;
  let sampled = 0;
  let elapsed = 0;

  function applyPixelRatio() {
    const cap = DPR_CAP[tier] * (degraded ? 0.72 : 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }
  applyPixelRatio();

  function degrade() {
    degraded += 1;
    if (degraded === 1) {
      applyPixelRatio();
    } else if (degraded === 2) {
      // The stone keeps its crown and its fire and loses the pavilion mosaic
      // — half the gem cost for far less than half the look.
      scene.traverse((o) => {
        if (o.material === materials.gemInside) o.visible = false;
      });
    }
  }

  function watchFrameRate(dt) {
    if (degraded >= 2) return;
    elapsed += dt;
    sampled += 1;
    if (sampled < 90) return;
    const average = elapsed / sampled;
    sampled = 0;
    elapsed = 0;
    if (average > 0.024) degrade(); // worse than ~42fps, sustained
  }

  /* --- the loop ----------------------------------------------------------- */

  let raf = 0;
  let last = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;

    const any = direct(dt);
    if (any) {
      watchFrameRate(dt);
      renderer.render(scene, camera);
      if (parked) {
        parked = false;
        canvas.classList.remove("is-parked");
      }
    } else if (!parked) {
      /* Nothing on stage. One last clear so no stale frame ghosts through
         the fade, then the loop stops entirely — the light chapter of the
         page runs on zero GPU. The scroll listener below is the only thing
         left awake, and it is what rehires us. */
      renderer.clear();
      parked = true;
      canvas.classList.add("is-parked");
      stop();
    }
  }

  function start() {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /* Wakes the loop only when the dark chapter could actually be on screen —
     two rectangle reads on a passive listener, nothing else. */
  function onScroll() {
    if (raf || document.hidden) return;
    const h = hero.getBoundingClientRect();
    const f = fitting.getBoundingClientRect();
    if (h.bottom > -vh * 0.6 || (f.top < vh && f.bottom > -vh * 0.2)) start();
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener("visibilitychange", onVisibility);

  const observer = new ResizeObserver(() => {
    if (measure()) start();
  });
  observer.observe(canvas);

  // A lost context is not an error worth crashing on. Stop; resume if it
  // comes back; if it never does, the boot's failsafe has already been armed.
  const onLost = (e) => {
    e.preventDefault();
    stop();
  };
  const onRestored = () => {
    measure();
    applyPixelRatio();
    start();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  /* --- first frame -------------------------------------------------------- */

  if (!measure()) return null;
  direct(0);
  renderer.render(scene, camera);
  start();

  return {
    destroy() {
      stop();
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (fine) window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      scene.traverse((o) => o.geometry?.dispose());
      disposeMaterials(materials);
      environment.dispose();
      gemEnvironment.dispose();
      renderer.dispose();
    },
  };
}
