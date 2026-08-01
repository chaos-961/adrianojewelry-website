/* Adriano Jewelry, the landing journey.
 *
 * One scroll drives one continuous shot. The page opens on the closed ring
 * box in its dark room; scrolling turns the box to face the reader, opens
 * the lid under its own lamp, lifts the ring out while the box leaves the
 * frame, lifts the stone out of its claws while the ring leaves the other
 * way, closes right in on the turning brilliant, and then passes through
 * its table into a white crystalline room where the store's finished pieces
 * drift by. Scrolling on brings the black back and hands over to the
 * finale and the footer, which are ordinary flowing content below the
 * track.
 *
 * Everything visual is a pure function of one number, the reader's way
 * through the track (0 to 1), so the film runs forward and backward at
 * whatever speed the thumb sets and a deep link can open the page on any
 * frame of it. The only time-driven motions are three politenesses: the
 * closed box teasing its lid at the top, the lifted stone's slow idle turn,
 * and the loader. Reduced motion stills all three and drops the scroll
 * smoothing, leaving a film you pull through by hand.
 *
 * The props come from assets/js/models/ and are placed flat at the top of
 * the scene rather than nested inside each other, because pieces that part
 * ways mid-story cannot live in each other's transforms. The box computes
 * where the ring sits (its module owns that arithmetic); this stage mirrors
 * the seat, the girdle plane and the lift with plain translations, and the
 * three props never disagree because every number is read from their
 * published metrics.
 *
 * Deep links, also the visual QA rig:
 *   ?p=0.42        hold the film at that progress, no scroll, no clocks
 *   ?spin=25       freeze the stone's own turn at that angle (degrees)
 *   ?prop=ring     the solitaire alone in the room, ?prop=diamond the stone
 *   ?turn=-30      with ?prop: orbit the standalone prop (degrees)
 *   ?flat=1        the painted marque, flat
 *   ?ledx / ?ledshadow  lamp debug, passed through to the box
 *
 * Rendering only happens while something moves; a held frame costs nothing.
 * WebGL2 is required (three r185). Without it the journey collapses to a
 * quiet fallback card and the page continues as flowing content. With
 * JavaScript off, nothing here exists at all and the page is the
 * footer-only page it has been since v0.2.1.
 */

import * as THREE from "./vendor/three.module.min.js";
import { createRingBox, drawMarque } from "./models/ring-box.js";
import { createSolitaireRing } from "./models/solitaire-ring.js";
import { createBrilliantDiamond } from "./models/brilliant-diamond.js";
import { JEWELRY } from "./jewelry-manifest.js";

(function () {
  "use strict";

  const journey = document.getElementById("journey");
  const pin = document.getElementById("journey-pin");
  const canvas = document.getElementById("stage-canvas");
  const veil = document.getElementById("veil");
  const galleryEl = document.getElementById("gallery");
  const loaderEl = document.getElementById("loader");
  const loaderFill = document.getElementById("loader-fill");
  const nav = document.getElementById("nav");
  const cue = document.getElementById("cue");
  const fallbackEl = document.getElementById("stage-fallback");
  const finale = document.getElementById("finale");
  if (!journey || !pin || !canvas || !veil || !loaderEl || !nav) return;

  const params = new URLSearchParams(location.search);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const smooth = (t) => t * t * (3 - 2 * t);
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIn3 = (t) => t * t * t;

  /* Deterministic scatter for the gallery, the same seed every visit. */
  function rng(seedIn) {
    let a = seedIn >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function retireLoader() {
    loaderEl.classList.add("is-done");
    nav.classList.add("is-boot");
  }

  /* The finale must never depend on the film: every early-return path
   * (marque flat, missing WebGL2, standalone props, ?end) reveals it
   * directly, and the ordinary path hands it to an IntersectionObserver so
   * it settles in as the reader arrives. */
  function revealFinale() {
    if (finale) finale.classList.add("is-in");
  }

  function webgl2Ok() {
    if (!window.WebGL2RenderingContext) return false;
    try {
      const probe = document.createElement("canvas").getContext("webgl2");
      if (probe) {
        const lose = probe.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
      return !!probe;
    } catch (e) {
      return false;
    }
  }

  // ?flat=1: the model's marque alone, for checking the artwork.
  if (params.get("flat") === "1") {
    const art = drawMarque();
    canvas.replaceWith(art);
    art.className = "journey__canvas is-ready";
    art.style.objectFit = "contain";
    art.style.position = "absolute";
    art.style.inset = "0";
    art.style.width = "100%";
    art.style.height = "100%";
    journey.style.height = "100svh";
    retireLoader();
    revealFinale();
    return;
  }

  // ?end=1: the finale and the footer alone, at the top of the page. The
  // only way to photograph what lives fifteen screens down, since headless
  // virtual time never rasters a scrolled viewport.
  if (params.get("end") === "1") {
    journey.style.display = "none";
    retireLoader();
    revealFinale();
    return;
  }

  if (!webgl2Ok()) {
    journey.classList.add("is-fallback");
    fallbackEl.hidden = false;
    retireLoader();
    revealFinale();
    return;
  }

  /* ------------------------------------------------------------ the studio */

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  /* Shadows are re-rendered only on frames where something they depend on
   * moved. The expensive steady states (the solo stone turning over an
   * empty floor, the crystal room) redraw no shadow texels at all. */
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.08, 80);

  setLoad(0.3);

  /* An HDRI's job done by five emissive cards and a floor, run through
   * PMREM: a big soft key high left, a tall strip right for the long
   * highlight down a satin side, low fills so black plastic never falls to
   * a void, paper underfoot. */
  {
    const studio = new THREE.Scene();
    const card = (wc, hc, x, y, z, level) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(wc, hc),
        new THREE.MeshBasicMaterial()
      );
      m.material.color.setScalar(level);
      m.position.set(x, y, z);
      m.lookAt(0, 0.6, 0);
      studio.add(m);
    };
    card(10, 7, -4, 8, 5, 3.4); // key
    card(1.7, 8, 7.2, 3.5, -1.6, 5.2); // right strip
    card(5, 4, -7, 2.4, 1.6, 1.5); // left fill
    card(7, 2.4, 0, 1.1, 8, 1.3); // front fill
    card(6, 4, 0, 4, -8, 0.7); // back
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 40),
      new THREE.MeshBasicMaterial()
    );
    floor.material.color.setScalar(0.85);
    floor.rotation.x = -Math.PI / 2;
    studio.add(floor);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(studio, 0.04).texture;
    pmrem.dispose();
  }

  /* The room. Dark, and no cast shadow on the ground: every glow and pool
   * belongs to the box's own lamp and lives in the model. The fog lets the
   * floor's far edge disappear instead of drawing a horizon. */
  scene.background = new THREE.Color(0x060607);
  scene.fog = new THREE.Fog(0x060607, 15, 42);
  if ("environmentIntensity" in scene) scene.environmentIntensity = 0.65;
  {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0b0b0c,
        roughness: 0.95,
        metalness: 0,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
  }

  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.position.set(-5.5, 8.5, -1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -7;
  key.shadow.camera.right = key.shadow.camera.top = 7;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 26;
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xf2f4f8, 0.32);
  fill.position.set(5.5, 3, 2);
  scene.add(fill);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
  rimLight.position.set(3.5, 4, -5);
  scene.add(rimLight);

  setLoad(0.5);

  /* ---------------------------------------------------- the standalone rig */

  /* ?prop=ring and ?prop=diamond: one prop alone in the room, full frame,
   * with ?turn and ?tilt orbiting it. The live check that a prop really is
   * independent of the story it usually stars in. */
  const prop = params.get("prop");
  if (prop === "ring" || prop === "diamond") {
    const model =
      prop === "ring"
        ? createSolitaireRing({ renderer, standing: true })
        : createBrilliantDiamond({ renderer, standing: true });
    scene.add(model.root);
    journey.style.height = "100svh";
    const yawS = ((parseFloat(params.get("turn")) || -24) * Math.PI) / 180;
    const tiltS = ((parseFloat(params.get("tilt")) || 16) * Math.PI) / 180;
    const spinS = ((parseFloat(params.get("spin")) || 0) * Math.PI) / 180;
    const drawStandalone = () => {
      const w = pin.clientWidth;
      const h = pin.clientHeight;
      renderer.shadowMap.needsUpdate = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const f = model.framing({ open: 0, lift: 0 });
      const vHalf = (camera.fov * Math.PI) / 360;
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      const dist = (f.cr / Math.sin(Math.min(vHalf, hHalf))) * 1.03;
      const cp = Math.cos(tiltS);
      camera.position.set(
        Math.sin(yawS) * dist * cp,
        f.cy + Math.sin(tiltS) * dist,
        Math.cos(yawS) * dist * cp
      );
      camera.lookAt(0, f.cy, 0);
      model.update({ lit: 1, spin: spinS, eye: camera.position, reveal: 1 });
      renderer.render(scene, camera);
      canvas.classList.add("is-ready");
    };
    drawStandalone();
    // A second pass after the compile hitch, so the first visible frame is
    // the settled one.
    requestAnimationFrame(drawStandalone);
    window.addEventListener("resize", drawStandalone);
    retireLoader();
    revealFinale();
    return;
  }

  /* -------------------------------------------------------------- the cast */

  /* Flat at the top of the scene, so any piece can leave without carrying
   * another with it. The ring is built bare (its head still cut for the
   * stone), the stone is built to the diameter the ring publishes, and the
   * box is handed the ring for its seat arithmetic without taking it. */
  const ring = createSolitaireRing({ renderer, bare: true });
  const stone = createBrilliantDiamond({
    renderer,
    diameter: ring.metrics.stone.diameter,
  });
  const box = createRingBox({
    renderer,
    ring,
    debug: {
      ledx: params.get("ledx"),
      ledshadow: params.get("ledshadow"),
    },
  });
  scene.add(box.root);
  scene.add(ring.root);
  scene.add(stone.root);

  const SEAT = box.metrics.seatY;
  const GIRDLE = ring.metrics.stone.girdleY;
  const S_LIFT = ring.metrics.stone.lift;
  const RING_RISE = 2.0; // how far the ring stands out of the box
  const RING_Y_UP = SEAT + RING_RISE;
  const STONE_Y = RING_Y_UP + GIRDLE + S_LIFT; // the solo stone's girdle height

  setLoad(0.72);

  /* ------------------------------------------------------------- the beats */

  /* Visual ranges of the film. The text beats carry their own ranges in
   * their data attributes; these are the ranges the props and the camera
   * act on, and the two sets interleave rather than coincide. */
  const B = {
    turn: [0.075, 0.16], // the box comes round to face the reader
    open: [0.175, 0.26], // the lid stands, the lamp comes up with it
    ringUp: [0.285, 0.375], // the ring rises out of the slot
    boxOut: [0.36, 0.45], // the box leaves, stage left
    stoneUp: [0.44, 0.525], // the stone rises out of the claws
    ringOut: [0.545, 0.615], // the ring leaves, stage right
    solo: [0.615, 0.685], // the stone alone, turning
    enter: [0.685, 0.748], // the stone swells past the camera
    whiteIn: [0.728, 0.748], // the veil to white
    whiteOut: [0.752, 0.79], // the veil lifts inside
    inside: [0.748, 0.965], // the crystal room and the gallery
    collapse: [0.908, 0.962], // the white folds back to black
  };

  /* Camera keys: lookAt, orbit, distance, lens, how far the subject slides
   * off centre on a wide screen (sx), and the width of world that must stay
   * in frame however narrow the viewport gets (fitW). Everything between
   * keys is smoothstepped; the fit is enforced after interpolation, so a
   * phone simply stands further back instead of cropping the story. */
  const KEYS = [
    { p: 0.0, y: 2.15, yaw: 0.62, pit: 0.3, d: 17.5, fov: 30, sx: -2.3, fitW: 8.6 },
    { p: 0.1, y: 2.2, yaw: 0.3, pit: 0.26, d: 14.2, fov: 30, sx: -1.0, fitW: 8.2 },
    { p: 0.165, y: 2.25, yaw: 0.02, pit: 0.22, d: 11.6, fov: 30, sx: 0, fitW: 8.2 },
    { p: 0.27, y: SEAT + GIRDLE + 0.5, yaw: -0.06, pit: 0.38, d: 8.2, fov: 30, sx: 0, fitW: 7.6 },
    { p: 0.375, y: RING_Y_UP + 0.28, yaw: 0.1, pit: 0.2, d: 6.2, fov: 30, sx: 0, fitW: 3.6 },
    { p: 0.44, y: RING_Y_UP + 0.32, yaw: 0.16, pit: 0.2, d: 5.8, fov: 30, sx: 0, fitW: 3.4 },
    { p: 0.525, y: STONE_Y - 0.95, yaw: 0.24, pit: 0.28, d: 5.4, fov: 30, sx: 0, fitW: 3.5 },
    { p: 0.57, y: STONE_Y - 1.0, yaw: 0.32, pit: 0.3, d: 5.2, fov: 30, sx: 0, fitW: 3.4 },
    { p: 0.615, y: STONE_Y - 0.35, yaw: 0.4, pit: 0.44, d: 4.2, fov: 31, sx: 0, fitW: 2.6 },
    { p: 0.65, y: STONE_Y, yaw: 0.46, pit: 0.5, d: 2.35, fov: 32, sx: 0, fitW: 1.6 },
    { p: 0.705, y: STONE_Y, yaw: 0.56, pit: 0.62, d: 1.95, fov: 34, sx: 0, fitW: 1.3 },
    { p: 0.748, y: STONE_Y + 0.05, yaw: 0.66, pit: 0.95, d: 1.4, fov: 40, sx: 0, fitW: 0 },
  ];

  function cameraAt(p, aspect) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = smoother(seg(p, a.p, b.p));
    const widthK = clamp((aspect - 0.9) / 0.5, 0, 1);
    const sx = lerp(a.sx, b.sx, t) * widthK;
    const fitW = lerp(a.fitW, b.fitW, t);
    const fov = lerp(a.fov, b.fov, t);
    let d = lerp(a.d, b.d, t);
    const tanV = Math.tan((fov * Math.PI) / 360);
    if (fitW > 0) {
      // Half the named width, plus the off-centre slide, must fit across.
      const dNeed = (fitW / 2 + Math.abs(sx)) / (tanV * aspect);
      d = Math.max(d, dNeed);
    }
    // Portrait: the subject sits low so the words own the top of the frame.
    const portraitK = clamp((0.9 - aspect) / 0.45, 0, 1);
    const y = lerp(a.y, b.y, t) + portraitK * 0.15 * d;
    const yaw = lerp(a.yaw, b.yaw, t);
    const pit = lerp(a.pit, b.pit, t);
    const cp = Math.cos(pit);
    camera.fov = fov;
    camera.position.set(
      sx + Math.sin(yaw) * d * cp,
      y + Math.sin(pit) * d,
      Math.cos(yaw) * d * cp
    );
    camera.lookAt(sx, y, 0);
    camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------ inside the stone */

  /* The white room. A fullscreen shader rather than geometry: overlapping
   * families of facet planes in barely-off-white greys, hard edges carrying
   * a whisper of dispersion, a handful of drifting glints. The whole thing
   * is scrubbed by scroll (uK) so it turns as the reader moves and stands
   * dead still, deterministically, when they do; uOut folds it to black. */
  const inside = (() => {
    const iScene = new THREE.Scene();
    const iCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
    );
    const mat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uK: { value: 0 },
        uOut: { value: 0 },
        uA: { value: 1 },
      },
      vertexShader: [
        "varying vec2 vQ;",
        "void main() {",
        "  vQ = position.xy;",
        "  gl_Position = vec4(position.xy, 0.0, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "varying vec2 vQ;",
        "uniform float uK;",
        "uniform float uOut;",
        "uniform float uA;",
        "float hash(vec2 v) {",
        "  return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453);",
        "}",
        "void main() {",
        // Leaving, the facets rush past: the field zooms as it darkens.
        "  vec2 q = vec2(vQ.x * uA, vQ.y) * (1.0 + uOut * 0.85);",
        "  float lum = 0.945;",
        "  lum += 0.04 * (1.0 - smoothstep(0.0, 1.3, length(q)));",
        "  vec3 tint = vec3(0.0);",
        "  float seams = 0.0;",
        // Six families of parallel facet planes, each at its own angle and
        // scale, each sliding at its own rate as the reader scrolls. The
        // cells shade a few percent either way; the seams carry the light.
        "  for (int i = 0; i < 6; i++) {",
        "    float fi = float(i);",
        "    float ang = 0.897 * fi + uK * (0.22 + 0.09 * fi) * (mod(fi, 2.0) < 1.0 ? 1.0 : -1.0);",
        "    vec2 dir = vec2(cos(ang), sin(ang));",
        "    float s = dot(q, dir) * (1.05 + 0.42 * fi) + fi * 7.7 + uK * (1.3 + 0.5 * fi);",
        "    float cell = floor(s);",
        "    float f = fract(s);",
        "    float shade = (hash(vec2(cell, fi)) - 0.5) * 0.1;",
        "    float body = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.94, 1.0, f));",
        "    lum += shade * body / (1.0 + 0.35 * fi);",
        // The seam: a bright edge with red pulled one way and blue the
        // other, the same trick the stone's fire runs on, kept at a whisper.
        "    float edge = 1.0 - smoothstep(0.0, 0.045, min(f, 1.0 - f));",
        "    float e = edge * 0.12 / (1.0 + 0.5 * fi);",
        "    seams += e;",
        "    lum += e * 0.5;",
        "    tint += vec3(0.5 + 0.5 * sin(cell + fi), 0.5, 0.5 + 0.5 * cos(cell * 1.3 + fi)) * e * 0.07;",
        "  }",
        // Three slow glints, riding the scroll.
        "  for (int j = 0; j < 3; j++) {",
        "    float fj = float(j);",
        "    vec2 gp = vec2(sin(uK * 0.9 + fj * 2.1) * 0.72, cos(uK * 0.7 + fj * 1.7) * 0.55);",
        "    float dist2 = dot(q - gp, q - gp);",
        "    lum += exp(-dist2 * 340.0) * 0.4;",
        "  }",
        "  vec3 col = vec3(lum) + tint - vec3((tint.r + tint.g + tint.b) / 3.0);",
        // The way out: the room dims to its own seams, the lines of light
        // hold a moment longer, and then they go too. No shapes, no iris,
        // just a white room folding itself away.
        "  float body2 = (1.0 - uOut) * (1.0 - uOut);",
        "  float lines = seams * (1.0 - uOut) * 1.6 * smoothstep(0.0, 0.45, uOut);",
        "  col = col * body2 + vec3(lines);",
        "  gl_FragColor = vec4(col, 1.0);",
        "  #include <tonemapping_fragment>",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
    });
    const tri = new THREE.Mesh(geo, mat);
    tri.frustumCulled = false;
    iScene.add(tri);
    return { scene: iScene, cam: iCam, mat };
  })();

  /* ------------------------------------------------------------ the gallery */

  /* Three bands of pieces, far to near, seeded once so every visit scatters
   * the same way. The images get their src only when the reader is well on
   * the way in, so the film's first paint never waits on 74 files. */
  const BANDS = [
    { speed: 0.62, scale: 0.72, span: 2.1 },
    { speed: 1.0, scale: 1.0, span: 2.9 },
    { speed: 1.5, scale: 1.32, span: 3.6 },
  ];
  const bandEls = [];
  let galleryArmed = false;

  function buildGallery() {
    if (!galleryEl) return;
    const rand = rng(20260801);
    const frag = document.createDocumentFragment();
    const perBand = [[], [], []];
    JEWELRY.forEach((piece, i) => perBand[i % 3].push(piece));
    BANDS.forEach((band, bi) => {
      const el = document.createElement("div");
      el.className = "gallery__band";
      perBand[bi].forEach((piece, j) => {
        const item = document.createElement("div");
        item.className = "gallery__item";
        const img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.dataset.src = "assets/img/jewelry/" + piece.f;
        img.width = piece.w;
        img.height = piece.h;
        item.appendChild(img);
        // Laid out in fractions of the band's own travel; pixels arrive in
        // layoutGallery, which runs at boot and again on resize.
        item.dataset.x = (0.04 + rand() * 0.82).toFixed(4);
        item.dataset.t = ((j + rand() * 0.85) / perBand[bi].length).toFixed(4);
        item.dataset.w = (0.55 + rand() * 0.75).toFixed(3);
        item.dataset.r = ((rand() * 14 - 7) * (0.6 + 0.4 * band.scale)).toFixed(2);
        el.appendChild(item);
      });
      frag.appendChild(el);
      bandEls.push(el);
    });
    galleryEl.appendChild(frag);
  }

  function layoutGallery() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    BANDS.forEach((band, bi) => {
      const el = bandEls[bi];
      if (!el) return;
      const spanPx = band.span * h;
      el.dataset.span = String(spanPx);
      for (const item of el.children) {
        const base = clamp(w * 0.13, 64, 185) * band.scale;
        const wid = base * parseFloat(item.dataset.w);
        item.style.width = wid.toFixed(0) + "px";
        item.style.left =
          (parseFloat(item.dataset.x) * (w - wid)).toFixed(0) + "px";
        item.style.top =
          (parseFloat(item.dataset.t) * spanPx).toFixed(0) + "px";
        item.style.transform = "rotate(" + item.dataset.r + "deg)";
      }
    });
  }

  function armGallery() {
    if (galleryArmed) return;
    galleryArmed = true;
    for (const img of galleryEl.querySelectorAll("img[data-src]")) {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    }
  }

  buildGallery();

  /* ------------------------------------------------------------ text beats */

  const beats = [];
  for (const el of document.querySelectorAll(".beat[data-a]")) {
    beats.push({
      el,
      a: parseFloat(el.dataset.a),
      b: parseFloat(el.dataset.b),
      hero: el.id === "beat-hero",
      k: -1,
      on: null,
    });
  }

  /* The beats are never display- or visibility-gated: their lines compute
   * opacity 0 outside their windows, which keeps the whole story readable
   * to a screen reader in order while costing the eye nothing. Crossing
   * out of a window snaps --k to its exact end so no line parks at 99.8%
   * gone. */
  function driveBeats(p, introK) {
    for (const beat of beats) {
      let k = seg(p, beat.a, beat.b);
      if (beat.hero) k = Math.max(k, 0.35 * smooth(introK));
      const on = k > 0.001 && k < 0.999;
      if (on !== beat.on) {
        beat.on = on;
        if (!on) {
          const snap = k <= 0.001 ? "0" : "1";
          beat.el.style.setProperty("--k", snap);
          beat.k = +snap;
        }
      }
      if (on && Math.abs(k - beat.k) > 0.0015) {
        beat.el.style.setProperty("--k", k.toFixed(3));
        beat.k = k;
      }
    }
  }

  /* ------------------------------------------------------- progress, clocks */

  const held = params.has("p");
  const heldP = clamp(parseFloat(params.get("p")) || 0, 0, 1);
  const spinHeld = params.has("spin")
    ? ((parseFloat(params.get("spin")) || 0) * Math.PI) / 180
    : null;

  let pTarget = held ? heldP : 0;
  let pDrawn = pTarget;
  let introK = held ? 1 : 0;
  let introT0 = 0;
  let loaderDone = false;
  let scrolledOnce = false;
  let idleTurn = 0; // the stone's own accumulated turn, radians
  let viewW = 1;
  let viewH = 1;
  let trackLen = 1;

  // The tease: the shut box cracking its lid at the top of the page. Timer
  // driven, so the renderer sleeps between pulses exactly as it always has.
  let teaseTimer = 0;
  let teaseT0 = -1;
  const TEASE_EVERY = 5200;
  const TEASE_LEN = 620;
  function armTease(delay) {
    clearTimeout(teaseTimer);
    if (held || reduceMotion.matches) return;
    teaseTimer = setTimeout(() => {
      // Re-checked at fire time as well as arm time: the OS can flip
      // reduced motion while a timer is pending (battery savers do).
      if (
        pTarget < 0.02 &&
        !document.hidden &&
        loaderDone &&
        !reduceMotion.matches
      ) {
        teaseT0 = performance.now();
        wake();
      }
      armTease(TEASE_EVERY);
    }, delay);
  }

  // The cue: only if four seconds pass at the top without a scroll.
  let cueTimer = 0;
  function armCue() {
    if (held) return;
    cueTimer = setTimeout(() => {
      if (!scrolledOnce && pTarget < 0.01) {
        cue.hidden = false;
        requestAnimationFrame(() => cue.classList.add("is-shown"));
      }
    }, 4000);
  }
  function retireCue() {
    clearTimeout(cueTimer);
    if (!cue.hidden) cue.classList.add("is-gone");
  }

  /* --------------------------------------------------------------- the film */

  const eyeV = new THREE.Vector3();

  function filmAt(p, now, dt) {
    const aspect = viewW / viewH;

    // The box.
    const turnK = smooth(seg(p, B.turn[0], B.turn[1]));
    const outK = easeIn3(seg(p, B.boxOut[0], B.boxOut[1]));
    const open = smooth(seg(p, B.open[0], B.open[1]));
    let boxYaw = 0.62 * (1 - turnK) - 0.35 * outK;
    box.root.rotation.y = boxYaw;
    box.root.position.x = -11 * outK;

    // The tease leans on the lid without ever owning the state.
    let teaseOpen = 0;
    let teaseLit = 0;
    let teasing = false;
    if (teaseT0 >= 0) {
      const tt = (now - teaseT0) / TEASE_LEN;
      if (tt < 1) {
        const env = Math.sin(Math.PI * tt);
        const heroW = 1 - seg(p, 0.008, 0.03);
        teaseOpen = 0.042 * env * heroW;
        teaseLit = 0.55 * env * heroW;
        teasing = true;
      } else {
        teaseT0 = -1;
      }
    }

    // The lamp follows the lid; its glow leaves with the box.
    const lit = Math.max(open * (1 - seg(p, B.boxOut[1] - 0.02, B.boxOut[1] + 0.03)), teaseLit);
    const openNow = Math.max(open, teaseOpen);

    // The ring.
    const riseK = smooth(seg(p, B.ringUp[0], B.ringUp[1]));
    const ringOutK = easeIn3(seg(p, B.ringOut[0], B.ringOut[1]));
    const freeTurn = 1.15 * smooth(seg(p, B.ringUp[0], B.stoneUp[1]));
    const ringY = SEAT + RING_RISE * riseK;
    // Carried off, not teleported: it slides right and settles as it goes.
    ring.root.position.set(9 * ringOutK, ringY - 0.5 * ringOutK, 0);
    // Seated, the ring turns with the box that holds it; risen, it takes
    // over its own presentation turn from the same angle.
    const ringYaw = boxYaw + freeTurn;
    ring.root.rotation.y = ringYaw;

    // The stone. Never anything but x = 0: it is the one piece that stays.
    const liftK = smooth(seg(p, B.stoneUp[0], B.stoneUp[1]));
    const enterK = seg(p, B.enter[0], B.enter[1]);
    const scale = 1 + 44 * easeIn3(enterK);
    stone.root.position.set(0, ringY + GIRDLE + S_LIFT * liftK, 0);
    stone.root.scale.setScalar(scale);

    // Its own turn: scrubbed by scroll for everyone, idling on the clock at
    // full lift for those who allow motion, and settling to the nearest
    // eighth on the way back down so the claws land on the bezel facets.
    const g = smooth(seg(liftK, 0.55, 1));
    if (!held && !reduceMotion.matches && g > 0.999 && p < B.enter[1]) {
      idleTurn = (idleTurn + dt * 0.45) % (Math.PI * 2);
    }
    const EIGHTH = Math.PI / 4;
    const settled = Math.round(idleTurn / EIGHTH) * EIGHTH;
    const scrubTurn = 2.3 * seg(p, B.solo[0], B.enter[1]);
    let stoneSpin = ringYaw + scrubTurn + lerp(settled, idleTurn, g);
    if (spinHeld !== null) stoneSpin = spinHeld;

    // The lens goes first: the stone's flare is asked about this frame's
    // eye, not the last one's. Exposure swells on the way into the stone
    // and comes back down as the white room folds away, or the collapse
    // would sit at grey instead of reaching black.
    cameraAt(p, aspect);
    const collapseK = smooth(seg(p, B.collapse[0], B.collapse[1]));
    renderer.toneMappingExposure = Math.max(
      0.2,
      1.12 + 1.0 * easeIn3(enterK) - 1.9 * collapseK
    );

    // Lighting and reveal, exactly the numbers the box would have used.
    const boxReveal = THREE.MathUtils.smoothstep(openNow, 0.02, 0.3);
    const ringLit = Math.max(lit * boxReveal, riseK);
    const stoneLit = Math.max(ringLit, liftK);
    const reveal = Math.max(boxReveal, riseK);

    eyeV.copy(camera.position);
    const eyeOk = enterK < 0.12 ? eyeV : null;
    box.update({ open: openNow, lit, eye: eyeV });
    ring.update({ lit: ringLit });
    stone.update({ lit: stoneLit, spin: stoneSpin, reveal, eye: eyeOk });

    // The veil in, the veil out, and the vignette handed off with them.
    const veilK =
      smooth(seg(p, B.whiteIn[0], B.whiteIn[1])) *
      (1 - smooth(seg(p, B.whiteOut[0], B.whiteOut[1])));
    veil.style.opacity = veilK.toFixed(3);
    pin.style.setProperty(
      "--vig",
      (1 - smooth(seg(p, B.enter[0], B.whiteIn[1]))).toFixed(3)
    );

    // Which world the canvas shows. Past the collapse the crystal renders
    // itself black, which is exactly the ground the finale stands on.
    const isInside = p >= B.inside[0];
    if (isInside) {
      inside.mat.uniforms.uK.value = p * 34;
      inside.mat.uniforms.uOut.value = smooth(seg(p, B.collapse[0], B.collapse[1]));
      inside.mat.uniforms.uA.value = aspect;
      renderer.render(inside.scene, inside.cam);
    } else {
      renderer.render(scene, camera);
    }

    // The gallery rides the inside stretch, and dims out with the room
    // rather than floating over the black that follows it.
    const galleryOn = p > B.whiteIn[0] && p < B.collapse[0] + 0.024;
    if (galleryEl) {
      galleryEl.classList.toggle("is-on", galleryOn);
      if (galleryOn) {
        const ik = seg(p, B.inside[0] + 0.01, B.collapse[0] + 0.02);
        galleryEl.style.opacity = (1 - smooth(seg(p, B.collapse[0], B.collapse[0] + 0.022))).toFixed(3);
        BANDS.forEach((band, bi) => {
          const el = bandEls[bi];
          if (!el) return;
          const spanPx = parseFloat(el.dataset.span) || 0;
          const y = viewH * 1.06 - ik * band.speed * (spanPx + viewH * 1.5);
          el.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)";
        });
      }
    }

    // The chrome that answers the film: ink from the moment the veil turns
    // the world white to the moment the crystal folds away.
    nav.classList.toggle("nav--ink", p > B.whiteIn[1] - 0.006 && p < B.collapse[0] + 0.028);

    return teasing;
  }

  /* ------------------------------------------------------------- the loop */

  let queued = false;
  let lastFrame = 0;

  function wake() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frameStep);
  }

  function frameStep(t) {
    queued = false;
    const dt = Math.min((t - lastFrame) / 1000 || 0.016, 0.05);
    lastFrame = t;

    // Self-heal the buffer: some embedded viewers resize without an event.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(pin.clientWidth * dpr)) resize();

    if (!held && introT0 && introK < 1) {
      // The hero's entrance is a clock, so reduced motion skips it whole.
      introK = reduceMotion.matches ? 1 : clamp((t - introT0) / 1150, 0, 1);
    }

    const before = pDrawn;
    if (reduceMotion.matches || held) {
      pDrawn = pTarget;
    } else {
      pDrawn += (pTarget - pDrawn) * (1 - Math.exp(-dt * 7));
      if (Math.abs(pTarget - pDrawn) < 0.00005) pDrawn = pTarget;
    }

    // Shadows only re-render when the props could have moved against the
    // lights: any progress change, or the tease leaning on the lid.
    if (pDrawn !== before || teaseT0 >= 0) renderer.shadowMap.needsUpdate = true;

    const teasing = filmAt(pDrawn, t, dt);
    driveBeats(pDrawn, introK);

    if (!canvas.classList.contains("is-ready")) {
      canvas.classList.add("is-ready");
      if (!loaderDone) finishLoader(t);
    }

    const soloLive =
      !held &&
      !reduceMotion.matches &&
      pDrawn > B.stoneUp[1] &&
      pDrawn < B.enter[1] - 0.001 &&
      pDrawn > B.stoneUp[0];
    const settling = pDrawn !== pTarget;
    const introLive = !held && introT0 && introK < 1;
    if (settling || teasing || soloLive || introLive) wake();
  }

  /* ------------------------------------------------------------- the boot */

  function setLoad(v) {
    if (loaderFill) loaderFill.style.transform = "scaleX(" + v + ")";
  }

  let shownAt = performance.now();
  function finishLoader() {
    loaderDone = true;
    setLoad(1);
    // The bar is allowed its moment even on a machine that needed none.
    const wait = Math.max(0, 850 - (performance.now() - shownAt));
    setTimeout(() => {
      retireLoader();
      introT0 = performance.now();
      armTease(2600);
      armCue();
      wake();
    }, wait);
  }

  function resize() {
    viewW = pin.clientWidth;
    viewH = pin.clientHeight;
    if (!viewW || !viewH) return;
    trackLen = Math.max(journey.offsetHeight - viewH, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    layoutGallery();
    // The track's length just changed under a scroll position that did not:
    // re-derive progress now, or a rotated phone draws the wrong frame
    // until its reader happens to scroll.
    readScroll();
    wake();
  }

  function readScroll() {
    if (held) return;
    const y = window.scrollY || 0;
    const next = clamp(y / trackLen, 0, 1);
    if (!scrolledOnce && y > 2) {
      scrolledOnce = true;
      retireCue();
      // A reader on the move has no need of a nudge from the box either.
      clearTimeout(teaseTimer);
      armTease(9000);
    }
    // Scrolling the finale and the footer keeps firing this with the film
    // already parked at 1; nothing on the canvas can change, so the
    // renderer is left asleep.
    if (next === pTarget) return;
    pTarget = next;
    if (pTarget >= 0.5) armGallery();
    wake();
  }

  // The nav hides on the way down and returns on the way up.
  let lastNavY = 0;
  function navScroll() {
    const y = window.scrollY || 0;
    const dy = y - lastNavY;
    if (Math.abs(dy) > 6) {
      if (y < 60) nav.classList.remove("is-hidden");
      else nav.classList.toggle("is-hidden", dy > 0);
      lastNavY = y;
    }
  }

  if (!held) {
    window.addEventListener("scroll", () => {
      readScroll();
      if (loaderDone) navScroll();
    }, { passive: true });
  } else {
    // A held frame: the loader never shows, the pose never moves, and the
    // clocks stand down for the life of the page. The camera is the reader.
    loaderDone = true;
    retireLoader();
    if (heldP >= 0.5) armGallery();
    document.documentElement.style.overflow = "hidden";
  }

  if (finale && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            finale.classList.add("is-in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 }
    );
    io.observe(finale);
  } else if (finale) {
    finale.classList.add("is-in");
  }

  new ResizeObserver(resize).observe(pin);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake();
  });
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
  canvas.addEventListener("webglcontextrestored", wake);
  reduceMotion.addEventListener("change", () => {
    // Flipping it on cancels any tease in flight; flipping it off gives the
    // chain back its life (armTease self-terminates while it holds).
    teaseT0 = -1;
    if (loaderDone && !held) armTease(reduceMotion.matches ? 0 : 2600);
    wake();
  });

  /* Warm the pipeline before the first visible frame: the stone's two
   * shader passes and the crystal room would otherwise compile mid-story,
   * and a compile is a visible hitch on the one scroll it interrupts. */
  stone.update({ lit: 1, spin: 0, reveal: 1, eye: null });
  renderer.compile(scene, camera);
  renderer.compile(inside.scene, inside.cam);

  setLoad(0.86);
  resize();
  readScroll();
  // A page restored mid-track opens on that frame rather than replaying
  // the whole film at it.
  pDrawn = pTarget;
  wake();
})();
