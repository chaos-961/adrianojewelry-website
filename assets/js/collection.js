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

const MODEL_BASE = "assets/models/";

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
  booted: false,
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
  pivot: null,   // holds the current piece; user drag rotates this
  piece: null,   // the loaded scene inside the pivot, kept for re-framing
  gold: null,
  gem: null,
  mop: null,
  radius: 1,
  yaw: 0,
  pitch: 0,
  spin: 0,
  dragging: false,
  raf: 0,
  needs: true,
  onScreen: true,
};

/* A high-frequency "diamond light" probe. Gem facets only sparkle when the
   environment has small bright panels separated by dark gaps — a single soft
   dome renders as milky white. */
function gemEnvironment(pmrem) {
  const scene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(1, 1);
  const panel = (r, g, b, sx, sy, pos, rot) => {
    const mesh = new THREE.Mesh(
      quad,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(r, g, b),
        side: THREE.DoubleSide,
      })
    );
    mesh.scale.set(sx, sy, 1);
    mesh.position.fromArray(pos);
    mesh.rotation.fromArray(rot);
    scene.add(mesh);
  };

  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(60, 60, 60),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.02, 0.021, 0.028),
        side: THREE.BackSide,
      })
    )
  );
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const v = 3 + 26 * Math.abs(Math.sin(i * 1.7 + j * 2.3));
      panel(v, v * 0.965, v * 0.9, 3.4, 3.4, [i * 5.4, 19.5, j * 5.4], [Math.PI / 2, 0, 0]);
    }
  }
  for (let k = -2; k <= 2; k++) {
    const v = 2.2 + 6 * Math.abs(Math.cos(k * 1.3));
    panel(v, v * 0.97, v * 0.92, 4.5, 20, [-19.6, k * 4.6, 2], [0, Math.PI / 2, 0]);
    panel(v * 0.7, v * 0.72, v * 0.85, 4.5, 20, [19.6, k * 4.6, -2], [0, -Math.PI / 2, 0]);
  }
  panel(4.2, 4.3, 4.8, 30, 14, [0, -19.5, 0], [-Math.PI / 2, 0, 0]);
  panel(6.0, 5.7, 5.1, 26, 10, [0, 4, -19.6], [0, 0, 0]);
  panel(2.6, 2.7, 3.0, 26, 10, [0, -2, 19.6], [0, Math.PI, 0]);

  const tex = pmrem.fromScene(scene, 0.0).texture;
  scene.traverse((o) => {
    if (o.isMesh) o.material.dispose();
  });
  quad.dispose();
  return tex;
}

/* The metal probe. Polished gold is a mirror: it has no shading of its own,
   only whatever it reflects. A uniformly bright box therefore renders it as
   flat pale yellow — which is exactly what a jewellery photographer avoids by
   surrounding the piece with black gobos and one big soft key. That contrast
   is what this builds: a dark shell, one large bright ceiling, and a couple of
   narrow strips to draw highlights along the curves. */
function studioEnvironment(pmrem) {
  const scene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(1, 1);
  const panel = (v, tint, sx, sy, pos, rot) => {
    const mesh = new THREE.Mesh(
      quad,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(v, v * tint[0], v * tint[1]),
        side: THREE.DoubleSide,
      })
    );
    mesh.scale.set(sx, sy, 1);
    mesh.position.fromArray(pos);
    mesh.rotation.fromArray(rot);
    scene.add(mesh);
  };

  const dark = darkScheme.matches ? 0.012 : 0.045;
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(60, 60, 60),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(dark, dark * 0.97, dark * 0.94),
        side: THREE.BackSide,
      })
    )
  );
  panel(7.6, [0.975, 0.925], 26, 20, [0, 19.5, 1], [Math.PI / 2, 0, 0]);    // key softbox
  panel(3.4, [0.99, 1.07], 5.5, 26, [-19.4, 3, 3], [0, Math.PI / 2, 0]);    // cool edge strip
  panel(2.1, [0.94, 0.82], 5.5, 26, [19.4, -1, -2], [0, -Math.PI / 2, 0]);  // warm edge strip
  panel(1.5, [0.96, 0.9], 24, 7, [0, 5, -19.4], [0, 0, 0]);                 // rim
  panel(1.15, [0.99, 0.97], 30, 24, [0, -19.4, 0], [-Math.PI / 2, 0, 0]);   // floor bounce
  panel(0.28, [1.0, 1.02], 26, 18, [0, 0, 19.4], [0, Math.PI, 0]);          // dark front gobo

  const tex = pmrem.fromScene(scene, 0.015).texture;
  scene.traverse((o) => {
    if (o.isMesh) o.material.dispose();
  });
  quad.dispose();
  return tex;
}

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
  scene.environment = studioEnvironment(pmrem);

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

  const pivot = new THREE.Group();
  scene.add(pivot);

  view.renderer = renderer;
  view.scene = scene;
  view.camera = camera;
  view.pivot = pivot;

  view.gold = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(1.0, 0.775, 0.365, THREE.LinearSRGBColorSpace),
    metalness: 1.0,
    roughness: 0.135,
    envMapIntensity: 1.7,
  });

  /* Reflection-only stones. Full refraction costs a second scene pass every
     frame, which is not a trade worth making on a marketing page.

     The half-metal is deliberate and not physical. A real diamond is a
     dielectric whose brightness comes from light entering, bouncing off the
     pavilion and coming back out — i.e. from the transmission we just turned
     off. Left as a pure dielectric the diffuse term swamps the facets and the
     stone renders as a white blob. Pushing metalness up trades that diffuse
     for mirror reflection of the high-frequency probe, which is what restores
     the bright/dark facet contrast the eye reads as a cut stone. */
  view.gem = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.55,
    roughness: 0.0,
    ior: 2.417,
    reflectivity: 1.0,
    specularIntensity: 1.0,
    envMap: gemEnvironment(pmrem),
    envMapIntensity: 1.3,
  });

  view.mop = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.795, 0.79, 0.782, THREE.LinearSRGBColorSpace),
    metalness: 0.0,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    iridescence: 1.0,
    iridescenceIOR: 1.82,
    iridescenceThicknessRange: [140, 860],
    sheen: 0.55,
    sheenColor: new THREE.Color(0xa9c6e6),
    sheenRoughness: 0.42,
    envMapIntensity: 1.4,
  });

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

/* Materials come from the GLB by name — gold / gem / mop — and are swapped for
   the real shading here, so the files stay small and shader-agnostic. */
function dress(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = ((o.material && o.material.name) || "").toLowerCase();
    if (name.includes("gem")) o.material = view.gem;
    else if (name.includes("mop")) o.material = view.mop;
    else o.material = view.gold;
  });
}

/* Fit vertically and horizontally rather than to the bounding sphere, which
   wastes a lot of frame on the flat pieces. The piece spins about Y, so the
   horizontal half-extent has to be the diagonal of the X/Z footprint or it
   would clip halfway through a turn. */
function frame(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  object.position.sub(centre);

  const rV = size.y / 2;
  const rH = Math.hypot(size.x / 2, size.z / 2);
  view.radius = Math.max(rV, rH);

  const fovV = (view.camera.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * view.camera.aspect);
  const dist =
    Math.max(rV / Math.tan(fovV / 2), rH / Math.tan(fovH / 2)) * 1.16;

  view.camera.position.set(0, rV * 0.14, dist);
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
      dress(scene);
      state.cache.set(item.file, scene);
    } catch (err) {
      if (state.loading === token) setStatus("Could not load " + item.name + ".", false);
      console.error("collection: failed to load", item.file, err);
      return;
    }
  }
  if (state.loading !== token) return;   // a newer selection won the race

  view.pivot.clear();
  scene.position.set(0, 0, 0);
  view.pivot.add(scene);
  view.piece = scene;
  frame(scene);
  view.spin = 0;
  view.yaw = 0;
  view.pitch = 0;
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
    view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch));
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
    item.button.addEventListener("click", () => show(i));
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

async function boot() {
  if (state.booted || state.failed) return;
  state.booted = true;

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
    view.scene.environment = studioEnvironment(pmrem);
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
