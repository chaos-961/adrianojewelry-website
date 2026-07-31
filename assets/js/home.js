/* Adriano Jewelry — the landing stage.
 *
 * This file is the studio, not the prop: renderer, camera, lighting
 * environment, ground, the reader's drag, the two pills, and a render loop
 * that only draws while something moves. The prop itself — today, the ring
 * box — lives in assets/js/models/, one module per model, each exporting
 * create<Model>({ renderer }) -> { root, update(state), framing(open) }.
 * When the next model arrives it gets its own file there and this stage
 * learns nothing new.
 *
 * Interaction is deliberately small: drag (or arrow keys) turns the shot,
 * one pill works the lid, one works the lamp. No zoom, no pan, no motion
 * the reader did not ask for. The renderer sleeps whenever the springs do.
 *
 * Vendored three.js 0.185.1 (assets/js/vendor/, fetched fresh from the npm
 * registry). WebGL2 is required by three at this revision; without it the
 * page falls back to the one-line notice in index.html and stays otherwise
 * exactly as it ships with scripting off.
 */

import * as THREE from "./vendor/three.module.min.js";
import { createRingBox, drawMarque } from "./models/ring-box.js";
import { createSolitaireRing } from "./models/solitaire-ring.js";
import { createBrilliantDiamond } from "./models/brilliant-diamond.js";

(function () {
  "use strict";

  const section = document.querySelector(".stage");
  const canvas = document.getElementById("stage-canvas");
  const frame = canvas ? canvas.parentElement : null;
  const fallbackEl = document.getElementById("stage-fallback");
  const lidBtn = document.getElementById("stage-lid");
  const ledBtn = document.getElementById("stage-led");
  const liftBtn = document.getElementById("stage-lift");
  if (!section || !canvas || !frame || !lidBtn || !ledBtn || !liftBtn) return;

  const params = new URLSearchParams(location.search);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

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

  // ?flat=1 — the model's marque alone, flat, for checking the artwork.
  if (params.get("flat") === "1") {
    const art = drawMarque();
    canvas.replaceWith(art);
    art.className = "stage__canvas is-ready";
    art.style.objectFit = "contain";
    section.classList.add("is-live");
    return;
  }

  if (!webgl2Ok()) {
    section.classList.add("is-fallback");
    fallbackEl.hidden = false;
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

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  /* An HDRI's job done by five emissive cards and a floor, run through
   * PMREM: a big soft key high left, a tall strip right for the long
   * highlight down a satin side, low fills front and left so black plastic
   * never falls to a void, paper underfoot. */
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
    if ("environmentIntensity" in scene) scene.environmentIntensity = 1.0;
  }

  /* The room. Dark, and no cast shadow on the ground at all: every visible
   * shaft, glow and pool of light in it belongs to the box's own lamp and
   * lives in the model — the stage only keeps the quiet studio that makes
   * black plastic legible. The floor exists as a surface for the lamp to
   * land on; the fog lets its far edge disappear instead of drawing a
   * horizon. */
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

  /* Studio. The key rakes in from high back-left; it still casts within the
   * box — the lid onto the base, the pads into the ring slot — but nothing
   * onto the ground. */
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


  /* The prop. The page's is the box; ?prop=ring stands the ring in the same
   * room on its own and ?prop=diamond hangs the stone there alone, both at
   * full frame, which is how a piece gets looked at while it is being cut.
   * Every module exports the same contract, so the stage never learns which
   * one it was handed — the pills still drive an open and a lit that a bare
   * ring or a loose stone simply has no use for. */
  const prop = params.get("prop");
  const hasLid = prop !== "ring" && prop !== "diamond";
  const model =
    prop === "ring"
      ? createSolitaireRing({ renderer, standing: true })
      : prop === "diamond"
        ? createBrilliantDiamond({ renderer, standing: true })
        : createRingBox({
            renderer,
            debug: {
              ledx: params.get("ledx"),
              ledshadow: params.get("ledshadow"),
            },
          });
  scene.add(model.root);

  /* ------------------------------------------------------- state & springs */

  const springs = [];
  function spring(x, k, c) {
    const s = { x, v: 0, target: x, k, c, active: false };
    springs.push(s);
    return s;
  }
  function stepSprings(dt) {
    let moving = false;
    for (const s of springs) {
      if (reduceMotion.matches) {
        if (s.x !== s.target) moving = true;
        s.x = s.target;
        s.v = 0;
        s.active = false;
        continue;
      }
      const dx = s.x - s.target;
      if (Math.abs(dx) < 0.0004 && Math.abs(s.v) < 0.0004) {
        if (s.active) moving = true;
        s.x = s.target;
        s.v = 0;
        s.active = false;
        continue;
      }
      // A spring may swing differently by direction: the lid opens with a
      // little bounce but closes over-damped, so it settles shut instead of
      // ping-ponging through the base.
      if (s.dir) {
        const opening = s.target >= s.x;
        s.k = opening ? s.dir[0] : s.dir[2];
        s.c = opening ? s.dir[1] : s.dir[3];
      }
      s.v += (-s.k * dx - s.c * s.v) * dt;
      s.x += s.v * dt;
      // The hard stop at closed: geometry, not taste — past 0 the lid is
      // inside the base.
      if (s.floor !== undefined && s.x <= s.floor) {
        s.x = s.floor;
        if (s.v < 0) s.v = 0;
      }
      s.active = true;
      moving = true;
    }
    return moving;
  }

  const lidSpring = spring(0, 42, 9); // 0 closed .. 1 open
  lidSpring.dir = [42, 9, 46, 15]; // springy open; over-damped close
  lidSpring.floor = 0;
  const ledSpring = spring(0, 120, 21); // the lamp comes up like an LED
  const liftSpring = spring(0, 30, 10); // the stone, out of its claws and back

  let lidOpen = false;
  let ledOn = false;
  let lifted = false;
  let teasing = false;

  /* The stone's own turn, while it is up. It is only allowed to run at full
   * lift, and on the way back down it does not stop where it was let go —
   * it turns to the nearest eighth, because the claws stand on four of the
   * eight bezel facets and a stone set a few degrees out of square is the
   * one mistake a jeweller would see from across the room. */
  const SPIN = 0.5; // radians a second
  const FACET = Math.PI / 4; // the brilliant's own eight-fold symmetry
  let spinAngle = 0;
  function stepSpin(dt) {
    // ?spin names an angle, so it means that angle and not one that has run
    // on since — a turning stone cannot be photographed otherwise.
    if (params.has("spin")) return false;
    if (liftSpring.x > 0.02 && !reduceMotion.matches) {
      spinAngle = (spinAngle + dt * SPIN) % (Math.PI * 2);
      return true;
    }
    const square = Math.round(spinAngle / FACET) * FACET;
    if (Math.abs(spinAngle - square) < 0.0004) {
      spinAngle = square;
      return false;
    }
    spinAngle += (square - spinAngle) * Math.min(1, dt * 7);
    return true;
  }

  // View state. The turn is the reader's; the framing follows the lid.
  let yaw = -0.42;
  let pitch = 0.42;
  let yawVel = 0;
  const PITCH_MIN = 0.05;
  const PITCH_MAX = 0.72;

  if (params.has("turn")) yaw = (parseFloat(params.get("turn")) * Math.PI) / 180;
  if (params.has("tilt"))
    pitch = Math.min(
      PITCH_MAX,
      Math.max(PITCH_MIN, (parseFloat(params.get("tilt")) * Math.PI) / 180)
    );

  /* Every spring target in one place, because two of the three are not free:
   * the lid cannot shut through a stone standing out of the box, and the
   * stone cannot rise through a shut lid. Each waits on the other's actual
   * position rather than on a timer, so however fast the reader works the
   * pills, nothing is ever asked to pass through anything. */
  const TEASE_LID = 0.042;
  const TEASE_LIT = 0.55;
  function syncTargets() {
    if (held) return;
    lidSpring.target =
      liftSpring.x > 0.02 ? 1 : teasing ? TEASE_LID : lidOpen ? 1 : 0;
    ledSpring.target = teasing ? TEASE_LIT : ledOn ? 1 : 0;
    liftSpring.target = lifted && (!hasLid || lidSpring.x > 0.7) ? 1 : 0;
  }

  function setLid(open, instant) {
    lidOpen = open;
    lidBtn.textContent = open ? "Close the box" : "Open the box";
    section.dataset.lid = open ? "open" : "closed";
    syncTargets();
    if (instant) lidSpring.x = lidSpring.target;
  }
  function setLed(on, instant) {
    ledOn = on;
    ledBtn.textContent = on ? "Turn off the light" : "Turn on the light";
    section.dataset.led = on ? "on" : "off";
    syncTargets();
    if (instant) ledSpring.x = ledSpring.target;
  }
  function setLift(up, instant) {
    // Asking for the stone asks for the box it is in: nothing comes out of a
    // shut box, so the lid and the lamp come with it.
    if (up && hasLid && !lidOpen) {
      setLid(true, instant);
      setLed(true, instant);
    }
    lifted = up;
    liftBtn.textContent = up ? "Set the diamond back" : "Lift the diamond";
    section.dataset.lift = up ? "up" : "down";
    syncTargets();
    if (instant) liftSpring.x = liftSpring.target;
  }

  /* Boot state, overridable for deep links:
   * ?open=1&lit=0&lift=1&turn=-30&tilt=24&spin=22.
   * Fractions hold a mid-pose (?open=0.042&lit=0.55 is the tease, held) —
   * that is how the in-between states get photographed, since headless
   * virtual time jumps straight over animation. A held pose is exactly that:
   * syncTargets stands down for the rest of the page's life so nothing
   * springs out from under the camera. */
  const openParam = parseFloat(params.get("open") || "0") || 0;
  const liftParam = parseFloat(params.get("lift") || "0") || 0;
  const litParam = params.has("lit")
    ? parseFloat(params.get("lit")) || 0
    : openParam >= 1 || liftParam > 0
      ? 1
      : 0;
  const part = (v) => v > 0 && v < 1;
  const held = part(openParam) || part(litParam) || part(liftParam);
  setLid(openParam >= 1 || liftParam > 0, true);
  setLed(litParam >= 1, true);
  setLift(liftParam >= 1, true);
  if (params.has("spin"))
    spinAngle = (parseFloat(params.get("spin")) * Math.PI) / 180 || 0;
  if (held) {
    // A part-lifted stone is only a pose worth holding out of an open box,
    // so asking for one asks for the lid too.
    if (openParam > 0 || liftParam > 0)
      lidSpring.x = lidSpring.target = openParam > 0 ? openParam : 1;
    if (litParam > 0) ledSpring.x = ledSpring.target = litParam;
    if (liftParam > 0) liftSpring.x = liftSpring.target = liftParam;
  }

  /* The tease. Left closed and untouched, every few seconds the lid cracks
   * a few degrees with the lamp breathing through the gap, then settles —
   * a box asking to be opened. It never flips the real state or the pill
   * labels, only leans on the springs; any touch postpones it, opening the
   * box ends it, and reduced motion suppresses it entirely. */
  let teaseTimer = 0;
  function endTease() {
    if (!teasing) return;
    teasing = false;
    section.dataset.tease = "0";
    syncTargets();
  }
  function restTease(delay) {
    clearTimeout(teaseTimer);
    endTease();
    teaseTimer = setTimeout(tease, delay);
  }
  function tease() {
    if (lidOpen || lifted || dragging || reduceMotion.matches || document.hidden) {
      restTease(4500);
      return;
    }
    teasing = true;
    section.dataset.tease = "1";
    syncTargets();
    wake();
    teaseTimer = setTimeout(() => {
      endTease();
      wake();
      teaseTimer = setTimeout(tease, 5200);
    }, 460);
  }
  if (!held) teaseTimer = setTimeout(tease, 2600);

  lidBtn.addEventListener("click", () => {
    restTease(9000);
    const open = !lidOpen;
    // Shutting the box sets the stone back down first — the lid then waits
    // on it, so the two never argue about the same piece of air.
    if (!open && lifted) setLift(false);
    setLid(open);
    // The real box switches its lamp with the lid; the light pill can still
    // overrule either way afterwards.
    setLed(open);
    wake();
  });
  ledBtn.addEventListener("click", () => {
    restTease(9000);
    setLed(!ledOn);
    wake();
  });
  liftBtn.addEventListener("click", () => {
    restTease(9000);
    setLift(!lifted);
    wake();
  });

  /* ----------------------------------------------------------- interaction */

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;

  canvas.addEventListener("pointerdown", (e) => {
    restTease(9000);
    dragging = true;
    yawVel = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    wake();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    yaw -= dx * 0.0045;
    pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + dy * 0.0038));
    yawVel = (-dx * 0.0045 * 1000) / dt;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    wake();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (reduceMotion.matches) yawVel = 0;
    wake();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard turn for anyone not on a pointer.
  canvas.addEventListener("keydown", (e) => {
    restTease(9000);
    if (e.key === "ArrowLeft") yawVel += 1.8;
    else if (e.key === "ArrowRight") yawVel -= 1.8;
    else if (e.key === "ArrowUp") pitch = Math.min(PITCH_MAX, pitch + 0.09);
    else if (e.key === "ArrowDown") pitch = Math.max(PITCH_MIN, pitch - 0.09);
    else return;
    e.preventDefault();
    wake();
  });

  /* ----------------------------------------------------------------- frame */

  function applyState() {
    const state = {
      open: lidSpring.x,
      lit: ledSpring.x,
      lift: liftSpring.x,
      spin: spinAngle,
    };

    /* Fit the model's bounding sphere in both fields of view; the shot
     * loosens as the lid stands up, tightens again as it closes, and closes
     * right in on the stone when it comes out. Framing is a pure reading of
     * the state, so the camera can be placed before the model is told
     * anything — which is what lets the stone's flare be asked about this
     * frame's eye rather than the last one's. */
    const f = model.framing(state);
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = (f.cr / Math.sin(Math.min(vHalf, hHalf))) * 1.03;
    const cp = Math.cos(pitch);
    camera.position.set(
      Math.sin(yaw) * dist * cp,
      f.cy + Math.sin(pitch) * dist,
      Math.cos(yaw) * dist * cp
    );
    camera.lookAt(0, f.cy, 0);

    state.eye = camera.position;
    model.update(state);
  }

  let queued = false;
  let lastFrame = 0;
  function wake() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frameStep);
  }
  function frameStep(t) {
    queued = false;
    const dt = Math.min((t - lastFrame) / 1000 || 0.016, 0.033);
    lastFrame = t;

    // Self-heal the buffer size. Some embedded viewers change the viewport
    // without ever delivering a resize event or an observer entry; checking
    // here means the first interactive frame corrects a stale canvas anyway.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(frame.clientWidth * dpr)) resize();

    // The lid and the stone re-read each other every frame, since each is
    // waiting on where the other actually is rather than on being told.
    syncTargets();
    let moving = stepSprings(dt);
    if (stepSpin(dt)) moving = true;

    if (!dragging && Math.abs(yawVel) > 0.02) {
      yaw += yawVel * dt;
      yawVel *= Math.exp(-dt * 3.8);
      moving = true;
    } else if (!dragging) {
      yawVel = 0;
    }

    applyState();
    renderer.render(scene, camera);

    if (!canvas.classList.contains("is-ready")) {
      canvas.classList.add("is-ready");
      section.dataset.ready = "1";
    }
    if (moving || dragging) wake();
  }

  function resize() {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wake();
  }

  // Both: the observer tracks the frame's own box (svh changes, layout
  // shifts), the window listener catches environments where emulated
  // viewports resize the page without delivering observer entries.
  new ResizeObserver(resize).observe(frame);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake();
  });
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
  canvas.addEventListener("webglcontextrestored", wake);
  reduceMotion.addEventListener("change", wake);

  section.classList.add("is-live");
  resize();
})();
