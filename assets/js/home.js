/* Adriano Jewelry, the landing journey.
 *
 * One scroll drives one continuous shot. The page opens on the closed ring
 * box in its dark room; scrolling turns the box to face the reader, opens
 * the lid under its own lamp, lifts the ring out while the box leaves the
 * frame, lifts the stone out of its claws while the ring leaves the other
 * way, closes right in on the turning brilliant, and then passes through
 * its table into a white crystalline room where the store's finished pieces
 * drift by. Scrolling on folds the white back to black, stands the
 * brilliant back up out of that black, relit and turning, and carries it
 * stage left while the closing words take the right of the frame; then the
 * page hands over to the finale and the footer, which are ordinary flowing
 * content below the track.
 *
 * v0.2.8 is a director's pass over that film, and most of it is about the
 * two joins that used to be dissolves. A dissolve is what you reach for when
 * two shots refuse to meet, and both of this film's did: it left the room
 * through a curtain of white and came back out of the stone through a
 * curtain of black. Now the table is crossed as an OPTICAL event — the frame
 * squeezed and split by channel the way glass does to a picture, one hard
 * flash at contact — the first thing inside is Snell's window (the dark room
 * folded into a bright disc overhead with the claws warped round its rim,
 * receding as the reader sinks), and the way out converges on the octagon of
 * the table itself, which the coda then opens on face-up before swinging
 * down. Shape carried across a cut, so the two halves are one place.
 *
 * The rest of the pass is handling and glass: the props move as though a
 * hand had them (moves overlap, a departing piece leans into its travel, a
 * turn arrives past its mark and rocks back), the lid is sprung rather than
 * slid, the stone throws a wheel of its own light down onto the velvet, and
 * a real rack focus pulls from the ring to the stone as one lifts out of the
 * other.
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
 * The one post-process pass (rack focus, and the squeeze through the table)
 * is allocated lazily and routed around entirely outside the two stretches
 * that ask for it, so the rest of the film draws straight to the canvas as
 * it always has. WebGL2 is required (three r185). Without it the journey
 * collapses to a quiet fallback card and the page continues as flowing
 * content. With JavaScript off, nothing here exists at all and the page is
 * the footer-only page it has been since v0.2.1.
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

  /* What this page is allowed to spend.
   *
   * A coarse pointer means a touch device, and a touch device is drawing
   * into a screen with two or three times the pixels of a laptop, off a
   * fraction of the power budget, on a battery. Everything gated on this is
   * a straight trade of resolution nobody can resolve on a phone held at
   * arm's length for frames everybody can feel under their thumb. Nothing
   * here changes what the film IS — no beat is cut and no shot is
   * simplified; it is the same film rendered for less.
   *
   * `?lp=1` forces it on so the cheap path can be photographed, since
   * headless Chrome reports a fine pointer whatever size its window is. */
  const lowPower =
    params.get("lp") === "1" || matchMedia("(pointer: coarse)").matches;
  const DPR_CAP = lowPower ? 1.6 : 2;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, DPR_CAP);

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIn3 = (t) => t * t * t;

  /* The handling vocabulary. A smoothstep decelerates into every mark and
   * stops dead there, which is the signature of an animated slide; a thing
   * that was PUT somewhere by a hand goes a little past its mark and rocks
   * back. arrive() is that: one clean overshoot of about 7% and a settle,
   * with no second bounce. Fed a smoothstep it also leaves at rest, so a
   * prop still starts as though it weighed something.
   *
   * It stays a pure function of its argument, so the film scrubs through the
   * overshoot in both directions and a deep link can land inside one. */
  const arrive = (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 1.35);

  /* A sprung hinge, not a slider. A real ring box resists at the shut
   * detent, goes over centre in a hurry, and arrives at the stop with a
   * thunk; a lid that hangs obediently at 40 degrees wherever the thumb
   * stops tells the reader it is a slider with a picture of a box on it.
   * Two smoothsteps give the detents at both ends and the rush between them,
   * and the sine adds the few degrees of overshoot the stop absorbs. */
  const hinge = (t) => {
    const s = smooth(smooth(t));
    return s + 0.05 * Math.pow(Math.sin(Math.PI * clamp((t - 0.55) / 0.45, 0, 1)), 2);
  };

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
  /* Lifted off the room's own black toward the dome's horizon, so the band
   * where the ground is both fogging and fading has nothing to step across.
   * The floor's alpha does the real work; this only keeps the two halves of
   * the transition on speaking terms. */
  scene.fog = new THREE.Fog(0x101011, 15, 42);
  if ("environmentIntensity" in scene) scene.environmentIntensity = 0.65;
  {
    /* The floor takes a little of the studio back: a satin sheen rather
     * than dead matte, so the props stand on something that answers their
     * light instead of on a hole. */
    /* The ground does not END anywhere; it thins out. Fogging it to a colour
     * and letting its rim arrive is what used to draw a hard line across the
     * frame — the floor reaching one brightness while the dome behind it (a
     * raw shader, unfogged) sat at another, worst in portrait where the
     * camera stands back and puts that join through the middle of the
     * picture. A radial fade in its own alpha means there is no brightness
     * to match: the ground simply becomes the room, at any distance the film
     * ever stands off to, with nothing to tune.
     *
     * CircleGeometry lays its uv out from the centre, so the map's own
     * radius is the floor's. */
    const fade = document.createElement("canvas");
    fade.width = fade.height = 128;
    {
      const g = fade.getContext("2d");
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(0.52, "#ffffff");
      grd.addColorStop(1, "#000000");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    }
    const fadeTex = new THREE.CanvasTexture(fade);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(90, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0b0b0c,
        roughness: 0.62,
        metalness: 0,
        envMapIntensity: 0.5,
        alphaMap: fadeTex,
        transparent: true,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
  }

  /* The walls. A dome of barely lifted greys instead of one flat black: a
   * low band of haze at the horizon and a soft pool of lighter dark behind
   * the subject, so the room has air and depth without ever stopping being
   * a black room. The values are tiny and the gradient is dithered, because
   * an 8-bit ramp this quiet bands into visible steps without it. */
  {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(34, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: [
          "varying vec3 vD;",
          "void main() {",
          "  vD = position;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}",
        ].join("\n"),
        fragmentShader: [
          "varying vec3 vD;",
          "void main() {",
          "  vec3 d = normalize(vD);",
          "  float lum = 0.0008;",
          // The haze where the floor meets the walls.
          "  lum += 0.0060 * exp(-pow((d.y - 0.06) * 4.2, 2.0));",
          // The pool of lighter dark the story plays against.
          "  float h = max(dot(d, normalize(vec3(0.0, 0.14, -1.0))), 0.0);",
          "  lum += 0.0085 * pow(h, 3.0);",
          "  gl_FragColor = vec4(vec3(lum), 1.0);",
          "  #include <tonemapping_fragment>",
          "  #include <colorspace_fragment>",
          "  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
          "  gl_FragColor.rgb += vec3((n - 0.5) / 255.0);",
          "}",
        ].join("\n"),
      })
    );
    scene.add(dome);
  }

  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.position.set(-5.5, 8.5, -1.5);
  key.castShadow = true;
  /* The shadow map is re-rendered on every frame the props move against the
   * lights, which is every frame of a scroll. Halving it on a phone is a
   * quarter of the shadow rasterisation for a softness nobody can see at
   * this size: the only caster is a box on a cushion. */
  key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
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
      renderer.setPixelRatio(pixelRatio());
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

  /* The stone's light, landing.
   *
   * A brilliant under a lamp does not merely shine: it throws a wheel of
   * hard little spots and short arcs down onto whatever it is standing on,
   * and every macro film of a ring in a box has that image in it. This one
   * had an empty cushion. So the stone gets its cast pattern — eight-fold,
   * because the cut is, and painted rather than traced, since tracing a
   * caustic through fifty-eight facets per frame is a renderfarm's job and
   * a canvas gets the same picture for nothing.
   *
   * It rides as a child of the box, because the light is landing on the
   * box's own velvet and goes wherever that goes. The middle is left dark on
   * purpose: that is where the ring slot is, and a pool of light poured over
   * the band standing in it would read as fog rather than as scatter. */
  const caustic = (() => {
    const N = 256;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d");
    const mid = N / 2;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = "lighter";
    // The pool the spots sit in: faint, and hollow in the middle.
    const pool = g.createRadialGradient(mid, mid, mid * 0.1, mid, mid, mid);
    pool.addColorStop(0, "rgba(255,255,255,0.02)");
    pool.addColorStop(0.42, "rgba(255,255,255,0.07)");
    pool.addColorStop(0.78, "rgba(255,255,255,0.035)");
    pool.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = pool;
    g.fillRect(0, 0, N, N);
    const rand = rng(0x5eed17);
    const dot = (x, y, s, lvl) => {
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, "rgba(255,255,255," + lvl.toFixed(3) + ")");
      grd.addColorStop(0.4, "rgba(255,255,255," + (lvl * 0.34).toFixed(3) + ")");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    };
    for (let arm = 0; arm < 8; arm++) {
      g.save();
      g.translate(mid, mid);
      g.rotate((arm * Math.PI) / 4);
      for (let i = 0; i < 8; i++) {
        const r = (0.3 + rand() * 0.6) * mid;
        const a = (rand() - 0.5) * 0.66;
        dot(Math.cos(a) * r, Math.sin(a) * r, 1.5 + rand() * 5, 0.3 + rand() * 0.6);
      }
      // Two short arcs per arm: a facet edge smears its light along a curve
      // rather than dropping it on a point, and the curve is what stops the
      // whole thing reading as a star field.
      for (let i = 0; i < 2; i++) {
        const r = (0.42 + rand() * 0.44) * mid;
        const a0 = (rand() - 0.5) * 0.5;
        const sweepA = 0.1 + rand() * 0.16;
        const lvl = 0.16 + rand() * 0.24;
        for (let s = 0; s <= 9; s++) {
          const a = a0 + (sweepA * (s / 9 - 0.5)) * 2;
          dot(Math.cos(a) * r, Math.sin(a) * r, 2.4, lvl);
        }
      }
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      })
    );
    // Laid flat, so its own z-rotation becomes a turn about the room's
    // vertical and the pattern can follow the stone that throws it.
    m.rotation.x = -Math.PI / 2;
    m.position.y = box.metrics.cushionY + 0.012;
    m.visible = false;
    box.root.add(m);
    return m;
  })();

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
   * act on, and the two sets interleave rather than coincide.
   *
   * v0.2.8 stretched the track from 1500vh to 1700vh and rescaled every
   * range by 15/17, so each existing chapter still occupies exactly the
   * scroll length it always had; the two new screens all belong to the
   * coda at the end. */
  const B = {
    turn: [0.066, 0.141], // the box comes round to face the reader
    open: [0.154, 0.229], // the lid stands, the lamp comes up with it
    ringUp: [0.251, 0.331], // the ring rises out of the slot
    boxOut: [0.306, 0.397], // the box leaves, stage left
    stoneUp: [0.388, 0.46], // the stone rises out of the claws
    ringOut: [0.455, 0.543], // the ring leaves, stage right
    solo: [0.543, 0.604], // the stone alone, turning
    enter: [0.604, 0.66], // the stone swells past the camera
    focus: [0.3, 0.56], // the shallow lens is fitted, and taken off
    press: [0.62, 0.6585], // glass pressed against the eye at the table
    inside: [0.66, 0.852], // the crystal room and the gallery
    window: [0.66, 0.699], // Snell's window: where the reader has landed
    collapse: [0.806, 0.852], // the white folds back to the table's octagon
  };

  /* Contact. The old join was a slow white dissolve; this is a hit — the
   * bloom off a single frame of it, up hard and gone. The crystal room takes
   * the canvas at 0.66, under the top of the spike, so the eye is still
   * recovering when the switch happens and no frame shows the seam. */
  const FLASH = [0.6505, 0.6595, 0.6715];

  /* The coda. Out of the black the collapse leaves behind, the brilliant
   * stands back up, relit and turning, and is carried stage left while the
   * closing words take the right of the frame: the film's goodbye, played
   * on the same ground the finale below stands on. */
  const CODA = [0.858, 1];

  /* Camera keys: lookAt, orbit, distance, lens, how far the subject slides
   * off centre on a wide screen (sx), and the width of world that must stay
   * in frame however narrow the viewport gets (fitW). The fit is enforced
   * after interpolation, so a phone simply stands further back instead of
   * cropping the story. The last three keys are the coda: nothing between
   * the dive at 0.66 and the coda's first key is ever rendered (the crystal
   * room owns that stretch), so the segment that joins them is free to be
   * whatever the interpolation makes of it.
   *
   * The coda opens FACE-UP on the stone, small and far, because that is the
   * shape the collapse hands it: the white room folds down to the octagon of
   * the table, and the first coda frame is that same octagon, now lit. The
   * camera then rolls down off the face to the three-quarter view the words
   * stand beside. Shape carried across the cut, which is the whole reason
   * the two halves read as one place instead of two films spliced. */
  const KEYS = [
    { p: 0.0, y: 2.15, yaw: 0.62, pit: 0.3, d: 17.5, fov: 30, sx: -2.3, fitW: 8.6 },
    { p: 0.088, y: 2.2, yaw: 0.3, pit: 0.26, d: 14.2, fov: 30, sx: -1.0, fitW: 8.2 },
    { p: 0.146, y: 2.25, yaw: 0.02, pit: 0.22, d: 11.6, fov: 30, sx: 0, fitW: 8.2 },
    { p: 0.238, y: SEAT + GIRDLE + 0.5, yaw: -0.06, pit: 0.38, d: 8.2, fov: 30, sx: 0, fitW: 7.6 },
    { p: 0.331, y: RING_Y_UP + 0.28, yaw: 0.1, pit: 0.2, d: 6.2, fov: 30, sx: 0, fitW: 3.6 },
    { p: 0.388, y: RING_Y_UP + 0.32, yaw: 0.16, pit: 0.2, d: 5.8, fov: 30, sx: 0, fitW: 3.4 },
    { p: 0.463, y: STONE_Y - 0.95, yaw: 0.24, pit: 0.28, d: 5.4, fov: 30, sx: 0, fitW: 3.5 },
    { p: 0.503, y: STONE_Y - 1.0, yaw: 0.32, pit: 0.3, d: 5.2, fov: 30, sx: 0, fitW: 3.4 },
    { p: 0.543, y: STONE_Y - 0.35, yaw: 0.4, pit: 0.44, d: 4.2, fov: 31, sx: 0, fitW: 2.6 },
    { p: 0.574, y: STONE_Y, yaw: 0.46, pit: 0.5, d: 2.35, fov: 32, sx: 0, fitW: 1.6 },
    /* The last three arc up over the stone and come down onto its TABLE,
     * face on. The film used to swell the stone forty-five times and fly the
     * camera through the middle of it, and there is no way to make that look
     * like anything: a brilliant is beautiful because it is fifty-eight small
     * facets, and from inside at that scale each one is a grey wall the width
     * of the screen. The tent's panels came back as flat card, the black
     * between them as bars across the frame, and the fire as soap-bubble
     * arcs. So the stone stays a two-carat stone and the CAMERA does the
     * work: over the crown, down onto the face, and the last thing anybody
     * sees before the flash is the one view a diamond is photographed in. */
    { p: 0.616, y: STONE_Y, yaw: 0.56, pit: 0.72, d: 1.7, fov: 34, sx: 0, fitW: 1.05 },
    { p: 0.64, y: STONE_Y + 0.06, yaw: 0.7, pit: 1.1, d: 1.05, fov: 38, sx: 0, fitW: 0.9 },
    { p: 0.66, y: STONE_Y + 0.11, yaw: 0.8, pit: 1.42, d: 0.29, fov: 46, sx: 0, fitW: 0.5 },
    { p: 0.858, y: STONE_Y - 0.02, yaw: 0.0, pit: 1.36, d: 3.5, fov: 30, sx: 0, fitW: 0.9 },
    { p: 0.892, y: STONE_Y - 0.05, yaw: -0.26, pit: 0.64, d: 3.05, fov: 30, sx: 0, fitW: 1.05 },
    { p: 0.938, y: STONE_Y - 0.06, yaw: 0.04, pit: 0.16, d: 2.35, fov: 30, sx: 0, fitW: 1.15 },
    { p: 1.0, y: STONE_Y - 0.05, yaw: 0.35, pit: 0.17, d: 2.6, fov: 30, sx: 0.55, fitW: 1.1 },
  ];

  /* The keys are played through a monotone cubic (Fritsch and Carlson's
   * slopes) per channel rather than a smoothstep per segment. A smoothstep
   * brings the camera to a dead stop at every key, and a film made of
   * stop-start moves reads as slides in a carousel; the monotone cubic
   * carries speed THROUGH each key, still hits every keyed value exactly,
   * and can never overshoot between two of them, so the whole journey plays
   * as one continuous shot. */
  const SPLINE = { p: KEYS.map((k) => k.p) };
  for (const c of ["y", "yaw", "pit", "d", "fov", "sx", "fitW"]) {
    const v = KEYS.map((k) => k[c]);
    const n = v.length;
    const dlt = [];
    for (let i = 0; i < n - 1; i++) {
      dlt.push((v[i + 1] - v[i]) / (SPLINE.p[i + 1] - SPLINE.p[i]));
    }
    // A slope of zero wherever the channel turns round or rests, which is
    // exactly the guard that keeps a cubic inside its keys.
    const m = [dlt[0]];
    for (let i = 1; i < n - 1; i++) {
      if (dlt[i - 1] * dlt[i] <= 0) {
        m.push(0);
      } else {
        const h0 = SPLINE.p[i] - SPLINE.p[i - 1];
        const h1 = SPLINE.p[i + 1] - SPLINE.p[i];
        const w1 = 2 * h1 + h0;
        const w2 = h1 + 2 * h0;
        m.push((w1 + w2) / (w1 / dlt[i - 1] + w2 / dlt[i]));
      }
    }
    m.push(dlt[n - 2]);
    SPLINE[c] = { v, m };
  }

  function splineAt(c, i, p) {
    const ps = SPLINE.p;
    const s = SPLINE[c];
    const h = ps[i + 1] - ps[i];
    const t = (p - ps[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * s.v[i] +
      (t3 - 2 * t2 + t) * h * s.m[i] +
      (3 * t2 - 2 * t3) * s.v[i + 1] +
      (t3 - t2) * h * s.m[i + 1]
    );
  }

  function cameraAt(p, aspect) {
    const ps = SPLINE.p;
    const pc = clamp(p, ps[0], ps[ps.length - 1]);
    let i = 0;
    while (i < ps.length - 2 && pc > ps[i + 1]) i++;
    const widthK = clamp((aspect - 0.9) / 0.5, 0, 1);
    const sx = splineAt("sx", i, pc) * widthK;
    const fov = splineAt("fov", i, pc);
    let d = splineAt("d", i, pc);
    const tanV = Math.tan((fov * Math.PI) / 360);
    /* The named width is what a WIDE frame has to hold: the prop with room
     * beside it for the words. A portrait frame does not lay the words
     * beside anything — it stacks them above, on the same line as sx going
     * to zero — so it only has to hold the prop, and asking it to hold the
     * wide composition's width as well is what used to send a phone's camera
     * two and a half times further back than the key intended, out into the
     * fog, for a shot of a ring box the size of a postage stamp. */
    const fitW = splineAt("fitW", i, pc) * (0.8 + 0.2 * widthK);
    if (fitW > 0) {
      // Half that width, plus the off-centre slide, must fit across.
      const dNeed = (fitW / 2 + Math.abs(sx)) / (tanV * aspect);
      d = Math.max(d, dNeed);
    }
    /* The fog is graded to the SHOT, not to the room. Its job is to let the
     * floor's far edge disappear rather than draw a horizon, and a fixed
     * range does that only at the distance it was set for: at the distance a
     * narrow viewport backs off to, the same numbers put the subject itself
     * three quarters of the way into the haze. Held four units beyond
     * whatever the camera is looking at, it can never touch the subject and
     * still always swallows the ground behind it. */
    if (scene.fog) {
      scene.fog.near = Math.max(15, d + 4);
      scene.fog.far = scene.fog.near + 27;
    }
    // Portrait: the subject sits low so the words own the top of the frame.
    // The coda pairs its words BESIDE the stone instead of over it, so it
    // trades layouts at a squarer aspect than the rest of the film; the
    // 23/20 media query in home.css makes the same trade at the same line.
    const pth = pc >= CODA[0] ? 1.15 : 0.9;
    // The coda's ramp is steeper: its words trade sides, not just weight,
    // so the squarish aspects between the two layouts want most of the
    // portrait drop rather than a taste of it.
    const portraitK = clamp((pth - aspect) / (pc >= CODA[0] ? 0.22 : 0.45), 0, 1);
    const y = splineAt("y", i, pc) + portraitK * 0.15 * d;
    const yaw = splineAt("yaw", i, pc);
    const pit = splineAt("pit", i, pc);
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

  /* The white room. A fullscreen shader rather than geometry, and cut the
   * way the stone itself is cut: two shells of big irregular facet cells (a
   * Voronoi partition, so every border is a true straight line and no two
   * meet at the same angle twice; nothing repeats and nothing can line up
   * into a lattice), the near shell turning one way with the scroll and the
   * far shell the other, which is the parallax that makes it a room rather
   * than a pattern. Each cell is one flat plane of near-white with a soft
   * ramp of light across it; the edges carry a whisper of the stone's own
   * dispersion trick, colour allowed only where two planes meet. Two broad
   * beams sweep the room as it turns and a few glints ride the scroll. uK
   * is scroll, so the room stands deterministically still whenever the
   * reader does; uOut folds it to its own seams and then to black. */
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
        uIn: { value: 0 },
        uTab: { value: 0 },
        uTabA: { value: 0 },
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
        "uniform float uIn;",
        "uniform float uTab;",
        "uniform float uTabA;",
        "float hash(vec2 v) {",
        "  return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453);",
        "}",
        /* The cell points are kept inside the middle 72% of their own cell.
         * That is not a look decision, it is what buys the border search
         * below the right to be 3x3 instead of 5x5: with points free to sit
         * anywhere, a cell two over can still own the nearest border, and
         * the exact-distance pass has to look that far. Reined in, it cannot,
         * and the room costs 36 of these instead of 68 per fragment — which
         * is most of the crystal room's bill, since each one is two sines.
         * The cells stay thoroughly irregular; nothing lines up. */
        "vec2 hash2(vec2 v) {",
        "  return fract(sin(vec2(dot(v, vec2(127.1, 311.7)), dot(v, vec2(269.5, 183.3)))) * 43758.5453) * 0.72 + 0.14;",
        "}",
        "mat2 rot(float a) {",
        "  float c = cos(a);",
        "  float s = sin(a);",
        "  return mat2(c, -s, s, c);",
        "}",
        // Voronoi with the true distance to the cell border (the second
        // pass measures straight to the perpendicular bisector), so every
        // edge is a dead straight line of even weight, the way two facet
        // planes actually meet. Returns (border distance, vector to the
        // cell's own point) and the cell's id for shading.
        "vec3 facets(vec2 x, out vec2 id) {",
        "  vec2 n = floor(x);",
        "  vec2 f = fract(x);",
        "  vec2 mg = vec2(0.0);",
        "  vec2 mr = vec2(0.0);",
        "  float md = 8.0;",
        "  for (int j = -1; j <= 1; j++)",
        "  for (int i = -1; i <= 1; i++) {",
        "    vec2 g = vec2(float(i), float(j));",
        "    vec2 r = g + hash2(n + g) - f;",
        "    float d = dot(r, r);",
        "    if (d < md) { md = d; mr = r; mg = g; }",
        "  }",
        "  md = 8.0;",
        "  for (int j = -1; j <= 1; j++)",
        "  for (int i = -1; i <= 1; i++) {",
        "    vec2 g = mg + vec2(float(i), float(j));",
        "    vec2 r = g + hash2(n + g) - f;",
        "    if (dot(mr - r, mr - r) > 0.00001) {",
        "      md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));",
        "    }",
        "  }",
        "  id = n + mg;",
        "  return vec3(md, mr);",
        "}",
        "void main() {",
        // Leaving, the facets rush past: the field zooms as it darkens. q0 is
        // the frame itself, unzoomed, which is what the table's octagon has
        // to be measured in — it has to land at the size the stone's own
        // table will have in the first coda frame, and the rushing field
        // would otherwise carry it away from that by a factor of two.
        "  vec2 q0 = vec2(vQ.x * uA, vQ.y);",
        "  vec2 q = q0 * (1.0 + uOut * 0.85);",
        "  float rr = length(q);",
        // The room's own light: brightest ahead of the reader, falling away
        // toward the corners so the frame has depth instead of one white.
        // Everything here sums to 0.52 at its darkest, which lands at #ea
        // after the film's inside exposure, still clear of the #e6 floor
        // the ink beats need behind them.
        "  float lum = 0.80;",
        "  lum += 0.10 * (1.0 - smoothstep(0.0, 1.4, rr));",
        "  lum -= 0.11 * smoothstep(0.8, 1.9, rr);",
        "  vec3 tint = vec3(0.0);",
        "  float seams = 0.0;",
        // The near shell: big facet cells turning slowly with the scroll,
        // each one a flat shade with one soft ramp of light across it.
        "  vec2 idA;",
        "  vec2 qa = rot(0.35 + uK * 0.045) * q * 1.5 + vec2(uK * 0.085, uK * 0.022);",
        "  vec3 va = facets(qa, idA);",
        "  vec2 dirA = normalize(hash2(idA + 17.0) - 0.5);",
        "  lum += (hash(idA) - 0.5) * 0.14 + dot(va.yz, dirA) * 0.06;",
        "  float eA = 1.0 - smoothstep(0.0, 0.03, va.x);",
        "  float eAr = 1.0 - smoothstep(0.0, 0.03, va.x - 0.012);",
        "  float eAb = 1.0 - smoothstep(0.0, 0.03, va.x + 0.010);",
        "  seams += eA * 0.16;",
        "  lum += eA * 0.09;",
        // Red pulled to one side of every edge and blue to the other: the
        // stone's own fire trick at a whisper, and only ever on an edge.
        "  tint += (vec3(eAr, eA, eAb) - vec3(eA)) * 0.10;",
        // The far shell: larger, softer cells counter-turning behind the
        // near ones.
        "  vec2 idB;",
        "  vec2 qb = rot(-0.62 - uK * 0.03) * q * 0.8 + vec2(-uK * 0.05, uK * 0.04);",
        "  vec3 vb = facets(qb, idB);",
        "  lum += (hash(idB + 3.7) - 0.5) * 0.05;",
        "  float eB = 1.0 - smoothstep(0.0, 0.06, vb.x);",
        "  seams += eB * 0.06;",
        "  lum += eB * 0.04;",
        // Two broad beams of light crossing the room as it turns.
        "  for (int i = 0; i < 2; i++) {",
        "    float fi = float(i);",
        "    float ang = 0.9 + fi * 2.2 + uK * (0.05 + 0.03 * fi) * (fi < 0.5 ? 1.0 : -1.0);",
        "    float b = dot(q, vec2(cos(ang), sin(ang))) - sin(uK * 0.22 + fi * 2.7) * 0.4;",
        "    lum += exp(-b * b * 3.0) * 0.045;",
        "  }",
        // Glints riding the scroll: a hard core inside a soft bloom.
        "  for (int j = 0; j < 4; j++) {",
        "    float fj = float(j);",
        "    vec2 gp = vec2(sin(uK * 0.83 + fj * 1.9) * (0.62 + 0.1 * fj), cos(uK * 0.6 + fj * 2.3) * (0.42 + 0.08 * fj));",
        "    float d2 = dot(q - gp, q - gp);",
        "    lum += exp(-d2 * 520.0) * 0.5 + exp(-d2 * 60.0) * 0.06;",
        "  }",
        // Inclusions: the birthmarks a gemologist maps to tell one stone from
        // every other one on earth. Three layers at three parallaxes, mostly
        // dark pinpoints with the odd feather catching the light. They are
        // the only thing in this room with a knowable size, which is the
        // whole job — without them the place reads as graphics, and with them
        // it reads as the inside of something very small.
        "  float incl = 0.0;",
        "  float feather = 0.0;",
        "  for (int i = 0; i < 3; i++) {",
        "    float fi = float(i);",
        "    vec2 ip = q * (7.0 + fi * 6.0) + vec2(uK * (0.10 - fi * 0.028), uK * 0.03 * (fi - 1.0));",
        "    vec2 ic = floor(ip);",
        "    vec2 off = fract(ip) - hash2(ic + fi * 31.0);",
        "    float s = step(0.93, hash(ic + fi * 7.0)) * exp(-dot(off, off) * (900.0 - fi * 210.0));",
        "    incl += s * (0.5 - fi * 0.12);",
        "    feather += s * step(0.62, hash(ic + 91.0)) * (0.4 - fi * 0.1);",
        "  }",
        "  lum -= incl * 0.26;",
        "  lum += feather * 0.6;",
        "  vec3 col = vec3(lum) + tint - vec3((tint.r + tint.g + tint.b) / 3.0);",
        /* SNELL'S WINDOW, and it is the shot the film was missing.
         *
         * The old cut arrived inside the stone with no orientation at all —
         * white curtain, then abstract room — which is exactly why it read
         * as a splice. Physics hands you the establishing shot for free:
         * past the critical angle a diamond is a mirror, so from in here the
         * ENTIRE outside world is squeezed into one bright disc overhead and
         * everything around it is the dark room folded back on itself. The
         * four claws that were holding the girdle bite into the rim of it.
         *
         * It is a reveal, not a dissolve: the mirror stops being a mirror as
         * the reader sinks, so the darkness lifts off the room rather than
         * the room fading up through it. The window recedes and shrinks
         * while it happens, which is what selects "sinking away from the
         * table" over "a light coming on". */
        "  if (uIn > 0.001) {",
        "    float t = 1.0 - uIn;",
        "    vec2 wc = q - vec2(0.0, 0.08 + 0.14 * t);",
        "    float wr = length(wc);",
        "    float wa = atan(wc.y, wc.x);",
        // A refracted rim, never a drawn circle.
        "    float edge = 0.70 - 0.46 * t",
        "      + 0.026 * sin(wa * 3.0 + uK * 0.05)",
        "      + 0.015 * sin(wa * 7.0 - 1.7)",
        "      + 0.009 * sin(wa * 11.0 + 2.3);",
        // Four narrow fingers biting into the rim. Wide ones do not read as
        // claws at all: they take a quadrant each and the window comes out
        // as a plus sign.
        "    float claw = 0.0;",
        "    for (int i = 0; i < 4; i++) {",
        "      float ca = float(i) * 1.5707963 + 0.55;",
        "      float dd = abs(mod(wa - ca + 3.14159265, 6.2831853) - 3.14159265);",
        "      claw = max(claw, 1.0 - smoothstep(0.0, 0.2, dd));",
        "    }",
        // A portrait frame is narrower than it is tall, and a window sized to
        // the height runs straight off both sides of it, taking the claws
        // with it. Sized to whichever half-extent is smaller, the shot is the
        // same shot on a phone as on a monitor.
        "    edge *= (1.0 - 0.17 * claw) * min(1.0, uA / 0.95);",
        "    float win = 1.0 - smoothstep(edge - 0.05, edge + 0.015, wr);",
        "    float rim = 1.0 - smoothstep(0.0, 0.03, abs(wr - edge));",
        /* The shroud darkens what is OUTSIDE the window and nothing else,
         * and it lifts as the reader sinks. Two things had to be right here.
         * Darkening both sides by the same amount is a dissolve wearing a
         * window's clothes, and it shows. And the attenuation has to be
         * GEOMETRIC: a mix toward black can never be darker than its own
         * blend factor, so at four fifths of the way in it is stuck at a
         * fifth of full brightness — which, at the exposure the inside of
         * the stone is graded to, is a light grey, not a mirror. An
         * exponent holds true black for as long as the window is up and
         * then lets the room in quickly, which is also what sinking away
         * from a surface actually looks like. */
        "    col *= exp(-6.5 * uIn * (1.0 - win));",
        "    col += vec3(win * uIn * 0.16 + rim * uIn * 0.42);",
        // The rim is an edge, and colour belongs on edges: the same trick
        // the stone's fire and the room's seams are made of.
        "    col += vec3(0.11, 0.0, -0.11) * rim * uIn * 0.6;",
        "  }",
        /* The way out is the way in, run backwards. The room dims to its own
         * seams and the lines of light outlive it — and then, instead of
         * fading to nothing, they gather into the one shape this whole place
         * is inside: the octagon of the table. It shrinks to the size the
         * stone's own table will have in the first coda frame, holds, and
         * goes out just as the cut lands. The coda opens face-up on that
         * octagon, lit. Shape carried across a splice is the oldest trick
         * there is and it is still the only thing that makes two shots one
         * place. */
        "  float body2 = (1.0 - uOut) * (1.0 - uOut);",
        "  float lines = seams * (1.0 - uOut) * 1.6 * smoothstep(0.0, 0.45, uOut);",
        "  col = col * body2 + vec3(lines);",
        // The octagon carries its own two numbers rather than being derived
        // from uOut: nested smoothsteps left it at full size for one frame
        // and gone the next, and a shape that has to be RECOGNISED across a
        // cut needs to be held long enough to be read.
        "  if (uTabA > 0.001) {",
        "    vec2 og = rot(0.3927 + uK * 0.006) * q0;",
        "    float od = max(max(abs(og.x), abs(og.y)), (abs(og.x) + abs(og.y)) * 0.7071068);",
        "    float orad = mix(1.15, 0.222, uTab);",
        "    float ow = mix(0.05, 0.009, uTab);",
        // Five, because by now the film's exposure has been pulled all the
        // way down to its floor to reach black, and a line written at 1.0
        // comes out of that grade as a grey pencil mark.
        "    col += vec3((1.0 - smoothstep(0.0, ow, abs(od - orad))) * uTabA * 5.0);",
        "  }",
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

  /* ---------------------------------------------------------------- the lens */

  /* One post-process pass, fitted only for the two stretches that want a
   * lens rather than a window. Everywhere else the film draws straight to
   * the canvas exactly as it always has, and the target is not even
   * allocated until the first frame that asks for it.
   *
   * THE RACK FOCUS. Jewelry is photographed with a macro lens wide open,
   * where the plane of focus is a millimetre or two thick, and a focus PULL
   * is the most emotional move in the whole vocabulary — it tells you what
   * to care about without moving the camera an inch. So as the box leaves,
   * it melts rather than slides; then focus drifts forward onto the near arc
   * of the band, and is pulled back onto the stone as the stone rises out of
   * the claws. Depth comes from a real depth texture and the circle of
   * confusion is the honest |z - f| / z, so what goes soft is what is
   * actually at the wrong distance — the far side of the shank, the box on
   * its way off, the ring once it has been carried away.
   *
   * THE PRESS. The last thousandths before the table are a piece of glass
   * being put against the eye: the frame squeezed toward its centre and
   * split by channel at the rim, which is what n = 2.42 does to a picture.
   * That, and one hard flash at contact, is the whole crossing. The old
   * white dissolve was an admission that the two shots would not join; this
   * is the join.
   *
   * COLOUR, which is where all the cost turned out to be. Three renders into
   * a target in the working (linear) space, so the obvious target is half
   * float: eight bits of LINEAR light in a room this dark bands on sight.
   * But measured, that round trip cost more than everything else on the
   * stage put together, and almost none of it was the taps — it was writing
   * every fragment of the scene at sixteen bits a channel and reading the
   * whole frame back.
   *
   * An UNSIGNED_BYTE target tagged sRGB gets three to ask WebGL2 for an
   * SRGB8_ALPHA8 attachment, and the hardware then does both conversions for
   * free: the materials still write linear, the framebuffer encodes on the
   * way in, the sampler decodes on the way out. So the gather still happens
   * in linear — the only place a blur is allowed to happen — the darks get
   * sRGB's own precision instead of eight flat linear bits, and the whole
   * pass moves half the bytes. This pass still does the final encode itself
   * on the way to the canvas. */
  const TAPS = lowPower ? 8 : 16;
  const lens = (() => {
    const lScene = new THREE.Scene();
    const lCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
    );
    const mat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCol: { value: null },
        uDep: { value: null },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.08 },
        uFar: { value: 80 },
        uFocus: { value: 6 },
        uAper: { value: 0 },
        uPress: { value: 0 },
        uA: { value: 1 },
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = position.xy * 0.5 + 0.5;",
        "  gl_Position = vec4(position.xy, 0.0, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "varying vec2 vUv;",
        "uniform sampler2D uCol;",
        "uniform sampler2D uDep;",
        "uniform vec2 uTexel;",
        "uniform float uNear;",
        "uniform float uFar;",
        "uniform float uFocus;",
        "uniform float uAper;",
        "uniform float uPress;",
        "uniform float uA;",
        "float viewZ(vec2 uv) {",
        "  float d = texture2D(uDep, uv).x * 2.0 - 1.0;",
        "  return (2.0 * uNear * uFar) / (uFar + uNear - d * (uFar - uNear));",
        "}",
        /* The circle of confusion, in pixels: how far off the plane of focus
         * this fragment is, relative to its own distance. It saturates at a
         * third of a stop rather than running away, and that is a sampling
         * decision, not a photographic one — a fixed budget of taps spread
         * over an unbounded radius stops being a blur and starts being a
         * ring of copies, which is the one artefact that gives a cheap depth
         * of field away. Nothing beyond the subject here is more than a
         * gradient anyway. */
        "float coc(float z) {",
        "  return clamp(abs(z - uFocus) / max(z, 0.001) * 2.6, 0.0, 1.0) * uAper;",
        "}",
        "void main() {",
        "  vec3 col;",
        "  if (uPress > 0.0005) {",
        "    vec2 c = (vUv - 0.5) * vec2(uA, 1.0);",
        "    float r2 = dot(c, c) / (0.25 * (uA * uA + 1.0));",
        "    float k = uPress * (0.26 * r2 + 0.14 * r2 * r2);",
        "    float f = uPress * (0.003 + 0.022 * r2);",
        "    vec2 b = vUv - 0.5;",
        "    col.r = texture2D(uCol, 0.5 + b * (1.0 - k + f)).r;",
        "    col.g = texture2D(uCol, 0.5 + b * (1.0 - k)).g;",
        "    col.b = texture2D(uCol, 0.5 + b * (1.0 - k - f)).b;",
        "  } else if (uAper > 0.02) {",
        "    float z = viewZ(vUv);",
        "    float rad = coc(z);",
        "    if (rad < 0.9) {",
        "      col = texture2D(uCol, vUv).rgb;",
        "    } else {",
        "      vec3 sum = texture2D(uCol, vUv).rgb;",
        "      float wsum = 1.0;",
        /* Taps on a golden-angle spiral: an even disc at any radius, and no
         * ring artefacts, which a square kernel gives away instantly.
         * Sixteen of them, or eight on a phone — where the aperture is
         * narrowed to match, so the SPACING between samples stays about the
         * same and the halved count costs sharpness of the bokeh rather than
         * introducing the rings a sparser disc would. */
        "      for (int i = 0; i < " + TAPS + "; i++) {",
        "        float fi = float(i);",
        "        float a = fi * 2.3999632;",
        "        float dp = sqrt((fi + 0.5) / " + TAPS + ".0) * rad;",
        "        vec2 su = vUv + vec2(cos(a), sin(a)) * dp * uTexel;",
        "        float zs = viewZ(su);",
        /* Whether a neighbour reaches this fragment is decided by ITS circle
         * of confusion, not by this fragment's.
         *
         * A neighbour behind is simply gathered. One in front only arrives if
         * its own blur is wide enough to scatter this far — which is what
         * stops a sharp foreground smearing across the subject, and, just as
         * importantly, what lets a DEFOCUSED one spread outward the way real
         * bokeh does. Weighing a front neighbour against this fragment's
         * radius instead, as this did until v0.3.0, forbids the spread in
         * both cases: the object's own edge darkens as it gathers the ground
         * behind it while the ground receives nothing back, and a hard dark
         * line gets drawn around every lit thing on the stage. That outline
         * was the artefact, not the model. */
        "        float w = zs < z - 0.02 ? clamp(coc(zs) - dp + 1.0, 0.0, 1.0) : 1.0;",
        "        sum += texture2D(uCol, su).rgb * w;",
        "        wsum += w;",
        "      }",
        "      col = sum / wsum;",
        "    }",
        "  } else {",
        "    col = texture2D(uCol, vUv).rgb;",
        "  }",
        "  gl_FragColor = vec4(col, 1.0);",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
    });
    const tri = new THREE.Mesh(geo, mat);
    tri.frustumCulled = false;
    lScene.add(tri);

    let rt = null;
    const size = new THREE.Vector2();
    function target(w, h) {
      if (rt && rt.width === w && rt.height === h) return rt;
      if (rt) {
        rt.depthTexture.dispose();
        rt.dispose();
      }
      rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        colorSpace: THREE.SRGBColorSpace,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
      });
      rt.texture.generateMipmaps = false;
      rt.texture.wrapS = THREE.ClampToEdgeWrapping;
      rt.texture.wrapT = THREE.ClampToEdgeWrapping;
      const dep = new THREE.DepthTexture(w, h);
      dep.type = THREE.UnsignedIntType;
      dep.format = THREE.DepthFormat;
      dep.minFilter = THREE.NearestFilter;
      dep.magFilter = THREE.NearestFilter;
      rt.depthTexture = dep;
      mat.uniforms.uCol.value = rt.texture;
      mat.uniforms.uDep.value = dep;
      mat.uniforms.uTexel.value.set(1 / w, 1 / h);
      return rt;
    }

    return {
      scene: lScene,
      cam: lCam,
      mat,
      /** Blur radius is named as a fraction of frame height, so the lens is
       * the same lens on a phone as on a monitor and the same on either
       * pixel ratio. */
      set(focus, aperFrac, press, aspect) {
        renderer.getDrawingBufferSize(size);
        mat.uniforms.uFocus.value = focus;
        mat.uniforms.uAper.value = aperFrac * size.y;
        mat.uniforms.uPress.value = press;
        mat.uniforms.uA.value = aspect;
        mat.uniforms.uNear.value = camera.near;
        mat.uniforms.uFar.value = camera.far;
      },
      draw() {
        renderer.getDrawingBufferSize(size);
        renderer.setRenderTarget(target(size.x, size.y));
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(lScene, lCam);
      },
    };
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
        // layoutGallery, which runs at boot and again on resize. Across the
        // band, four lanes with jitter rather than a free scatter: vertical
        // neighbours always land in different lanes, so the pieces read as
        // a drift of singles instead of a collage of collisions.
        const lane = (j + bi) % 4;
        item.dataset.x = ((lane + 0.14 + rand() * 0.58) / 4).toFixed(4);
        item.dataset.t = ((j + rand() * 0.85) / perBand[bi].length).toFixed(4);
        item.dataset.w = (0.72 + rand() * 0.56).toFixed(3);
        item.dataset.r = ((rand() * 10 - 5) * (0.6 + 0.4 * band.scale)).toFixed(2);
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
        const base = clamp(w * 0.14, 76, 200) * band.scale;
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
  const focusV = new THREE.Vector3();
  const camInv = new THREE.Matrix4();

  function filmAt(p, now, dt) {
    const aspect = viewW / viewH;

    /* The box. Its turn ARRIVES rather than easing to a halt — it goes a
     * degree or two past square and rocks back, which is what a hand does
     * and what a slider never does. On the way out it leans into its own
     * travel, because a thing being carried tips toward where it is going;
     * without that it reads as a sprite sliding on a rail. */
    const turnK = arrive(smooth(seg(p, B.turn[0], B.turn[1])));
    const outK = easeIn3(seg(p, B.boxOut[0], B.boxOut[1]));
    const open = hinge(seg(p, B.open[0], B.open[1]));
    let boxYaw = 0.62 * (1 - turnK) - 0.35 * outK;
    box.root.rotation.y = boxYaw;
    box.root.rotation.z = -0.13 * outK;
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

    // The lamp follows the lid; its glow leaves with the box. Clamped,
    // because the sprung hinge is allowed to overshoot its stop and a lamp
    // brighter than lit has no meaning downstream.
    const lit = clamp(
      Math.max(open * (1 - seg(p, B.boxOut[1] - 0.02, B.boxOut[1] + 0.03)), teaseLit),
      0,
      1
    );
    const openNow = Math.max(open, teaseOpen);

    // The ring. It rises and settles rather than gliding to a stop, and it
    // is carried off with a turn and a tip in it — the whole point of the
    // ranges overlapping is that the box is already leaving while the ring
    // is still coming up, and the ring is already going while the stone is
    // settling above it. Sequential moves read as animation; overlapping
    // moves read as handling.
    const riseK = arrive(smooth(seg(p, B.ringUp[0], B.ringUp[1])));
    // A shallower ease-in than the box's: a cubic start is so lazy that the
    // first tenth of the move is invisible, and the whole point of the
    // overlap is that the ring is SEEN to be already going.
    const ringOutK = Math.pow(seg(p, B.ringOut[0], B.ringOut[1]), 1.7);
    const freeTurn = 1.15 * smooth(seg(p, B.ringUp[0], B.stoneUp[1]));
    const ringY = SEAT + RING_RISE * riseK;
    ring.root.position.set(9 * ringOutK, ringY - 0.5 * ringOutK, 0);
    // Seated, the ring turns with the box that holds it; risen, it takes
    // over its own presentation turn from the same angle.
    const ringYaw = boxYaw + freeTurn + 0.5 * ringOutK;
    ring.root.rotation.y = ringYaw;
    ring.root.rotation.z = 0.2 * ringOutK;

    // The stone. Never anything but x = 0: it is the one piece that stays,
    // and since v0.3.0 it is never anything but its own size either. The
    // camera goes to it.
    const liftK = smooth(seg(p, B.stoneUp[0], B.stoneUp[1]));
    const enterK = seg(p, B.enter[0], B.enter[1]);
    const inCoda = p >= CODA[0];
    // The relight is already under way at the cut — the range opens before
    // CODA does — so the stone's table arrives lit rather than climbing out
    // of a black frame the octagon has just left.
    const codaIn = smooth(seg(p, CODA[0] - 0.008, CODA[0] + 0.034));
    const stoneY = ringY + GIRDLE + S_LIFT * liftK;
    stone.root.position.set(0, stoneY, 0);

    // Its own turn: scrubbed by scroll for everyone, idling on the clock at
    // full lift for those who allow motion, and settling to the nearest
    // eighth on the way back down so the claws land on the bezel facets.
    // The coda turns the same accumulated angle again, plus its own scrub,
    // so the stone that comes back is the stone that left, mid-thought.
    const g = smooth(seg(liftK, 0.55, 1));
    const idling =
      (p < B.enter[1] && p > B.stoneUp[0]) || (inCoda && p < 1);
    if (!held && !reduceMotion.matches && g > 0.999 && idling) {
      idleTurn = (idleTurn + dt * 0.45) % (Math.PI * 2);
    }
    const EIGHTH = Math.PI / 4;
    const settled = Math.round(idleTurn / EIGHTH) * EIGHTH;
    const scrubTurn = 2.3 * seg(p, B.solo[0], B.enter[1]);
    const codaTurn = 1.15 * seg(p, CODA[0], 1);
    let stoneSpin = ringYaw + scrubTurn + codaTurn + lerp(settled, idleTurn, g);
    if (spinHeld !== null) stoneSpin = spinHeld;

    // The lens goes first: the stone's flare is asked about this frame's
    // eye, not the last one's. Exposure swells on the way into the stone
    // and comes back down as the white room folds away, or the collapse
    // would sit at grey instead of reaching black; the coda then breathes
    // it back up from that black as the stone relights.
    cameraAt(p, aspect);
    const collapseK = smooth(seg(p, B.collapse[0], B.collapse[1]));
    renderer.toneMappingExposure = Math.max(
      0.2,
      inCoda
        ? lerp(0.22, 1.12, codaIn)
        : 1.12 + 1.0 * easeIn3(enterK) - 1.9 * collapseK
    );

    // Lighting and reveal, exactly the numbers the box would have used. In
    // the coda the stone's tent comes up with codaIn, so the piece emerges
    // out of the dark instead of snapping on; the box and the ring sat far
    // off stage either side, and stand down from the draw entirely.
    const boxReveal = THREE.MathUtils.smoothstep(openNow, 0.02, 0.3);
    const ringLit = clamp(Math.max(lit * boxReveal, riseK), 0, 1);
    const stoneLit = inCoda ? codaIn : Math.max(ringLit, liftK);
    const reveal = clamp(Math.max(boxReveal, riseK), 0, 1);
    box.root.visible = !inCoda;
    ring.root.visible = !inCoda;
    /* Two shadow maps is one more than most of this film needs. The key's is
     * only ever read by surfaces inside the open box; once the box has gone
     * there is nothing left on stage that receives a shadow at all, so the
     * light stands down and its whole pass goes with it — for the two thirds
     * of the film that follows. */
    key.castShadow = p < B.boxOut[1] + 0.02;

    eyeV.copy(camera.position);
    const eyeOk = enterK < 0.12 || inCoda ? eyeV : null;
    box.update({ open: openNow, lit, eye: eyeV });
    ring.update({ lit: ringLit });
    stone.update({ lit: stoneLit, spin: stoneSpin, reveal, eye: eyeOk });

    // The stone's cast light on the velvet: brightest with the lamp and the
    // piece still down in the cushion, spreading and dimming as the ring is
    // lifted away from it (which is what a cast pattern does), gone with the
    // box. It turns with the stone that throws it, so the wheel of it and
    // the piece above it are never out of step.
    const castK = lit * boxReveal * (1 - 0.62 * riseK) * (1 - outK);
    caustic.visible = !inCoda && castK > 0.012;
    if (caustic.visible) {
      caustic.material.opacity = 0.9 * castK;
      const spread = 2.5 * (1 + 1.15 * riseK);
      caustic.scale.set(spread, spread, 1);
      caustic.rotation.z = stoneSpin - boxYaw;
    }

    /* The lens. Focus rides the subject's own axis; the PULL is an offset
     * along the view — forward onto the near arc of the band as the box
     * leaves, then drawn back onto the stone as the stone comes up out of
     * the claws. That is the whole rack focus, and it is why the ring goes
     * to bokeh at exactly the moment the reader is meant to stop looking at
     * it. Aperture opens and closes around the stretch so the rest of the
     * film never pays for the pass. */
    /* No rack focus on a phone. Measured, the pass's fixed cost is not the
     * taps at all — it is rendering the whole scene into a target and reading
     * the whole frame back, and that is a quarter of the film's length spent
     * paying it. An 8-bit sRGB target (see `lens`) took most of that cost
     * off, but "most of the biggest thing on the stage" is still the biggest
     * thing on the stage, and a dropped frame under a thumb is worse than a
     * shallow lens is good. The press keeps its own pass; it is four
     * hundredths of the track and it is the transition. */
    const aperF = lowPower
      ? 0
      : 0.017 *
        smooth(seg(p, B.focus[0], B.focus[0] + 0.052)) *
        (1 - smooth(seg(p, B.focus[1] - 0.048, B.focus[1])));
    const pressK = easeIn3(seg(p, B.press[0], B.press[1]));
    const lensOn = !inCoda && (aperF > 0.0004 || pressK > 0.0005);
    let focusZ = 6;
    if (lensOn && aperF > 0.0004) {
      camera.updateMatrixWorld();
      camInv.copy(camera.matrixWorld).invert();
      // The plane of focus sits on the ring's head, and the pull carries it
      // up onto the stone — deliberately a beat BEHIND the stone's own rise,
      // so the brilliant drifts soft on its way out of the claws and comes
      // sharp as the focus catches it. Both are on the same axis, so the
      // separation is the height the stone has gained, read through a camera
      // that is looking down at it; that is small, and it is exactly the
      // depth a macro lens has to work with on a real ring.
      const pullK = smooth(seg(p, B.stoneUp[0] + 0.026, B.stoneUp[1] + 0.012));
      focusV.set(0, lerp(ringY + GIRDLE, stoneY, pullK), 0).applyMatrix4(camInv);
      focusZ = Math.max(-focusV.z, 0.2);
    }

    /* Contact, and the vignette handed across with it. Not a dissolve — a
     * hit: dark right up to the table, one frame of bloom off the strike,
     * gone. The crystal room takes the canvas under the top of the spike, so
     * no frame ever shows the switch. The coda takes the vignette back,
     * because it plays in the dark room's photography even though the room
     * by then is only the stone and its light. */
    const veilK =
      easeIn3(seg(p, FLASH[0], FLASH[1])) * (1 - smooth(seg(p, FLASH[1], FLASH[2])));
    veil.style.opacity = veilK.toFixed(3);
    const vigK = Math.max(
      1 - smooth(seg(p, B.enter[0], B.press[1])),
      inCoda ? 0.85 * codaIn : 0
    );
    pin.style.setProperty("--vig", vigK.toFixed(3));

    // Which world the canvas shows. Past the collapse the crystal renders
    // itself black, and the coda takes the canvas back for the stone.
    const isInside = p >= B.inside[0] && !inCoda;
    // How much of the frame the stone is still mirroring: 1 the instant the
    // reader lands, 0 once the room has opened around them.
    const winK = isInside ? 1 - smooth(seg(p, B.window[0], B.window[1])) : 0;
    if (isInside) {
      inside.mat.uniforms.uK.value = p * 34;
      inside.mat.uniforms.uOut.value = smooth(seg(p, B.collapse[0], B.collapse[1]));
      inside.mat.uniforms.uA.value = aspect;
      inside.mat.uniforms.uIn.value = winK;
      // The table's octagon: it gathers out of the folding room, shrinks to
      // the size the stone's own table will have in the first coda frame,
      // holds there long enough to be read as a shape, and goes out exactly
      // on the cut. That hold is the whole match: a shape carried across a
      // splice has to be recognised, and recognition takes time.
      inside.mat.uniforms.uTab.value = smooth(
        seg(p, B.collapse[0] + 0.022, B.collapse[1] - 0.004)
      );
      // It dims into the cut but is never taken to nothing: the shape has to
      // still be on the retina when the stone's table arrives in its place.
      // A cut is what this join wants; a fade would only be the dissolve
      // coming back in through the other door.
      inside.mat.uniforms.uTabA.value =
        smooth(seg(p, B.collapse[0] + 0.02, B.collapse[0] + 0.034)) *
        (1 - 0.72 * smooth(seg(p, CODA[0] - 0.004, CODA[0])));
      renderer.render(inside.scene, inside.cam);
    } else if (lensOn) {
      lens.set(focusZ, aperF, pressK, aspect);
      lens.draw();
    } else {
      renderer.render(scene, camera);
    }

    /* The gallery rides the inside stretch. It comes up out of Snell's
     * window with the room rather than floating at full strength over the
     * dark the reader lands in, and dims out with the collapse rather than
     * hanging over the black that follows it. */
    const galleryOn = p > B.inside[0] && p < B.collapse[0] + 0.024;
    if (galleryEl) {
      galleryEl.classList.toggle("is-on", galleryOn);
      if (galleryOn) {
        const ik = seg(p, B.inside[0] + 0.03, B.collapse[0] + 0.02);
        const fade =
          (1 - smooth(seg(p, B.collapse[0], B.collapse[0] + 0.022))) * (1 - winK);
        galleryEl.style.opacity = fade.toFixed(3);
        BANDS.forEach((band, bi) => {
          const el = bandEls[bi];
          if (!el) return;
          const spanPx = parseFloat(el.dataset.span) || 0;
          const y = viewH * 1.06 - ik * band.speed * (spanPx + viewH * 1.5);
          el.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)";
        });
        driveBeams(p, aspect, fade);
      } else if (beamsLit) {
        driveBeams(p, aspect, 0);
      }
    }

    // The chrome that answers the film: ink from the moment the room opens
    // around the reader to the moment the crystal folds away.
    nav.classList.toggle(
      "nav--ink",
      p > B.inside[0] + 0.022 && p < B.collapse[0] + 0.028
    );

    return teasing;
  }

  /* The room's two beams, handed to the page.
   *
   * The shader sweeps them across the crystal; the pieces drifting through
   * it and the words standing in it are DOM, and light that stops dead at
   * the edge of the canvas is what makes an overlay read as subtitles rather
   * than as type inside a place. So the same two beams are computed here
   * with the same arithmetic — they have to be the SAME beams, or the eye
   * catches the lie immediately — and published as position and angle for
   * two elements that screen over the gallery. Screen, because on the room's
   * white it changes nothing at all and on a photographed piece it flares:
   * the light lands on the world without ever touching the contrast the ink
   * beats are measured against. */
  let beamsLit = false;
  function driveBeams(p, aspect, level) {
    const lit = level > 0.001;
    if (lit !== beamsLit) {
      beamsLit = lit;
      pin.classList.toggle("is-beamed", lit);
    }
    pin.style.setProperty("--beam", lit ? level.toFixed(3) : "0");
    if (!lit) return;
    const uK = p * 34;
    for (let i = 0; i < 2; i++) {
      const ang = 0.9 + i * 2.2 + uK * (0.05 + 0.03 * i) * (i ? -1 : 1);
      const off = Math.sin(uK * 0.22 + i * 2.7) * 0.4;
      // The shader works in a frame whose y runs -1 to 1 and whose x is
      // scaled by the aspect; undo that to land back in pixels of the pin.
      const x = (((off * Math.cos(ang)) / aspect) * 0.5 + 0.5) * viewW;
      const y = (0.5 - off * Math.sin(ang) * 0.5) * viewH;
      // Along the band the aspect cancels between the two conversions, so
      // the screen angle is the plain perpendicular of the beam's normal.
      const rot = (Math.atan2(-Math.cos(ang), -Math.sin(ang)) * 180) / Math.PI;
      pin.style.setProperty("--b" + i + "x", x.toFixed(1) + "px");
      pin.style.setProperty("--b" + i + "y", y.toFixed(1) + "px");
      pin.style.setProperty("--b" + i + "r", rot.toFixed(2) + "deg");
    }
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
    const dpr = pixelRatio();
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
    // The coda stone idles on the clock too, and freezes the moment the
    // film parks at 1, so the renderer sleeps under the finale.
    const codaLive =
      !held &&
      !reduceMotion.matches &&
      pDrawn > CODA[0] + 0.004 &&
      pDrawn < 1;
    const settling = pDrawn !== pTarget;
    const introLive = !held && introT0 && introK < 1;
    if (settling || teasing || soloLive || codaLive || introLive) wake();
  }

  /* ------------------------------------------------------------- the boot */

  function setLoad(v) {
    if (loaderFill) loaderFill.style.transform = "scaleX(" + v + ")";
  }

  /* The match cut that opens the film.
   *
   * The loading screen is a hairline of light on black. The tease, a few
   * seconds later, is a hairline of lamp light in the lid's seam. Those are
   * the same image and the page had never said so. So the bar does not fade
   * out — it flies to where the seam actually is on screen, taking the
   * seam's own width and tilt with it, and the lid cracks on it as it lands.
   * The progress bar was the box all along.
   *
   * The target is measured rather than guessed: the box's own rim, at the
   * height the lid parts on, projected through the film's own opening
   * camera. So it lands on the seam at any viewport, and follows it when the
   * viewport changes under a loader that is still up. */
  const seamV = new THREE.Vector3();
  function seamTarget() {
    const bar = loaderFill && loaderFill.parentNode;
    if (!bar || held) return;
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    if (!w || !h) return;
    cameraAt(0, w / h);
    camera.updateMatrixWorld();
    const hw = box.metrics.width / 2;
    const hd = box.metrics.depth / 2;
    // The yaw the box opens the film on, which is the film's own first key.
    const yaw = KEYS[0].yaw;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const pts = [];
    for (const ex of [-1, 1]) {
      for (const ez of [-1, 1]) {
        seamV
          .set(ex * hw * cy + ez * hd * sy, box.metrics.baseH, -ex * hw * sy + ez * hd * cy)
          .project(camera);
        pts.push({ x: (seamV.x * 0.5 + 0.5) * w, y: (0.5 - seamV.y * 0.5) * h });
      }
    }
    // The two corners lowest on screen are the near edge of the rim, which
    // is the length of seam the reader can actually see.
    pts.sort((a, b) => b.y - a.y);
    const a = pts[0].x <= pts[1].x ? pts[0] : pts[1];
    const b = pts[0].x <= pts[1].x ? pts[1] : pts[0];
    const r = bar.getBoundingClientRect();
    const tw = Math.hypot(b.x - a.x, b.y - a.y);
    if (!r.width || !tw) return;
    bar.style.setProperty("--seam-dx", ((a.x + b.x) / 2 - (r.left + r.width / 2)).toFixed(1) + "px");
    bar.style.setProperty("--seam-dy", ((a.y + b.y) / 2 - (r.top + r.height / 2)).toFixed(1) + "px");
    bar.style.setProperty("--seam-sx", (tw / r.width).toFixed(3));
    bar.style.setProperty(
      "--seam-rot",
      ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toFixed(2) + "deg"
    );
  }

  let shownAt = performance.now();
  function finishLoader() {
    loaderDone = true;
    setLoad(1);
    // The bar is allowed its moment even on a machine that needed none.
    const wait = Math.max(0, 850 - (performance.now() - shownAt));
    setTimeout(() => {
      seamTarget();
      retireLoader();
      introT0 = performance.now();
      // Timed to the landing, not to a comfortable pause: the crack opens on
      // the hairline while the hairline is still there to be replaced by it.
      armTease(980);
      armCue();
      wake();
    }, wait);
  }

  function resize() {
    viewW = pin.clientWidth;
    viewH = pin.clientHeight;
    if (!viewW || !viewH) return;
    trackLen = Math.max(journey.offsetHeight - viewH, 1);
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    layoutGallery();
    // A viewport that changes under a loader still on screen moves the seam
    // the hairline is about to fly to, so the target is re-measured with it.
    if (!loaderDone) seamTarget();
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
    if (pTarget >= 0.44) armGallery();
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
    if (heldP >= 0.44) armGallery();
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
   * shader passes, the crystal room and the lens would otherwise compile
   * mid-story, and a compile is a visible hitch on the one scroll it
   * interrupts. The lens's render target is still left to be allocated on
   * the first frame that actually asks for it — the compile is the hitch,
   * the allocation is not, and a reader who never scrolls that far should
   * not be carrying a full-frame float buffer for nothing. */
  stone.update({ lit: 1, spin: 0, reveal: 1, eye: null });
  renderer.compile(scene, camera);
  renderer.compile(inside.scene, inside.cam);
  renderer.compile(lens.scene, lens.cam);

  setLoad(0.86);
  resize();
  readScroll();

  /* ?fps=<0..1>: draw that one frame of the film sixty times as fast as the
   * machine will, and print the median cost of it.
   *
   * Every expense on this page is a fragment cost, and a fragment cost cannot
   * be read off a source file — the only honest way to answer "it lags" is to
   * measure the frame at the progress that lags. Two things make this a
   * straight loop rather than a rAF one. rAF is vsynced, so on any desktop
   * GPU everything under 16ms reads the same; and under the virtual clock
   * headless Chrome needs in order to WAIT for a result, rAF deltas are
   * virtual too and measure nothing at all. A synchronous loop with a
   * gl.finish() after each draw is real work in real time, and it finishes
   * before the load event, which is what --dump-dom waits for. */
  if (params.has("fps")) {
    const at = clamp(parseFloat(params.get("fps")) || 0, 0, 1);
    if (at >= 0.44) armGallery();
    const gl = renderer.getContext();
    // A one-pixel readback, not gl.finish(): finish() is free to return once
    // the commands are queued, and a software rasteriser happily reports a
    // fullscreen shader as cheaper than one small mesh if you believe it.
    // A read of the framebuffer cannot be answered until the frame is drawn.
    const px = new Uint8Array(4);
    const N = 60;
    const dts = [];
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      renderer.shadowMap.needsUpdate = true;
      // A hair of movement each pass, or half the scene short-circuits on
      // "nothing changed" and the loop measures an idle page.
      filmAt(at + (i & 1) * 0.00002, t0, 0.016);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (i > 5) dts.push(performance.now() - t0);
    }
    dts.sort((a, b) => a - b);
    const ms = dts[dts.length >> 1] || 0;
    const out =
      "p=" + at + "  " + ms.toFixed(2) + " ms  " + (1000 / ms).toFixed(0) +
      " fps  buf=" + canvas.width + "x" + canvas.height;
    document.title = out;
    const el = document.createElement("pre");
    el.id = "fps-out";
    el.textContent = out;
    document.body.appendChild(el);
    return;
  }
  // A page restored mid-track opens on that frame rather than replaying
  // the whole film at it.
  pDrawn = pTarget;
  wake();
})();
