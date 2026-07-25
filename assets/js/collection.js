/* ==========================================================================
   collection.js — the 3D collection viewer on the home page.

   Progressive enhancement, strictly. The section ships as a readable list of
   the collection in index.html; this file upgrades that list into a tablist
   driving a WebGL stage. If the module never runs, if WebGL is unavailable, or
   if the models fail to load, the list stays exactly as authored.

   Loading is deliberate about weight:
     · three.js is not fetched until the section is near the viewport
     · one model is fetched at a time, on selection, then cached
   So the home page costs nothing extra until someone scrolls to it.

   Loaded as type="module" — no build step, imports resolve via the importmap
   in index.html.
   ========================================================================== */

import {
  gemEnvironment,
  studioEnvironment,
  createMaterials,
  createStand,
  dressPiece,
} from "./jewel-shading.js";

const MODEL_BASE = "assets/models/";

/* How far the drag may tip the arrangement, in radians. The framing allows for
   it, so the two have to agree — hence one constant rather than two literals. */
const PITCH_LIMIT = 0.6;

/* Sat very slightly forward at rest, the way a piece sits in a counter
   display, rather than dead level with the lens. */
const PITCH_REST = 0.13;

/* Piece descriptions are authored in the HTML, not here. This module only
   needs to know which file backs each entry, which comes off data-model. */

let THREE = null;
let GLTFLoader = null;

const state = {
  root: null,
  stage: null,
  canvas: null,
  status: null,
  items: [],
  current: -1,
  booting: null,
  failed: false,
  cache: new Map(),
  loading: null,
};

/* ---- Utilities ----------------------------------------------------------- */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGL2RenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch (err) {
    return false;
  }
}

function setStatus(text, busy) {
  if (!state.status) return;
  state.status.textContent = text || "";
  state.stage.classList.toggle("is-loading", !!busy);
}

/* ---- Renderer ------------------------------------------------------------ */

const view = {
  renderer: null,
  scene: null,
  camera: null,
  pivot: null,   // the drag rotates this
  rig: null,     // inside the pivot: the stand, plus the piece sat on it
  stand: null,
  piece: null,   // the loaded scene, kept so a resize can re-frame it
  mats: null,
  radius: 1,
  yaw: 0,
  pitch: 0,
  spin: 0,
  dragging: false,
  raf: 0,
  needs: true,
  onScreen: true,
};

function buildView() {
  const renderer = new THREE.WebGLRenderer({
    canvas: state.canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = studioEnvironment(THREE, pmrem, darkScheme.matches);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8b7f6d, 0.45));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.35);
  key.position.set(3, 6, 7);
  scene.add(key);
  const fillLight = new THREE.DirectionalLight(0xdce6ff, 0.55);
  fillLight.position.set(-6, 2, 4);
  scene.add(fillLight);
  const rim = new THREE.DirectionalLight(0xffe2b8, 0.7);
  rim.position.set(-2, 4, -8);
  scene.add(rim);

  /* pivot turns with the drag; rig holds the stand and the piece together so
     the whole arrangement tips as one object rather than the piece sliding
     off its plinth halfway through a pitch. */
  const pivot = new THREE.Group();
  const rig = new THREE.Group();
  pivot.add(rig);
  scene.add(pivot);

  view.renderer = renderer;
  view.scene = scene;
  view.camera = camera;
  view.pivot = pivot;
  view.rig = rig;

  view.mats = createMaterials(THREE, gemEnvironment(THREE, pmrem));
  view.stand = createStand(THREE, view.mats.gold);
  rig.add(view.stand.group);

  resize();
}

function resize() {
  if (!view.renderer) return;
  const rect = state.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  view.renderer.setSize(w, h, false);
  view.camera.aspect = w / h;
  view.camera.updateProjectionMatrix();
  /* The fit depends on the aspect ratio, so a resize has to re-frame or the
     piece clips when the layout goes from one column to two. */
  if (view.piece) frame(view.piece);
  view.needs = true;
}

/* Sits the piece on the plinth and fits the pair to the frame.

   Fits vertically and horizontally rather than to the bounding sphere, which
   wastes a lot of frame on the flat pieces. The arrangement spins about Y, so
   the horizontal half-extent has to be the diagonal of the X/Z footprint or it
   would clip halfway through a turn. */
function frame(object) {
  object.position.set(0, 0, 0);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());

  /* Centred across, and resting on y = 0 rather than centred on it, because
     the stand is built downwards from that plane. */
  object.position.set(-centre.x, -box.min.y, -centre.z);

  const footprint = Math.hypot(size.x / 2, size.z / 2);
  const drop = view.stand.fit(footprint, 0);

  /* Everything from the base of the plinth to the top of the piece, recentred
     so the drag turns the arrangement about its own middle. */
  const total = size.y + drop;
  view.rig.position.y = -(size.y - drop) / 2;

  /* Horizontal extent is the swept radius, since the arrangement turns about
     Y and the plinth is wider than the piece it carries. */
  const rH = Math.max(footprint, view.stand.radius);
  const halfY = total / 2;

  /* Vertical has to allow for the tilt as well: rolled fully forward, part of
     the swept radius is presented vertically. Framing for the upright pose
     alone is what was cropping the top off a ring the moment it was tipped. */
  const rV = Math.max(
    halfY,
    rH * Math.sin(PITCH_LIMIT) + halfY * Math.cos(PITCH_LIMIT)
  );
  view.radius = Math.max(rV, rH);

  const fovV = (view.camera.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * view.camera.aspect);
  const dist =
    Math.max(rV / Math.tan(fovV / 2), rH / Math.tan(fovH / 2)) * 1.08;

  view.camera.position.set(0, 0, dist);
  view.camera.lookAt(0, 0, 0);
  view.camera.near = Math.max(dist - view.radius * 4, 0.02);
  view.camera.far = dist + view.radius * 8;
  view.camera.updateProjectionMatrix();
}

function tick() {
  view.raf = requestAnimationFrame(tick);
  if (!view.pivot) return;

  const idle = !view.dragging && !reduceMotion.matches;
  if (idle) {
    view.spin += 0.0032;
    view.needs = true;
  }
  if (!view.needs) return;
  view.needs = false;

  view.pivot.rotation.set(view.pitch, view.yaw + view.spin, 0);
  view.renderer.render(view.scene, view.camera);
}

function startLoop() {
  /* Both the visibility observer and visibilitychange can ask to resume, so
     the section being off-screen has to veto or showing the tab would spin the
     loop for a section nobody is looking at. */
  if (view.raf || !view.onScreen || document.hidden) return;
  tick();
}

function stopLoop() {
  if (view.raf) cancelAnimationFrame(view.raf);
  view.raf = 0;
}

/* ---- Model loading ------------------------------------------------------- */

async function show(index) {
  const item = state.items[index];
  if (!item || index === state.current) return;

  state.items.forEach((it, i) => {
    if (i === index) it.button.setAttribute("aria-current", "true");
    else it.button.removeAttribute("aria-current");
  });
  state.current = index;
  state.canvas.setAttribute(
    "aria-label",
    "3D model of the " + item.name + ". Drag to rotate."
  );

  const token = {};
  state.loading = token;
  setStatus("Loading " + item.name + "…", true);

  let scene = state.cache.get(item.file);
  if (!scene) {
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(MODEL_BASE + item.file);
      scene = gltf.scene;
      dressPiece(THREE, scene, view.mats);
      state.cache.set(item.file, scene);
    } catch (err) {
      if (state.loading === token) setStatus("Could not load " + item.name + ".", false);
      console.error("collection: failed to load", item.file, err);
      return;
    }
  }
  if (state.loading !== token) return;   // a newer selection won the race

  /* Only the piece is swapped — the stand stays in the rig between selections. */
  if (view.piece) view.rig.remove(view.piece);
  view.rig.add(scene);
  view.piece = scene;
  frame(scene);
  view.spin = 0;
  view.yaw = 0;
  view.pitch = PITCH_REST;
  view.needs = true;
  setStatus(item.name + " — drag to rotate", false);
}

/* ---- Pointer + keyboard interaction -------------------------------------- */

function initPointer() {
  const el = state.canvas;
  let id = null;
  let lastX = 0;
  let lastY = 0;

  el.addEventListener("pointerdown", (e) => {
    if (id !== null) return;
    id = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    view.dragging = true;
    view.yaw += view.spin;
    view.spin = 0;
    el.setPointerCapture(id);
    state.stage.classList.add("is-grabbing");
  });

  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    view.yaw += (e.clientX - lastX) * 0.008;
    view.pitch += (e.clientY - lastY) * 0.006;
    /* Tighter than it was: the arrangement now has a base, and rolling far
       enough to look up at the underside of the plinth reads as broken. */
    view.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, view.pitch));
    lastX = e.clientX;
    lastY = e.clientY;
    view.needs = true;
  });

  const release = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    view.dragging = false;
    state.stage.classList.remove("is-grabbing");
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
}

/* Deliberately not a tablist: the picker is four headed groups, and a tablist
   may only own tabs. A plain set of buttons with aria-current is both valid
   and keeps ordinary Tab order, which is what people expect from a list. */
function initPicker() {
  state.items.forEach((item, i) => {
    /* boot() resolves immediately once the viewer is up, so this only defers
       the very first clicks — and a later pick still wins the load race. */
    item.button.addEventListener("click", () => {
      boot().then(() => show(i));
    });
  });
}

/* ---- Boot ---------------------------------------------------------------- */

/* The authored markup carries the copy; JS turns each entry into a tab. */
function upgradeMarkup() {
  const entries = state.root.querySelectorAll("[data-model]");
  let idx = 0;
  entries.forEach((li) => {
    const file = li.getAttribute("data-model");
    const nameEl = li.querySelector("[data-piece-name]");
    const noteEl = li.querySelector("[data-piece-note]");
    if (!file || !nameEl) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "collection__pick";
    button.id = "collection-pick-" + idx;

    while (li.firstChild) button.appendChild(li.firstChild);
    li.appendChild(button);

    state.items.push({
      button: button,
      file: file,
      name: nameEl.textContent.trim(),
      note: noteEl ? noteEl.textContent.trim() : "",
    });
    idx += 1;
  });
}

/* Idempotent *and* awaitable. initPicker() binds its click handlers before the
   first import resolves, so a visitor who picks a piece while three.js is still
   in flight has to join the same promise rather than run show() against a
   loader that is still null. */
function boot() {
  if (state.failed) return Promise.resolve();
  if (!state.booting) state.booting = bootOnce();
  return state.booting;
}

async function bootOnce() {
  setStatus("Preparing the viewer…", true);
  try {
    const [core, loaderMod] = await Promise.all([
      import("three"),
      import("../vendor/three/jsm/loaders/GLTFLoader.js"),
    ]);
    THREE = core;
    GLTFLoader = loaderMod.GLTFLoader;
  } catch (err) {
    console.error("collection: three.js failed to load", err);
    fail();
    return;
  }

  buildView();
  initPointer();
  startLoop();
  window.addEventListener("resize", resize, { passive: true });
  darkScheme.addEventListener("change", () => {
    const pmrem = new THREE.PMREMGenerator(view.renderer);
    view.scene.environment = studioEnvironment(THREE, pmrem, darkScheme.matches);
    view.needs = true;
  });

  show(0);
}

function fail() {
  state.failed = true;
  state.root.removeAttribute("data-collection-ready");
  if (state.stage) state.stage.hidden = true;
}

function init() {
  const root = document.querySelector("[data-collection]");
  if (!root) return;
  state.root = root;
  state.stage = root.querySelector("[data-collection-stage]");
  state.canvas = root.querySelector("[data-collection-canvas]");
  state.status = root.querySelector("[data-collection-status]");
  if (!state.stage || !state.canvas) return;

  if (!hasWebGL()) {
    fail();
    return;
  }

  upgradeMarkup();
  if (!state.items.length) {
    fail();
    return;
  }
  initPicker();

  /* Marks the section as interactive so CSS can reveal the stage. Until this
     runs the section is a plain list, which is exactly what we want. */
  root.setAttribute("data-collection-ready", "");

  /* Nothing heavy is fetched until the section is close to the viewport. */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.disconnect();
          boot();
        }
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(root);
  } else {
    boot();
  }

  /* Intersection callbacks are held while a tab is in the background, so a
     visitor who lands on a background tab and then tabs or clicks straight
     into the picker would otherwise meet a dead stage. boot() is idempotent. */
  const kick = () => boot();
  root.addEventListener("pointerdown", kick, { once: true });
  root.addEventListener("focusin", kick, { once: true });

  /* Stop rendering while the section is off-screen. */
  if ("IntersectionObserver" in window) {
    const vis = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          view.onScreen = entry.isIntersecting;
          if (!view.renderer) continue;
          if (entry.isIntersecting) startLoop();
          else stopLoop();
        }
      },
      { threshold: 0 }
    );
    vis.observe(state.stage);
  }

  document.addEventListener("visibilitychange", () => {
    if (!view.renderer) return;
    if (document.hidden) stopLoop();
    else startLoop();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
