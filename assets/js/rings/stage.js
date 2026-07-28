/* The stage: one canvas, one scene, four rings, two ways of showing them.
 *
 * THE REEL is the main one. The canvas is stuck to the top of the viewport for
 * the length of the section, and the page scrolls past it — one ring rises into
 * the frame, turns, and lifts out as the next arrives, and at the end all four
 * assemble into a row and the way to get in touch appears under them. Where
 * each ring is at any moment comes from reel.js, which holds the choreography
 * and nothing else.
 *
 * THE GRID is the other, and it exists for one reader: someone who has asked
 * their system for reduced motion. A scroll-driven film is exactly the thing
 * that setting is asking not to be shown, so that reader gets all four rings at
 * once, lit and still, and the loop never starts.
 *
 * WHERE THE LAYOUT COMES FROM, EITHER WAY. Nothing here decides how tall an act
 * is or how many columns the still grid has. The page does that in CSS, and
 * this reads the resulting boxes back out of the DOM: an act's progress is
 * measured from its own element's position on screen, and in the still grid a
 * ring is placed into whatever rectangle its cell occupies. So the 3D cannot
 * drift from the captions underneath it at any viewport width, and a new
 * breakpoint needs no code change at all.
 *
 * WHAT IS DONE TO STAY CHEAP.
 *   - In the reel, a ring outside its act is not drawn. For most of the scroll
 *     that leaves one ring on screen instead of four: about seven draw calls.
 *   - The loop is stopped, not idled, when the canvas is off screen or the tab
 *     is hidden. A page left open in another tab costs nothing.
 *   - Device pixel ratio is capped. The canvas is now the size of the whole
 *     viewport, so a phone reporting 3 would ask for nine times the fragment
 *     work of a 1x screen for no visible gain.
 *   - Frame times are measured, and if the machine cannot hold the rate the
 *     stage gives up quality in two steps rather than stuttering.
 *   - Every rectangle is read before anything is written, so a frame never
 *     forces the browser to lay the page out twice.
 */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  MathUtils,
  NeutralToneMapping,
} from "../vendor/three.module.min.js";
import { studioEnvironment } from "./environment.js";
import { createMaterials, disposeMaterials } from "./materials.js";
import { buildRings } from "./designs.js";
import { act, finale, finaleReveal } from "./reel.js";

/* A long lens. 12° is roughly a 200mm on full frame, and it is chosen for the
   same reason a jeweller's photographer chooses one: at a wide angle a ring
   away from the middle of the frame leans away from the viewer, and a ring that
   leans reads as a mistake rather than as perspective. The camera is pushed
   back to compensate, so the frame stays the same size. */
const FOV = 12;
const VISIBLE_HEIGHT = 3; // world units the canvas spans vertically
const TILT = 0.35; // the still grid's lean; the reel animates its own

/* How much of its cell the largest design occupies in the still grid. Lower
   than it looks like it should be, and the tilt is why: leaning a ring back
   swings the top of it toward the camera, where perspective makes it about 7%
   bigger than the flat arithmetic says. */
const FILL = 0.86;

/* How much of the frame a ring fills while it is being presented — capped
   against the width as well as the height, because a portrait phone has plenty
   of the second and very little of the first. */
const HERO_H = 0.6;
const HERO_W = 0.78;

/* Spin offsets, so no two rings are ever at exactly the same angle. Small, and
   they have to stay small: the reel sweeps a ring through a deliberately
   limited arc that never reaches edge-on (see reel.js), and a phase of any size
   would push one of the four straight through it. */
const PHASE = [0, 0.16, -0.13, 0.09];
/* A slow turn that keeps running when the scroll stops. Without it, standing
   still on a ring gives you a photograph; with it, the light keeps moving
   across the facets and the stone stays alive. */
const IDLE = 0.075;
const HOVER_SPIN = 2.2;
const SPIN = [0.29, 0.245, 0.325, 0.27];

/** Coarse guess at what this machine can afford, before a frame is drawn. */
function detectTier() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (memory <= 2 || cores <= 2) return "low";
  if (coarse || memory <= 4 || cores <= 4) return "medium";
  return "high";
}

/* Capped lower than a still image would need, because in the reel the canvas is
   the whole viewport rather than a strip of it — the same pixel ratio costs
   several times as much here as it did in the row. */
const DPR_CAP = { high: 1.75, medium: 1.4, low: 1.15 };

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {HTMLElement[]} o.slots  the cells, one per design, matched by name
 * @param {boolean} o.motion  false runs the still grid and never starts a loop
 * @param {HTMLElement|null} o.finale  the closing block, if the reel is running
 */
export function createStage({ canvas, slots, motion = true, finale: foot = null }) {
  const tier = detectTier();
  const reeling = motion && !!foot;

  const renderer = new WebGLRenderer({
    canvas,
    // Transparent, so the shaft of light the page paints behind the canvas
    // shows through and the rings sit in it rather than on a grey rectangle.
    alpha: true,
    antialias: tier !== "low",
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setClearAlpha(0);
  // Khronos PBR Neutral rather than ACES: ACES pulls the saturation out of the
  // highlight on yellow gold and turns it cream. This one rolls off just as
  // gracefully and keeps the hue all the way up.
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.z = VISIBLE_HEIGHT / 2 / Math.tan(MathUtils.degToRad(FOV / 2));

  /* Resolution matters more here than it usually does for an environment map.
     The stones are mirror-smooth, so they sample the sharpest mip of it, and
     the small hard cards in the studio are what they flash off — at 128 those
     cards are a few texels across and the flash becomes a smear. */
  const size = tier === "high" ? 512 : tier === "medium" ? 256 : 128;
  // Two rooms, built once and thrown away: a dark studio the metals reflect,
  // and a light tent the stones do. environment.js explains why one cannot
  // serve both.
  //
  // The metals' room is built at half the tent's resolution, and gets it back
  // in startup time for nothing: a shank is polished to roughness 0.15, which
  // means it samples a blurred mip of its map and cannot resolve detail the
  // sharp one holds. Only the stones, at roughness 0, ever look at mip zero.
  const environment = studioEnvironment(renderer, {
    size: Math.max(128, size / 2),
    room: "metal",
  });
  const gemEnvironment = studioEnvironment(renderer, { size, room: "gem" });
  scene.environment = environment;

  const materials = createMaterials(tier, gemEnvironment);
  const rings = buildRings(materials);

  // holder: position, scale and lean, set per frame in the reel and once per
  // layout in the grid. spinner: the turn, kept separate so the lean is not
  // itself rotating.
  const spinners = rings.map((holder) => {
    holder.rotation.x = TILT;
    scene.add(holder);
    return holder.children[0];
  });

  // Cells, matched to designs by name rather than by document order, so the
  // markup can be reordered without silently pairing the wrong caption.
  const cells = rings.map((holder) =>
    slots.find((s) => s.dataset.ring === holder.name)
  );
  // In the still grid the ring is fitted to the square inside its cell; the
  // cell itself carries the caption too and would place it low.
  const boxes = cells.map((cell) => cell?.querySelector("[data-slot]") || cell);

  const hovered = rings.map(() => 0);
  const boost = rings.map(() => 0);

  /* --- layout ------------------------------------------------------------ */

  let width = 0;
  let height = 0;
  let worldW = 0;

  function measure() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    worldW = VISIBLE_HEIGHT * camera.aspect;
    return true;
  }

  /** Still grid: a ring dropped into each cell's rectangle. */
  function layoutGrid() {
    const frame = canvas.getBoundingClientRect();
    rings.forEach((holder, i) => {
      if (!boxes[i]) return;
      const box = boxes[i].getBoundingClientRect();
      // Cell centre as a fraction of the canvas, then across the world plane
      // at z = 0. Y is negated: the DOM measures down, the world measures up.
      const fx = (box.left + box.width / 2 - frame.left) / width;
      const fy = (box.top + box.height / 2 - frame.top) / height;
      holder.position.set((fx - 0.5) * worldW, -(fy - 0.5) * VISIBLE_HEIGHT, 0);
      // Every ring takes the SAME scale — the cells are identical, so this is
      // one number — which is what keeps four size-7 shanks the same size on
      // screen while the solitaire is still allowed to stand taller than the
      // eternity band.
      const span =
        Math.min((box.width / width) * worldW, (box.height / height) * VISIBLE_HEIGHT) *
        FILL;
      holder.scale.setScalar(span);
      holder.rotation.x = TILT;
      holder.visible = true;
    });
  }

  function layout() {
    if (!measure()) return false;
    if (!reeling) layoutGrid();
    return true;
  }

  /* --- the reel ------------------------------------------------------------
   * Every rectangle is read first and every property written afterwards. Doing
   * it the other way round makes the browser re-lay-out the page between each
   * pair, four times a frame, on the one code path that runs during a scroll. */

  const progress = new Array(5).fill(-1);
  const drift = rings.map(() => 0);
  const shown = new Array(5).fill(-1);

  function readProgress() {
    const vh = window.innerHeight || height;
    for (let i = 0; i < 4; i++) {
      const cell = cells[i];
      if (!cell) {
        progress[i] = -1;
        continue;
      }
      const box = cell.getBoundingClientRect();
      // 0 as the cell's top edge crosses the middle of the screen, 1 one full
      // cell-height later. The cell is a screen and a bit tall, so an act is a
      // screen and a bit of scrolling.
      progress[i] = box.height ? (vh * 0.5 - box.top) / box.height : -1;
    }
    const box = foot.getBoundingClientRect();
    progress[4] = box.height ? (vh * 0.5 - box.top) / box.height : -1;
  }

  function direct(dt) {
    const heroScale = Math.min(HERO_H * VISIBLE_HEIGHT, HERO_W * worldW);
    // Four across only when the frame is wide enough that four rings are not
    // postage stamps; otherwise two rows of two.
    const cols = camera.aspect > 1.45 ? 4 : 2;
    // A ring's width as a fraction of half the frame — what reel.js spaces the
    // closing arrangement in, so that it holds at any aspect ratio.
    const unit = heroScale / (worldW * 0.5);
    const v = progress[4];
    /* Wide enough at the near end that the FIRST ring's arrival is still at
       zero when the finale takes over from it, and the LAST ring's is still at
       zero when its own act finally releases it a third of a screen later —
       the stagger in reel.js is set so that both are true of the same window. */
    const closing = v > -0.3 && v < 1.6;

    /* THE HANDOVER, per ring rather than all at once.
     *
     * The obvious rule — "once the closing block is in view, everything is in
     * the finale" — has a hole in it, and the hole is the fourth ring: the
     * closing block starts scrolling in while that ring is still mid-act, so
     * the rule snatches it out of the middle of the frame and drops it below
     * the bottom edge to come back with the others. It is the one visible jump
     * in the whole piece.
     *
     * A ring therefore leaves its act on its OWN schedule, and only joins the
     * finale once its act has finished. That works because of where the two
     * meet: an act ends with the ring lifted clear above the top of the frame,
     * and the finale begins with it below the bottom. Both are off screen, so
     * the swap costs nothing to look at. The first three rings are long past
     * their acts by now and go straight to the row. */
    const shots = rings.map((_, i) => {
      const shot = act(progress[i], PHASE[i]);
      if (shot.visible) return shot;
      return closing ? finale(v, i, cols, unit) : shot;
    });

    rings.forEach((holder, i) => {
      const shot = shots[i];
      holder.visible = shot.visible;
      if (!shot.visible) return;

      holder.position.set(
        shot.x * worldW * 0.5,
        shot.y * VISIBLE_HEIGHT,
        shot.z * VISIBLE_HEIGHT
      );
      holder.scale.setScalar(shot.scale * heroScale);
      holder.rotation.x = shot.tilt;
      drift[i] += IDLE * dt;
      spinners[i].rotation.y = shot.spin + drift[i];
    });

    // Every style write happens here, after every read above — mixing the two
    // is what turns one layout per frame into five.
    write(4, foot, closing ? finaleReveal(v) : 0);
    for (let i = 0; i < 4; i++) write(i, cells[i], shots[i].reveal);
  }

  /** Sets a caption's reveal, and only when it has actually changed. */
  function write(slot, element, value) {
    if (!element || value === shown[slot]) return;
    element.style.setProperty("--reveal", value.toFixed(3));
    shown[slot] = value;
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
      // Last resort: drop the stones' inside pass. They keep their crowns and
      // their fire and lose the pavilion mosaic under them — half the gem cost
      // for a good deal less than half the look, and a far better outcome than
      // a row of beautiful rings running at fifteen frames a second.
      scene.traverse((o) => {
        if (o.material === materials.gemInside) o.visible = false;
      });
    }
    resize();
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
  let clock = 0;
  let onscreen = true;
  let pending = true;

  function draw() {
    renderer.render(scene, camera);
    pending = false;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    clock += dt;

    if (reeling) {
      readProgress();
      direct(dt);
    } else {
      rings.forEach((holder, i) => {
        boost[i] += (hovered[i] - boost[i]) * Math.min(dt * 4, 1);
        spinners[i].rotation.y +=
          SPIN[i] * (1 + boost[i] * (HOVER_SPIN - 1)) * dt;
        holder.rotation.x = TILT + Math.sin(clock * 0.31 + PHASE[i]) * 0.05;
      });
    }

    watchFrameRate(dt);
    draw();
  }

  function start() {
    if (raf || !motion) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /** Used on the still path: draw exactly one frame, on the next tick. */
  function requestFrame() {
    if (pending || motion) return;
    pending = true;
    requestAnimationFrame(() => {
      if (pending) draw();
    });
  }

  /* --- wiring ------------------------------------------------------------- */

  function resize() {
    if (!layout()) return;
    pending = true;
    if (!motion) requestAnimationFrame(draw);
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);

  const inView = new IntersectionObserver(
    ([entry]) => {
      onscreen = entry.isIntersecting;
      if (onscreen && !document.hidden) start();
      else stop();
    },
    { rootMargin: "120px" }
  );
  inView.observe(canvas);

  function onVisibility() {
    if (document.hidden) stop();
    else if (onscreen) start();
  }
  document.addEventListener("visibilitychange", onVisibility);

  /* Hover only exists in the still grid — in the reel the scroll is the
     control, and a second one fighting it would be noise. It is taken from the
     CAPTION CELLS rather than by ray-casting the canvas: exact, free per frame,
     and it comes with keyboard focus for nothing.

     One delegated listener rather than eight. Per-cell enter/leave pairs fire
     in a burst as a pointer crosses the gap between two cells — leave, enter,
     leave, enter — and every one of them was a state change the rings had to
     answer, which is what read as a twitch. A single bubbling pointerover
     cannot produce that burst. */
  const grid = reeling ? null : cells.find(Boolean)?.parentElement;
  const setHover = (cell) => {
    const i = cells.indexOf(cell);
    let changed = false;
    hovered.forEach((_, k) => {
      const next = k === i ? 1 : 0;
      if (hovered[k] !== next) changed = true;
      hovered[k] = next;
    });
    if (changed) requestFrame();
  };
  const onOver = (e) => setHover(e.target.closest?.("[data-ring]") || null);
  const onOut = () => setHover(null);
  grid?.addEventListener("pointerover", onOver);
  grid?.addEventListener("pointerleave", onOut);
  grid?.addEventListener("focusin", onOver);
  grid?.addEventListener("focusout", onOut);

  // A lost context is not an error worth crashing on — it happens when a laptop
  // switches GPUs or a phone reclaims memory. Stop, and pick up when it returns.
  const onLost = (e) => {
    e.preventDefault();
    stop();
  };
  const onRestored = () => {
    resize();
    if (motion) start();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  /* --- first frame -------------------------------------------------------- */

  layout();

  if (reeling) {
    readProgress();
    direct(0);
  } else {
    // Held still, but not held straight on: a fixed quarter turn each so the
    // four read as four different objects rather than as a repeated one.
    const still = [-0.42, 0.3, -0.22, 0.38];
    spinners.forEach((s, i) => (s.rotation.y = still[i]));
  }
  draw();
  if (motion) start();

  return {
    /** Re-measures after a layout change the observers cannot see. */
    refresh: resize,
    destroy() {
      stop();
      observer.disconnect();
      inView.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      grid?.removeEventListener("pointerover", onOver);
      grid?.removeEventListener("pointerleave", onOut);
      grid?.removeEventListener("focusin", onOver);
      grid?.removeEventListener("focusout", onOut);
      scene.traverse((o) => o.geometry?.dispose());
      disposeMaterials(materials);
      environment.dispose();
      gemEnvironment.dispose();
      renderer.dispose();
    },
  };
}
