/* The film's jewels: one canvas over the dark chapter, one stone and three
 * pieces of metal.
 *
 * This is the v0.2.0 successor to the v0.1.9 film (recoverable from history),
 * rebuilt around a single protagonist: THE STONE. home.js still directs every
 * reveal and every --p; this file puts real objects into three of its scenes —
 *
 *   THE HERO. A loose 2ct round brilliant — no ring, no photograph — hangs in
 *   the lamp above the store's name, turning slowly, its fire walking facet to
 *   facet. Beneath it, its own reflection stands upside-down in the black
 *   glass of the counter: a second, mirrored cast of the same geometry,
 *   squashed and faded the way a reflection is. On the scroll the stone
 *   settles toward the title, then DIVES — down past the name, through the
 *   glass, into the dark of the vow act below. It does not fly away over the
 *   top; it descends into the case, which is where the page goes next.
 *
 *   THE FITTING. Two real wedding bands — one yellow gold, one platinum — fly
 *   in from the wings, bloom open from profile to face-on in flight, and
 *   settle threaded through one another. Unchanged from v0.1.9, because it
 *   works.
 *
 *   THE BUILD. The craft act's drafting board becomes a bench: the hero's
 *   stone returns and a ring is built around it in the five stages the copy
 *   names. Sketch — the stone alone, being considered. Wax — the mounting
 *   scales in, matte and pale. Cast — a flash of exposure and the wax is
 *   18k gold, still satin from the flask. Set — the ring tips its head up,
 *   the stone descends into the six claws and LOCKS to the seat marker the
 *   mounting carries, exact to the millimetre. Finish — the gold's roughness
 *   is polished down live and the ring settles into the counter pose. Every
 *   beat is a pure function of scroll progress, so scrubbing backwards
 *   un-builds it in perfect reverse.
 *
 *   THE BOARD IS THE ANCHOR. The build model is positioned every frame from
 *   the live bounding rect of .craft-build__board — the drafting-board frame
 *   the CSS lays out inside the pinned stage. Wherever a breakpoint puts the
 *   board, the model stands on it: the layout and the render cannot drift
 *   apart, on any viewport, because they are the same rectangle.
 *
 * After the build the stage empties, the canvas fades, and the loop is
 * STOPPED, not idled — the paper chapter of the page costs nothing. A scroll
 * back up wakes it. Everything the old film knew about staying cheap is kept:
 * one geometry pass before any style write, a capped pixel ratio, measured
 * frame times that give up quality in steps, and a loop that halts when the
 * tab is hidden. Reduced motion never reaches this file at all. */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  MathUtils,
  NeutralToneMapping,
  Group,
  Mesh,
  Vector3,
  Quaternion,
  Euler,
  Box3,
} from "../vendor/three.module.min.js";
import { studioEnvironment } from "./environment.js";
import { createMaterials, disposeMaterials } from "./materials.js";
import { DESIGNS } from "./designs.js";
import { sweepBand } from "./metal.js";
import { roundBrilliant } from "./gems.js";

/* The same long lens as ever, for the same reason: at 12° a piece away from
   the centre of the frame does not lean, and both the hero stone and the
   build spend their lives away from the centre of the frame. */
const FOV = 12;
const VISIBLE_HEIGHT = 3; // world units the viewport spans vertically
const EXPOSURE = 1.12;

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (x) => 1 - (1 - x) ** 3;
const inCubic = (x) => x * x * x;
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b) => clamp01((p - a) / (b - a));

/* --- the shots -----------------------------------------------------------
 * Pure arithmetic: scroll fractions in, WORLD units out. `ctx` carries the
 * viewport's shape so one cut works from a 320px portrait to a cinema display
 * without a breakpoint. Every resting pose obeys the old law: the scrub never
 * parks anything edge-on, because in a scroll-linked film every frame is
 * somewhere a reader is entitled to stop and live. */

/* THE STONE'S HANG. It rests in the upper third — the title owns the lower —
   tipped 25° toward the viewer, the pose a loose stone is shown in on the
   tongs. The scroll eases it down a breath as the title sinks, and then the
   exit is a DIVE: nose over, straight down through its own reflection and
   off the foot of the frame, into the act below.

   On a viewport under 600px tall there is no upper third to own: the CSS
   centres the type there and this shot never casts. One number, shared with
   the @media block in home.css. */
function heroShot(p, exit, ctx) {
  if (ctx.short) {
    return { visible: false, x: 0, y: 0, z: 0, r: 1, spin: 0, tilt: 0, floor: 0, dive: 1 };
  }
  const portrait = ctx.aspect < 0.9;
  const diam = portrait
    ? Math.min(ctx.worldW * 0.52, VISIBLE_HEIGHT * 0.3)
    : Math.min(ctx.worldW * 0.36, VISIBLE_HEIGHT * 0.35);
  const restY = (portrait ? 0.2 : 0.22) * VISIBLE_HEIGHT;

  const settle = smooth(p);
  const dive = inCubic(exit);
  return {
    visible: exit < 1,
    x: 0,
    y: lerp(restY, VISIBLE_HEIGHT * 0.1, settle) - dive * VISIBLE_HEIGHT * 1.4,
    z: settle * 0.7 - dive * 1.2,
    r: (diam / 2) * lerp(1, 1.14, settle) * (1 - dive * 0.3),
    spin: p * 0.9,
    tilt: lerp(0.44, 0.3, settle) + dive * 0.6,
    // The glass. Fixed at the resting geometry so the mirror plane never
    // slides while the stone moves — a floor that followed its object would
    // read as water, not glass.
    floor: restY - (diam / 2) * 1.3,
    dive,
  };
}

/* THE BANDS, unchanged from v0.1.9: each enters in profile from its own wing,
   blooms open as it turns to face the reader, and settles overlapped by the
   same 9% of their own width the CSS circles keep, so the fallback and the
   film agree about where the pair stands. */
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

/* Slow turns that keep running while the reader stands still. Without them a
   stopped scroll is a photograph; with them the light keeps walking across
   the facets, which is the entire argument for rendering a stone instead of
   shipping one. The loose stone turns fastest — sparkle is its whole job. */
const IDLE_STONE = 0.16;
const IDLE_BAND = 0.055;
const IDLE_RING = 0.05;

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {HTMLElement} o.hero      .film-hero — the stone's first scene
 * @param {HTMLElement} o.fitting   .vow-rings — the bands' scene
 * @param {HTMLElement} o.build     .craft-build — the bench scene (optional)
 * @param {HTMLElement} o.lamp      .film-hero__lamp — receives --rx/--ry/--ra
 */
export function createFilm({ canvas, hero, fitting, build, lamp }) {
  const tier = detectTier();
  const board = build ? build.querySelector(".craft-build__board") : null;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true, // the lamp the page paints shows through behind the metal
    antialias: tier !== "low",
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setClearAlpha(0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = EXPOSURE;

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

  /* THE CRAFT SKINS. The build dresses one geometry twice over: first as the
     carver's wax — a dielectric, matte, pale and hueless like everything the
     page itself paints — and then as 18k gold whose roughness is polished
     down LIVE across the finish beat. Both are clones, so the fitting's
     shared band materials never feel the bench. */
  const craftWax = materials.platinum.clone();
  craftWax.metalness = 0;
  craftWax.roughness = 0.52;
  craftWax.color.setScalar(0.5);
  craftWax.envMapIntensity = 0.55;

  const craftGold = materials.yellowGold.clone();
  craftGold.roughness = 0.3;

  /* --- the cast ---------------------------------------------------------- */

  /** Recentres a built group on its bounding box and wraps it so the stage
      turns it about its own middle. */
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

  /* THE STONE — the film's protagonist, built loose: the 57-facet brilliant
     at girdle radius 1 in a bare group, NOT normalised, so the holder's scale
     IS the stone's world radius and matching it to the ring's seat later is
     one multiplication. The spinner recentres the visual mass (a brilliant
     hangs deep below its girdle) so the turn is about the middle of what the
     eye sees, not about the girdle plane. */
  const stoneGeometry = roundBrilliant();
  stoneGeometry.computeBoundingBox();
  const sbb = stoneGeometry.boundingBox;
  const stoneLift = -(sbb.max.y + sbb.min.y) / 2; // recentring offset, +Y

  function looseStone(inside, surface) {
    const spinner = new Group();
    const back = new Mesh(stoneGeometry, inside);
    back.renderOrder = 1;
    const front = new Mesh(stoneGeometry, surface);
    front.renderOrder = 2;
    spinner.add(back, front);
    spinner.position.y = stoneLift;
    const holder = new Group();
    holder.add(spinner);
    holder.visible = false;
    scene.add(holder);
    return { holder, spinner, back };
  }

  const stone = looseStone(materials.gemInside, materials.gemSurface);

  /* THE REFLECTION. The same geometry again in faded clones of the same two
     materials, mirrored about the glass plane the hero shot fixes. Squashed
     to 0.55 of its height — a counter shot's reflection is foreshortened —
     and never allowed to survive the dive: it dies as the stone comes down
     to meet it. */
  const mirrorInside = materials.gemInside.clone();
  mirrorInside.transparent = true;
  mirrorInside.opacity = 0.22;
  mirrorInside.depthWrite = false;
  mirrorInside.envMapIntensity = 1.1;
  const mirrorSurface = materials.gemSurface.clone();
  mirrorSurface.opacity = 0.4;
  const MIRROR_SQUASH = 0.55;
  const mirror = looseStone(mirrorInside, mirrorSurface);

  /* THE MOUNTING — the hero solitaire's own design, cut bare (no stone; the
     hero's is coming) and in yellow gold, because "molten gold takes its
     place" is what the copy on the stage beside it says. */
  const craft = member(
    DESIGNS.find((d) => d.id === "solitaire").build(materials, {
      stone: 0.494,
      metal: "yellowGold",
      bare: true,
    })
  );
  const craftMeshes = [];
  let seatMarker = null;
  craft.holder.traverse((o) => {
    if (o.isMesh) craftMeshes.push(o);
    if (o.name === "seat-marker") seatMarker = o;
  });
  let craftSkin = null;
  function setCraftSkin(skin) {
    if (skin === craftSkin) return;
    craftSkin = skin;
    const m = skin === "wax" ? craftWax : craftGold;
    craftMeshes.forEach((mesh) => {
      mesh.material = m;
    });
  }
  setCraftSkin("wax");

  /* THE WEDDING BANDS, exactly as v0.1.9 cut them: comfort-court profiles,
     the gold a touch wider and rounder than the platinum, because that is
     how couples' pairs are actually made. */
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
  const gold = band(0.3, 3.0, materials.yellowGold);
  const plat = band(0.24, 2.2, materials.platinum);

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
    // Under 600px there is no upper third for the stone to own — the CSS
    // centres the hero type there and the shot never casts. One number,
    // shared with the @media block in home.css.
    ctx.short = height < 600;
    return true;
  }

  /* --- the pointer -------------------------------------------------------- */

  const aim = { x: 0, y: 0, tx: 0, ty: 0 };
  const fine = window.matchMedia("(pointer: fine)").matches;
  const onPointer = (e) => {
    aim.tx = (e.clientX / Math.max(1, width)) * 2 - 1;
    aim.ty = (e.clientY / Math.max(1, height)) * 2 - 1;
  };
  if (fine) window.addEventListener("pointermove", onPointer, { passive: true });

  /* --- the frame ----------------------------------------------------------
   * Reads first — a handful of rectangles — then writes. Same law as
   * home.js: never ask the browser for layout in the same breath as
   * changing it. */

  const auraShown = { x: null, y: null, o: null };
  let parked = false;
  let exposureShown = -1;
  let stoneDrift = 0;

  const _p = new Vector3();
  const _q = new Quaternion();
  const _s = new Vector3();
  const _off = new Vector3();
  const _e = new Euler();
  const _qf = new Quaternion();

  /** Places the loose stone from a plain pose {x,y,z,r,spin,tilt}. */
  function poseStone(m, pose) {
    m.holder.visible = true;
    m.holder.position.set(pose.x, pose.y, pose.z);
    m.holder.scale.setScalar(pose.r);
    m.holder.rotation.set(pose.tilt, pose.spin, 0);
  }

  /* THE BENCH. Every number here is a fraction of the drafting board's live
     rectangle, so the choreography follows the CSS layout to the pixel on
     every viewport. Returns whether anything is on stage, and the stone's
     claim if the hero has not already made one. */
  function craftPlay() {
    if (!build || !board) {
      craft.holder.visible = false;
      return { any: false, stone: null, lock: 0 };
    }
    const bb = build.getBoundingClientRect();
    if (bb.top > vh || bb.bottom < -vh * 0.25) {
      craft.holder.visible = false;
      return { any: false, stone: null, lock: 0 };
    }
    const span = Math.max(1, bb.height - vh);
    const p = clamp01(-bb.top / span);

    const br = board.getBoundingClientRect();
    if (!br.width || !br.height) {
      craft.holder.visible = false;
      return { any: false, stone: null, lock: 0 };
    }
    const wpp = VISIBLE_HEIGHT / height; // world units per pixel
    const cx = ((br.left + br.width / 2) / width - 0.5) * ctx.worldW;
    const cy = (0.5 - (br.top + br.height / 2) / height) * VISIBLE_HEIGHT;
    const bspan = Math.min(br.width, br.height) * wpp;

    /* The five beats, at fifths of the scroll — the same arithmetic home.js
       uses to choose the current copy card, so the model and the words can
       never disagree about which stage is playing. */
    const waxIn = outCubic(seg(p, 0.18, 0.28));
    const flash = seg(p, 0.42, 0.56);
    const tipUp = Math.sin(Math.PI * seg(p, 0.58, 0.8));
    const arrive = smooth(seg(p, 0.6, 0.76));
    const finish = seg(p, 0.8, 0.94);

    // The mounting.
    const ringOn = waxIn > 0.001;
    craft.holder.visible = ringOn;
    let lock = 0;
    if (ringOn) {
      setCraftSkin(p < 0.49 ? "wax" : "gold");
      craftGold.roughness = lerp(0.3, 0.13, smooth(finish));
      const ringSpan = bspan * 0.62 * lerp(0.86, 1, waxIn) * (1 + finish * 0.05);
      craft.holder.position.set(
        cx + aim.x * 0.04,
        cy - bspan * 0.04 + (1 - waxIn) * bspan * -0.22,
        0
      );
      craft.holder.scale.setScalar(ringSpan);
      craft.drift += IDLE_RING * lastDt;
      craft.holder.rotation.x = 0.42 + tipUp * 0.5 - finish * 0.04 + aim.y * -0.04;
      craft.spinner.rotation.y =
        -0.6 + p * 2.6 + craft.drift + aim.x * 0.06;
    }

    /* The stone's part in this scene: hovering over the board while the
       mounting is imagined, waiting at the edge of the bench while it is
       waxed and cast, then descending into the claws. Past the arrival it is
       LOCKED — posed off the seat marker's world transform, so it turns with
       the ring as one made thing. */
    let stonePose = null;
    if (arrive >= 1 || (ringOn && arrive > 0)) {
      // The seat, in world terms, computed AFTER the ring is posed.
      seatMarker.updateWorldMatrix(true, false);
      seatMarker.matrixWorld.decompose(_p, _q, _s);
      const seatR = _s.x * 0.494; // ring-local stone radius, made world
      _off.set(0, stoneLift * seatR, 0).applyQuaternion(_q);
      if (arrive >= 1) {
        stone.holder.visible = true;
        stone.holder.position.copy(_p).sub(_off);
        stone.holder.scale.setScalar(seatR);
        stone.holder.quaternion.copy(_q);
        lock = 1;
        stonePose = { locked: true };
      } else {
        // In flight: tray pose eased toward the seat pose.
        const tray = trayPose(cx, cy, br, bspan, p);
        stone.holder.visible = true;
        stone.holder.position.set(
          lerp(tray.x, _p.x - _off.x, arrive),
          lerp(tray.y, _p.y - _off.y, arrive),
          lerp(tray.z, _p.z - _off.z, arrive)
        );
        stone.holder.scale.setScalar(lerp(tray.r, seatR, arrive));
        _e.set(tray.tilt, tray.spin, 0);
        _qf.setFromEuler(_e);
        _qf.slerp(_q, arrive);
        stone.holder.quaternion.copy(_qf);
        lock = 1;
        stonePose = { locked: true };
      }
    } else {
      stonePose = trayPose(cx, cy, br, bspan, p);
    }

    return { any: ringOn || !!stonePose, stone: stonePose, lock };
  }

  /** Where the loose stone stands on the bench before it is set: centre of
      the board through the sketch, then up to the top corner — the tray —
      while the mounting takes the middle. */
  function trayPose(cx, cy, br, bspan, p) {
    const aside = smooth(seg(p, 0.18, 0.3));
    const wpp = VISIBLE_HEIGHT / height;
    return {
      x: lerp(cx, cx + br.width * wpp * 0.33, aside) + aim.x * 0.04,
      y: lerp(cy + bspan * 0.05, cy + br.height * wpp * 0.36, aside),
      z: 0.1,
      r: bspan * lerp(0.17, 0.1, aside),
      spin: stoneDrift + p * 1.6,
      tilt: lerp(0.5, 0.4, aside) + aim.y * -0.04,
    };
  }

  let lastDt = 0;

  function direct(dt) {
    lastDt = dt;
    const heroBox = hero.getBoundingClientRect();
    const fitBox = fitting.getBoundingClientRect();

    // The hero plays over 90% of its own height — the same span home.js
    // gives its --p, so the render and the CSS read one clock. The dive is
    // the half-screen after it.
    const ph = clamp01(-heroBox.top / Math.max(1, heroBox.height * 0.9));
    const exit = clamp01(
      (-heroBox.top - heroBox.height * 0.9) / Math.max(1, vh * 0.55)
    );

    const span = Math.max(1, fitBox.height - vh);
    const pf = clamp01(-fitBox.top / span);
    const ride = fitBox.bottom < vh ? vh - fitBox.bottom : 0;

    aim.x += (aim.tx - aim.x) * Math.min(dt * 3.5, 1);
    aim.y += (aim.ty - aim.y) * Math.min(dt * 3.5, 1);

    stoneDrift += IDLE_STONE * dt;

    let any = false;

    /* The hero's claim on the stone comes first; the bench only takes it
       once the dive is complete, and the two scenes are screens apart. */
    const hs = heroShot(ph, exit, ctx);
    const heroClaims = hs.visible && heroBox.bottom > -vh * 0.6;
    if (heroClaims) {
      any = true;
      poseStone(stone, {
        x: hs.x + aim.x * 0.05,
        y: hs.y,
        z: hs.z,
        r: hs.r,
        spin: hs.spin + stoneDrift + aim.x * 0.07,
        tilt: hs.tilt + aim.y * -0.05,
      });

      // The reflection: mirrored about the fixed glass plane, squashed, and
      // extinguished as the stone dives down to meet it. A machine that has
      // degraded twice has already given the mirror up for good.
      const mFade = degraded >= 2 ? 0 : clamp01(1 - hs.dive * 1.7);
      if (mFade > 0.003) {
        mirror.holder.visible = true;
        mirror.holder.position.set(
          hs.x + aim.x * 0.05,
          hs.floor - (hs.y - hs.floor) * MIRROR_SQUASH,
          hs.z
        );
        mirror.holder.scale.set(hs.r, -hs.r * MIRROR_SQUASH, hs.r);
        mirror.holder.rotation.set(
          -(hs.tilt + aim.y * -0.05),
          -(hs.spin + stoneDrift + aim.x * 0.07),
          0
        );
        mirrorInside.opacity = 0.22 * mFade;
        mirrorSurface.opacity = 0.4 * mFade;
      } else {
        mirror.holder.visible = false;
      }
    } else {
      mirror.holder.visible = false;
    }

    // The bands.
    const shots = [bandShot(0, pf, ride, ctx), bandShot(1, pf, ride, ctx)];
    [gold, plat].forEach((m, i) => {
      const s = shots[i];
      m.holder.visible = s.visible;
      if (!s.visible) return;
      any = true;
      m.drift += IDLE_BAND * dt;
      // Sway about the rest, never through it — a plain band turned steadily
      // would sooner or later stand edge-on, the one forbidden pose.
      const idle = Math.sin(m.drift * 1.4) * 0.06 * (s.sway || 0);
      m.holder.position.set(s.x + aim.x * 0.05, s.y, s.z);
      m.holder.scale.setScalar(s.scale);
      m.holder.rotation.x = s.tilt + aim.y * -0.05;
      m.spinner.rotation.y = s.spin + idle + aim.x * 0.07;
    });

    // The bench.
    const bench = craftPlay();
    if (bench.any) any = true;
    if (!heroClaims) {
      if (bench.stone && !bench.stone.locked) {
        poseStone(stone, bench.stone);
        any = true;
      } else if (!bench.stone) {
        stone.holder.visible = false;
      } else {
        any = true; // locked: craftPlay already posed it
      }
    }

    /* The aura — the pool of light the CSS paints behind the stone — follows
       its true position in hero-local coordinates, and dies with the dive. */
    const ax = Math.round(50 + (hs.x / Math.max(1e-3, ctx.worldW)) * 100);
    const ay = Math.round(
      ((height * (0.5 - hs.y / VISIBLE_HEIGHT) - heroBox.top) /
        Math.max(1, heroBox.height)) *
        100
    );
    const ao = heroClaims ? Math.round((1 - hs.dive) * 100) / 100 : 0;
    if (ax !== auraShown.x || ay !== auraShown.y || ao !== auraShown.o) {
      auraShown.x = ax;
      auraShown.y = ay;
      auraShown.o = ao;
      lamp.style.setProperty("--rx", ax + "%");
      lamp.style.setProperty("--ry", ay + "%");
      lamp.style.setProperty("--ra", ao);
    }

    /* Exposure: steady, except the two bench moments that earn a lift — the
       casting flash (the flask opened) and a smaller gleam as the polish
       lands. Both are functions of scroll, so they replay in reverse. */
    let expose = EXPOSURE;
    if (bench.any) {
      const bb2 = build.getBoundingClientRect();
      const p2 = clamp01(-bb2.top / Math.max(1, bb2.height - vh));
      const flash = Math.sin(Math.PI * seg(p2, 0.42, 0.56)) ** 2;
      const gleam = Math.sin(Math.PI * seg(p2, 0.86, 0.98)) ** 2;
      expose = EXPOSURE + flash * 0.55 + gleam * 0.16;
    }
    if (Math.abs(expose - exposureShown) > 0.004) {
      exposureShown = expose;
      renderer.toneMappingExposure = expose;
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
      // — half the gem cost for far less than half the look. The reflection
      // goes with it: on a machine this pressed, a mirror is a luxury.
      scene.traverse((o) => {
        if (o.material === materials.gemInside) o.visible = false;
      });
      mirror.holder.visible = false;
      mirrorInside.opacity = 0;
      mirrorSurface.opacity = 0;
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
         the fade, then the loop stops entirely — the paper chapter of the
         page runs on zero GPU. The scroll listener below is what rehires. */
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

  /* Wakes the loop only when a scene could actually be on screen — three
     rectangle reads on a passive listener, nothing else. */
  function onScroll() {
    if (raf || document.hidden) return;
    const h = hero.getBoundingClientRect();
    const f = fitting.getBoundingClientRect();
    const c = build ? build.getBoundingClientRect() : null;
    if (
      h.bottom > -vh * 0.6 ||
      (f.top < vh && f.bottom > -vh * 0.2) ||
      (c && c.top < vh && c.bottom > -vh * 0.25)
    ) {
      start();
    }
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
      craftWax.dispose();
      craftGold.dispose();
      mirrorInside.dispose();
      mirrorSurface.dispose();
      environment.dispose();
      gemEnvironment.dispose();
      renderer.dispose();
    },
  };
}
