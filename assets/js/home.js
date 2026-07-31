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

(function () {
  "use strict";

  const section = document.querySelector(".stage");
  const canvas = document.getElementById("stage-canvas");
  const frame = canvas ? canvas.parentElement : null;
  const fallbackEl = document.getElementById("stage-fallback");
  const lidBtn = document.getElementById("stage-lid");
  const ledBtn = document.getElementById("stage-led");
  if (!section || !canvas || !frame || !lidBtn || !ledBtn) return;

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

  /* The room. Dark, like the reference: a black floor melting into a black
   * void, and no cast shadow on the ground at all — the box stands in a
   * splash of window-light instead. The floor exists as a surface so the
   * lamp and the shafts have somewhere to land; the fog is what lets its
   * far edge disappear instead of drawing a horizon. */
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

  /* Window light. The key rakes in from high back-left along the same line
   * the visible shafts draw, so the box is lit by the light the reader can
   * see. It still casts within the box — the lid onto the base, the pads
   * into the ring slot — but nothing onto the ground. */
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

  /* The shafts themselves: crossed additive quads fanned along the key's
   * line, plus a dappled splash of light on the floor where they land.
   * Painted textures, static geometry, no postprocessing — the whole effect
   * costs a handful of transparent quads on frames that already render. */
  {
    const rc = document.createElement("canvas");
    rc.width = 128;
    rc.height = 512;
    const rg = rc.getContext("2d");
    const v = rg.createLinearGradient(0, 0, 0, 512);
    v.addColorStop(0, "rgba(255,255,255,0.85)");
    v.addColorStop(0.3, "rgba(255,255,255,0.45)");
    v.addColorStop(0.75, "rgba(255,255,255,0.1)");
    v.addColorStop(1, "rgba(255,255,255,0)");
    rg.fillStyle = v;
    rg.fillRect(0, 0, 128, 512);
    const hMask = rg.createLinearGradient(0, 0, 128, 0);
    hMask.addColorStop(0, "rgba(0,0,0,0)");
    hMask.addColorStop(0.25, "rgba(0,0,0,1)");
    hMask.addColorStop(0.75, "rgba(0,0,0,1)");
    hMask.addColorStop(1, "rgba(0,0,0,0)");
    rg.globalCompositeOperation = "destination-in";
    rg.fillStyle = hMask;
    rg.fillRect(0, 0, 128, 512);
    const rayTex = new THREE.CanvasTexture(rc);

    const origin = new THREE.Vector3(-7.5, 12, -4.5);
    const landing = new THREE.Vector3(2.4, 0, 2.6);
    const dir = landing.clone().sub(origin).normalize();
    const side = new THREE.Vector3()
      .crossVectors(dir, new THREE.Vector3(0, 1, 0))
      .normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      dir
    );
    // offset across the fan, length, width, opacity — a window's worth.
    const blades = [
      [-3.6, 19, 2.8, 0.08],
      [-2.2, 20, 1.5, 0.14],
      [-1.1, 21, 0.8, 0.1],
      [0, 21, 2.2, 0.16],
      [1.2, 20, 0.7, 0.11],
      [2.4, 19, 1.6, 0.13],
      [3.8, 18, 2.6, 0.07],
    ];
    for (const [off, len, w, o] of blades) {
      for (const roll of [0, Math.PI * 0.42]) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, len),
          new THREE.MeshBasicMaterial({
            map: rayTex,
            transparent: true,
            opacity: o,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false,
          })
        );
        m.quaternion.copy(quat);
        m.rotateY(roll);
        m.position
          .copy(origin)
          .addScaledVector(dir, len / 2)
          .addScaledVector(side, off);
        scene.add(m);
      }
    }

    const sc = document.createElement("canvas");
    sc.width = sc.height = 256;
    const sg = sc.getContext("2d");
    const dapple = (x, y, rx, ry, rot, a) => {
      sg.save();
      sg.translate(x, y);
      sg.rotate(rot);
      sg.scale(1, ry / rx);
      const g = sg.createRadialGradient(0, 0, 2, 0, 0, rx);
      g.addColorStop(0, `rgba(235,240,248,${a})`);
      g.addColorStop(1, "rgba(235,240,248,0)");
      sg.fillStyle = g;
      sg.beginPath();
      sg.arc(0, 0, rx, 0, Math.PI * 2);
      sg.fill();
      sg.restore();
    };
    dapple(128, 128, 110, 58, 0.5, 0.34);
    dapple(88, 96, 60, 26, 0.55, 0.3);
    dapple(178, 170, 66, 30, 0.5, 0.26);
    dapple(70, 180, 42, 16, 0.6, 0.22);
    dapple(190, 84, 40, 15, 0.45, 0.2);
    const splash = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 11),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(sc),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    splash.rotation.x = -Math.PI / 2;
    splash.rotation.z = Math.atan2(dir.z, dir.x);
    splash.position.set(0.8, 0.003, 0.9);
    scene.add(splash);
  }

  const model = createRingBox({
    renderer,
    debug: { ledx: params.get("ledx"), ledshadow: params.get("ledshadow") },
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
      s.v += (-s.k * dx - s.c * s.v) * dt;
      s.x += s.v * dt;
      s.active = true;
      moving = true;
    }
    return moving;
  }

  const lidSpring = spring(0, 42, 9); // 0 closed .. 1 open, light overshoot
  const ledSpring = spring(0, 120, 21); // the lamp comes up like an LED

  let lidOpen = false;
  let ledOn = false;

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

  function setLid(open, instant) {
    lidOpen = open;
    lidSpring.target = open ? 1 : 0;
    if (instant) lidSpring.x = lidSpring.target;
    lidBtn.textContent = open ? "Close the box" : "Open the box";
    section.dataset.lid = open ? "open" : "closed";
  }
  function setLed(on, instant) {
    ledOn = on;
    ledSpring.target = on ? 1 : 0;
    if (instant) ledSpring.x = ledSpring.target;
    ledBtn.textContent = on ? "Turn off the light" : "Turn on the light";
    section.dataset.led = on ? "on" : "off";
  }

  // Boot state, overridable for deep links: ?open=1&lit=0&turn=-30&tilt=24
  const bootOpen = params.get("open") === "1";
  const bootLit = params.has("lit") ? params.get("lit") === "1" : bootOpen;
  setLid(bootOpen, true);
  setLed(bootLit, true);

  lidBtn.addEventListener("click", () => {
    setLid(!lidOpen);
    // The real box switches its lamp with the lid; the light pill can still
    // overrule either way afterwards.
    setLed(lidOpen);
    wake();
  });
  ledBtn.addEventListener("click", () => {
    setLed(!ledOn);
    wake();
  });

  /* ----------------------------------------------------------- interaction */

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;

  canvas.addEventListener("pointerdown", (e) => {
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
    const openT = lidSpring.x;
    model.update({ open: openT, lit: ledSpring.x });

    // Fit the model's bounding sphere in both fields of view; the shot
    // loosens as the lid stands up, tightens again as it closes.
    const f = model.framing(openT);
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

    let moving = stepSprings(dt);

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
