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
 * curtain of black. Now the table is crossed as an OPTICAL event (the frame
 * squeezed and split by channel the way glass does to a picture, one hard
 * flash at contact), and the flash is the whole of the way in: the crystal
 * room takes the canvas under the top of the spike, already open, so no
 * frame ever shows the switch. The way out is the room going down to black
 * for the cut. Both ends used to carry the octagon of the table, drawn as
 * Snell's window arriving and as the collapse leaving; the reader asked for
 * that business gone (v0.3.5) and it is gone from both.
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
 *   ?flat=1        the box's three paintings, flat, on one sheet
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
import { createRingBox, drawArtwork } from "./models/ring-box.js";
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
  /* The site's ground, stamped into every page by the footer partial. On this
   * one page the film owns its strength: the canvas above it is transparent as
   * of v0.3.7, so the silk IS the wall the ring box stands against, and there
   * is one stretch of the story where it must not exist at all. */
  const velvetEl = document.getElementById("velvet");
  if (!journey || !pin || !canvas || !veil || !loaderEl || !nav) return;

  const params = new URLSearchParams(location.search);
  /* QA knobs for the render path, alongside ?p= / ?prop= / ?q= below. Each
   * stands one layer down so its cost and its contribution can be read
   * separately, which is the only way to answer "what is this frame spending
   * it on" without a profiler: ?nostone, ?nolens, ?novelvet. */
  const DBG = params.has("fps") || params.has("dbg");
  const NO_LENS = params.has("nolens");
  /* How much silk the film is allowed, read from site.css rather than restated
   * here, so --velvet-a stays the one place the ground's strength is written
   * down and the landing page can never drift from the rest of the site. The
   * film scales this; it never raises it. One computed-style read at boot. */
  const VELVET =
    velvetEl && !params.has("novelvet")
      ? parseFloat(getComputedStyle(velvetEl).opacity) || 0
      : 0;
  let dbgState = "";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /* What this page is allowed to spend.
   *
   * A coarse pointer means a touch device. Until v0.3.2 that fact alone
   * bought a permanent set of penalties: resolution capped at 1.6 whatever
   * the screen, the rack focus removed outright, the gallery's depth of
   * field dropped. Every one of those was a GUESS about a machine nobody
   * here owns, made before anything was being measured, and the guess was
   * wrong in the expensive direction: a current phone runs this film at the
   * refresh rate, and what it got for its trouble was a visibly soft picture
   * on the densest screen in the house. Which is the reader's complaint,
   * exactly, and it was self-inflicted.
   *
   * So there is one dial now, `quality`, and the governor further down moves
   * it by watching frames actually land. A touch device simply STARTS lower,
   * because the opening seconds are the worst time to discover a device is
   * slow, and climbs within about a second if it can hold the rate. A phone
   * that can do it gets the whole film at full resolution; a phone that
   * cannot loses resolution rather than losing the film's look.
   *
   * What stays gated on the pointer is only what no phone screen can show:
   * half the shadow map (one soft shadow of a box on a cushion) and half the
   * bokeh taps, with the aperture narrowed to match so the sample SPACING is
   * unchanged and the cost comes off the smoothness rather than showing up
   * as rings.
   *
   * `?lp=1` forces the touch path on so it can be photographed, since
   * headless Chrome reports a fine pointer whatever size its window is. */
  const lowPower =
    params.get("lp") === "1" || matchMedia("(pointer: coarse)").matches;
  const DPR_CAP = 2;

  /* THE GOVERNOR.
   *
   * Every other economy on this page is a guess about a machine nobody here
   * owns. This one is not a guess: it watches the frames actually landing and
   * spends the only currency that buys frames back at a predictable rate,
   * which is pixels. Nothing about the film changes (no beat is cut, no
   * shader simplified, no prop dropped); it is drawn into a smaller buffer and
   * scaled up, and on a machine that was dropping frames a slightly softer
   * picture at the refresh rate beats a sharp one that stutters, every time.
   *
   * `quality` is that multiplier. It only ever moves on a sustained signal and
   * never more than once a second and a half, because the drawing buffer is
   * reallocated when it changes (and the lens's render target with it), and a
   * governor that hunts is worse than no governor at all. */
  let quality = lowPower ? 0.8 : 1;
  const QUALITY_MIN = 0.55;
  const pixelRatio = () =>
    Math.max(0.75, Math.min(window.devicePixelRatio || 1, DPR_CAP) * quality);

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
   * (artwork flat, missing WebGL2, standalone props, ?end) reveals it
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

  // ?flat=1: the model's paintings alone, for checking the artwork.
  if (params.get("flat") === "1") {
    const art = drawArtwork();
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
    /* Multisampling is bought per sample per pixel, and what it buys is edge
     * quality the display may already be providing for free. On a screen
     * dense enough that one CSS pixel is two device pixels the downsample is
     * itself an antialias, and MSAA on top of it measured at a sixth of the
     * frame for a difference that needs a loupe. So it is spent only where it
     * shows: a one-to-one display. It cannot be changed later, since the flag
     * belongs to the context, which is the other reason the governor below
     * works in resolution instead. */
    antialias: (window.devicePixelRatio || 1) < 1.5,
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

  /* ONE prefilter generator for the whole page, and it is worth a line of
   * plumbing. Each instance builds and compiles its own blur, equirect and
   * cubemap programs on first use, measured at 885ms here, and this page
   * wants two environments prefiltered: the room's studio, and the lit tent
   * the ring carries with it. Two generators compiled the same three programs
   * twice and cost three quarters of the entire boot. This one is handed to
   * the ring below and disposed once both have taken what they need. */
  const pmrem = new THREE.PMREMGenerator(renderer);

  /* An HDRI's job done by five emissive cards and a floor, run through
   * PMREM: a big soft key high left, a tall strip right for the long
   * highlight down a satin side, low fills so black plastic never falls to
   * a void, paper underfoot. */
  {
    const studio = new THREE.Scene();
    /* Every card carries a gel now. They were all `setScalar`, which is to
     * say all six were pure grey, and a polished surface can only reflect
     * what is actually in the room: grey cards in, grey metal out, at every
     * angle, forever. That is the real reason the picture read as flat, and
     * no amount of exposure could have fixed it, because the colour was
     * never in the source. The key is warm and the strip and fills are cool,
     * so a curved shank picks up a warm side and a cool rim and the eye gets
     * the roundness for free. The floor stays neutral: it is paper
     * underfoot, it is under everything, and a tint there would sit on all
     * six sides of every piece at once. */
    const card = (wc, hc, x, y, z, level, gel) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(wc, hc),
        new THREE.MeshBasicMaterial()
      );
      m.material.color.setHex(gel === undefined ? 0xffffff : gel).multiplyScalar(level);
      m.position.set(x, y, z);
      m.lookAt(0, 0.6, 0);
      studio.add(m);
    };
    card(10, 7, -4, 8, 5, 3.4, 0xfff0dc); // key, warm
    card(1.7, 8, 7.2, 3.5, -1.6, 5.2, 0xe4eeff); // right strip, cool rim
    card(5, 4, -7, 2.4, 1.6, 1.5, 0xe8f1ff); // left fill, cool
    card(7, 2.4, 0, 1.1, 8, 1.3, 0xfff6ec); // front fill, barely warm
    card(6, 4, 0, 4, -8, 0.7, 0xdde8ff); // back, cool
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 40),
      new THREE.MeshBasicMaterial()
    );
    floor.material.color.setScalar(0.85);
    floor.rotation.x = -Math.PI / 2;
    studio.add(floor);
    /* 64, not the default 256. This environment is five soft cards and a
     * floor. There is no detail in it above a few pixels, and PMREM's whole
     * job is to blur it further for roughness. At the default it was the
     * single most expensive thing in the boot, 858ms of a frozen main thread
     * before the loader had drawn a second frame; the render is quartered
     * twice over at 64 and there is nothing in the result an eye could tell
     * apart, because there was nothing there to lose. */
    scene.environment = pmrem.fromScene(studio, 0.04, 0.1, 100, { size: 64 }).texture;
  }

  /* The room. Dark, and no cast shadow anywhere in it: every glow and pool
   * belongs to the box's own lamp and lives in the model.
   *
   * NO scene.background, and that is the whole of what makes the silk behind
   * this page visible (v0.3.7). The renderer was already built with alpha and
   * a clear alpha of zero; a background Color was overwriting it with an
   * opaque near-black every frame, so the canvas was a solid rectangle over
   * the site's ground and the film played in a room of its own. Cleared to
   * nothing instead, every pixel the props do not cover is the page
   * underneath, which is the black silk, dimmed by home.js to whatever the
   * beat wants. The lens pass carries the alpha through with it; see the note
   * there, because a blur that gathers colour and drops coverage is the one
   * way this goes wrong.
   *
   * AND NO FLOOR, AND NO FOG, which is the other half of the same idea. There
   * was a 90-unit satin disc under the props carrying a radial fade in its own
   * alpha, and a fog graded to sit four units beyond whatever the camera was
   * looking at. The second only ever existed to serve the first: the fog's
   * whole job was to let the floor's far edge disappear rather than draw a
   * horizon, and with no floor there is nothing in this scene far enough away
   * to fog.
   *
   * THE FLOOR WENT BECAUSE IT WAS STANDING IN FRONT OF THE PICTURE. Seen from
   * a camera that is close and low, a rough surface under an environment map
   * is at its BRIGHTEST, so it filled most of the frame with a smooth mid grey
   * and left the silk as a strip along the top; the reader pointed at exactly
   * that and asked what the panel was. Starting its alpha fade earlier was
   * tried first and only moved the join further down the frame. The honest fix
   * is the one a bench would recognise: a ring box photographed on a sweep of
   * silk does not stand on a second surface, it stands on the silk.
   *
   * Nothing was lost with it. It never carried receiveShadow, so it was
   * catching nothing; three does no bounce lighting, so it was returning
   * nothing to the props either; and the box's own cushion, seat and shadowed
   * interior all live in ring-box.js. It was a picture of a floor, and the
   * picture behind it is now a real one. ?noground goes with it, since there
   * is no longer a layer to stand down. */
  if ("environmentIntensity" in scene) scene.environmentIntensity = 0.65;

  /* THE WALLS ARE THE PAGE'S OWN SILK NOW, and the dome that used to draw
   * them is gone (v0.3.7).
   *
   * What it was: a BackSide sphere carrying three gelled terms, a cool haze
   * at the horizon, a warm tungsten pool behind the subject and a broad cool
   * counter off the upper left, summing to values between 0.0008 and 0.018
   * before tonemapping. That is a black room with air in it, and it was the
   * right answer while the canvas was opaque and the page behind it was
   * paper. It is the wrong answer now: the site stands on a sweep of black
   * silk and the film's room is the same room, so the wall is simply let
   * through instead of being painted a second time. The reader gets a real
   * lit cloth behind the box rather than a gradient standing in for one.
   *
   * Three things came off with it, and all three are wins by construction:
   * the largest full-screen fragment shader in the opening chapter, the
   * renderOrder juggling it needed to stop being rasterised first, and the
   * ?nodome knob, which measured a cost this page no longer pays.
   *
   * WHAT REPLACED ITS JOB. The dome also kept the fogged rim of the floor
   * from ending against nothing. The floor's own radial alpha fade already
   * does that work (see the note above it), and it now fades into the silk
   * rather than into a painted horizon, which is the same transition with one
   * less surface in it. If a wall ever has to come back, write it new.
   */

  /* Gelled warm against the cool fill below. A single white key and a nearly
   * white fill is why the metal read as grey: white gold has nothing to
   * separate its lit side from its shaded side except brightness, and
   * brightness alone is what a photograph of jewelry never relies on. Two
   * gels give every curve on the shank a warm edge and a cool one, which is
   * the whole reason a bench owns more than one lamp. Kept mild: the stones
   * are colourless and a strong cast on those would be a lie. */
  const key = new THREE.DirectionalLight(0xfff2e2, 3.0);
  key.position.set(-5.5, 8.5, -1.5);
  /* CASTSHADOW IS SET ONCE HERE AND NEVER TOUCHED AGAIN, and that is the most
   * important line in this file.
   *
   * How many shadow-casting lights a scene has is part of three's program
   * cache key: change it and every material on the stage is a cache miss, and
   * every cache miss is a compile and a link, synchronously, inside the frame
   * that caused it. This film used to turn the key's shadow off once the box
   * had gone and turn the lamp's on as the lid opened, which reads as an
   * economy and measured, on this machine, as a 1.2 SECOND frame and a 3.0
   * SECOND frame: the two places the reader reported the page hanging. The
   * lamp's stall was long enough to swallow the whole lid-opening beat, which
   * is why the light appeared to arrive late, with the ring, instead of with
   * the lid: the frames that would have shown it were never drawn.
   *
   * The saving was real, though, and it survives: what actually costs
   * anything is RE-RENDERING the map, not declaring the light able to cast.
   * So the flag stands still and the per-light `shadow.autoUpdate` below
   * decides, frame by frame, whether the map is redrawn: same texels saved,
   * no program touched. */
  key.castShadow = true;
  key.shadow.autoUpdate = false;
  /* 1024 everywhere, not just on a phone. The argument that retired 2048 on
   * touch devices was never actually about the screen: the shadow camera
   * spans 14 units and the only caster in it is a box on a cushion, so 1024
   * still puts 73 texels on every unit of a soft PCF shadow with no hard
   * edge anywhere in it to give the resolution away. What it costs is real
   * and lands on the worst frames in the film, because the map is redrawn
   * exactly while the lid and the ring are moving, which is where the frame
   * budget was already gone. Measured on an Intel UHD 620 at 1366x768. */
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -7;
  key.shadow.camera.right = key.shadow.camera.top = 7;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 26;
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.34);
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
        ? createSolitaireRing({ renderer, pmrem, standing: true })
        : createBrilliantDiamond({ renderer, standing: true });
    pmrem.dispose();
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
  const ring = createSolitaireRing({ renderer, pmrem, bare: true });
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
  if (!params.has("nostone")) scene.add(stone.root);
  // Both environments are prefiltered by now; the generator's own programs
  // and scratch targets are of no further use to the page.
  pmrem.dispose();


  /* THE STONE'S CAST LIGHT IS GONE (v0.3.7).

   * What it was: an eight-fold wheel of hard little spots and short arcs
   * painted to a canvas, laid flat on the box's cushion as a child of the
   * box, turning with the stone that threw it and spreading and dimming as
   * the piece was lifted away. The argument for it was a good one, that a
   * brilliant under a lamp throws exactly that pattern and every macro film
   * of a ring in a box has the image in it.
   *
   * The argument against it is what a reader actually saw, which is a
   * scatter of dots sitting on top of the inside of the box, and they asked
   * for it to go. That is the honest report: painted rather than traced, it
   * could follow the stone's turn but never the stone's ACTUAL facets, so it
   * read as a texture laid on the velvet rather than as light thrown onto it,
   * and at the size the box is on screen there was never enough of it to be
   * read as caustics in the first place. The lamp in the lid does the work
   * this was decorating. If it ever comes back it has to be traced, and that
   * is a renderfarm's job rather than this page's. */

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
    window: [0.66, 0.699], // arrival: the gallery ramps in behind the flash
    collapse: [0.806, 0.852], // the white goes down to black for the cut
  };

  /* Contact. The old join was a slow white dissolve; this is a hit: the
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
   * The coda opens FACE-UP on the stone, small and far: the reader has spent
   * the last chapter inside it, so the first thing they get back is the one
   * view a diamond is ever photographed in. The camera then rolls down off
   * the face to the three-quarter the words stand beside. This used to be a
   * shape match, the collapse handing over the octagon of the table for the
   * coda to relight; the octagon is gone as of v0.3.5 and the shot holds up
   * on its own, so it stays. */
  const KEYS = [
    { p: 0.0, y: 2.15, yaw: 0.62, pit: 0.3, d: 17.5, fov: 30, sx: -2.3, fitW: 8.6 },
    { p: 0.088, y: 2.2, yaw: 0.3, pit: 0.26, d: 14.2, fov: 30, sx: -1.0, fitW: 8.2 },
    { p: 0.146, y: 2.25, yaw: 0.02, pit: 0.22, d: 11.6, fov: 30, sx: 0, fitW: 8.2 },
    { p: 0.238, y: SEAT + GIRDLE + 0.5, yaw: -0.06, pit: 0.38, d: 8.2, fov: 30, sx: 0, fitW: 7.6 },
    /* PITCH IS NOT COMPOSITION HERE, IT IS WHETHER THE STONE IS LIT.
     *
     * These three keys used to sit at pit 0.20 to 0.28, which is 11 to 16
     * degrees above a lookAt that is itself BELOW the girdle. That puts the
     * lens under the stone, and a pavilion seen from underneath is dark by
     * design: its entire job is to turn light over and send it back out of
     * the crown, away from a camera down there. So the hero shot of the ring
     * had a black gem in it, while the metal beside it was fully lit, which
     * is what made the lighting look broken when it never was. The in-box
     * key above sits at 0.38 and the stone reads brilliant at exactly that
     * angle. A solitaire is photographed from a little ABOVE the girdle,
     * always, and these now are. */
    { p: 0.331, y: RING_Y_UP + 0.28, yaw: 0.1, pit: 0.36, d: 6.2, fov: 30, sx: 0, fitW: 3.6 },
    { p: 0.388, y: RING_Y_UP + 0.32, yaw: 0.16, pit: 0.38, d: 5.8, fov: 30, sx: 0, fitW: 3.4 },
    { p: 0.463, y: STONE_Y - 0.95, yaw: 0.24, pit: 0.4, d: 5.4, fov: 30, sx: 0, fitW: 3.5 },
    { p: 0.503, y: STONE_Y - 1.0, yaw: 0.32, pit: 0.3, d: 5.2, fov: 30, sx: 0, fitW: 3.4 },
    { p: 0.543, y: STONE_Y - 0.35, yaw: 0.4, pit: 0.44, d: 4.2, fov: 31, sx: 0, fitW: 2.6 },
    { p: 0.574, y: STONE_Y, yaw: 0.46, pit: 0.5, d: 2.35, fov: 32, sx: 0, fitW: 1.6 },
    /* THE APPROACH, and the rule it now obeys: the stone is never allowed to
     * outgrow its own frame.
     *
     * The girdle is 0.82 across. The last key here used to name a fitW of
     * 0.50, and that is not a close-up of a diamond, it is a crop INTO one, and
     * what fills the screen at that range is two or three facets, which is to
     * say two or three flat grey planes with a rainbow down the join. Every
     * version of this shot has failed the same way and for the same reason:
     * a brilliant is beautiful for having fifty-eight SMALL facets catching
     * different things at once, and there is no magnification at which that
     * survives, because the thing being magnified is the multiplicity.
     *
     * So the frame holds the whole stone right up to the cut (1.35 of world
     * across the last frame, which puts the girdle at about three fifths of
     * the width and just fills the height), and the approach is a fall onto
     * the crown from a high three-quarter rather than a plunge down the
     * table's axis. Fifty-six degrees is the angle a stone is shot at when
     * the picture has to show that it is CUT: the table foreshortens, the
     * bezels and stars stay distinct, the arrows read across the middle, and
     * the girdle keeps a rim of fire all the way round.
     *
     * What crosses the threshold, then, is not the camera: it is the light.
     * The stone turns, a facet swings onto a lamp, the flare it throws blooms
     * out of the frame, and the flash lands inside it. That is also the only
     * version of this cut that is TRUE: you cannot get inside a diamond by
     * approaching it, only by following what it does to light. */
    { p: 0.616, y: STONE_Y, yaw: 0.56, pit: 0.6, d: 2.1, fov: 31, sx: 0, fitW: 1.85 },
    { p: 0.64, y: STONE_Y + 0.02, yaw: 0.66, pit: 0.78, d: 1.7, fov: 31, sx: 0, fitW: 1.55 },
    { p: 0.66, y: STONE_Y + 0.04, yaw: 0.76, pit: 0.98, d: 1.4, fov: 32, sx: 0, fitW: 1.35 },
    { p: 0.858, y: STONE_Y - 0.02, yaw: 0.0, pit: 1.36, d: 3.5, fov: 30, sx: 0, fitW: 0.9 },
    { p: 0.892, y: STONE_Y - 0.05, yaw: -0.26, pit: 0.64, d: 3.05, fov: 30, sx: 0, fitW: 1.05 },
    /* sx 0.3, because at 0 the closing words were written across the stone.
     * The coda beat opens at data-a 0.91 but this key still said centre, and
     * the monotone slope at the 0.892 key is forced to zero, so the brilliant
     * sat dead centre for the first half of the beat and did the whole carry
     * in the last 6% of the track. Measured at ?p=0.938: at 1024x768 "Made
     * once." began at x 678 with the lit crown reaching x 763, so the line
     * ran straight over the brightest part of the stone, pearl on white. The
     * frame now opens before the words arrive in it, which is what the film
     * always said it did. */
    { p: 0.938, y: STONE_Y - 0.06, yaw: 0.04, pit: 0.16, d: 2.35, fov: 30, sx: 0.3, fitW: 1.15 },
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
     * beside anything (it stacks them above, on the same line as sx going
     * to zero), so it only has to hold the prop, and asking it to hold the
     * wide composition's width as well is what used to send a phone's camera
     * two and a half times further back than the key intended, out into the
     * fog, for a shot of a ring box the size of a postage stamp. */
    const fitW = splineAt("fitW", i, pc) * (0.8 + 0.2 * widthK);
    if (fitW > 0) {
      // Half that width, plus the off-centre slide, must fit across.
      const dNeed = (fitW / 2 + Math.abs(sx)) / (tanV * aspect);
      d = Math.max(d, dNeed);
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
   * reader does; uOut rushes the field past and takes it down to black. */
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
        /* NOT fract(sin(dot(...))). That is the hash everybody writes and it
         * is a transcendental per component, which is nothing at all until
         * you notice where it is being called from: the Voronoi below needs
         * eighteen cell points per shell and there are two shells, plus three
         * layers of inclusions, which came to about EIGHTY sines for every
         * pixel of a full-screen pass. This is Hoskins' hash: a few
         * multiplies and fracts, better distributed than the sine one, and
         * free of the precision cliff that makes sin-hashes band on some
         * mobile GPUs. The room looks like the same room; the pattern's
         * particular arrangement of cells is different, because a different
         * hash is a different draw of the same deck. */
        "float hash(vec2 p) {",
        "  vec3 q = fract(vec3(p.xyx) * 0.1031);",
        "  q += dot(q, q.yzx + 33.33);",
        "  return fract((q.x + q.y) * q.z);",
        "}",
        /* The cell points are kept inside the middle 72% of their own cell.
         * That is not a look decision, it is what buys the border search
         * below the right to be 3x3 instead of 5x5: with points free to sit
         * anywhere, a cell two over can still own the nearest border, and
         * the exact-distance pass has to look that far. Reined in, it cannot,
         * and the room costs 36 of these instead of 68 per fragment, which
         * is most of the crystal room's bill, since each one is two sines.
         * The cells stay thoroughly irregular; nothing lines up. */
        "vec2 hash2(vec2 p) {",
        "  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));",
        "  q += dot(q, q.yzx + 33.33);",
        "  return fract((q.xx + q.yz) * q.zy) * 0.72 + 0.14;",
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
        // Leaving, the facets rush past: the field zooms as it darkens, which
        // is the reader still moving through the room while its light goes.
        "  vec2 q0 = vec2(vQ.x * uA, vQ.y);",
        "  vec2 q = q0 * (1.0 + uOut * 0.85);",
        "  float rr = length(q);",
        /* THE ROOM IS WHITE, and every amplitude below is a fraction of a
         * stop rather than a shade of grey. It used to sit at 0.80 with a
         * quarter-stop of falloff into the corners and a seventh of a stop of
         * variation per facet cell, which summed to 0.52 at its darkest and
         * landed around #ea; the reader circled a frame of it and said the
         * background was weird and should be white, and they were right about
         * what they were looking at. What reads as "inside a diamond" is the
         * SEAMS, the fire on them, the beams and the glints, not the fill
         * between them, and the fill was carrying enough shade to read as a
         * grey mosaic instead of as light.
         *
         * So the base goes above 1.0 and everything else is scaled down
         * around it. Nothing is removed: the two shells still turn against
         * each other, every cell still takes its own shade and its own ramp
         * of light, the seams still carry dispersion, and the inclusions are
         * still the only thing in here with a knowable size. They are simply
         * played at the level a white room can hold, which is where they
         * belong, since the tone mapper compresses hard up here and a
         * difference of a twentieth at 1.02 survives it as exactly the
         * whisper this wants. */
        "  float lum = 1.02;",
        "  lum += 0.05 * (1.0 - smoothstep(0.0, 1.4, rr));",
        /* A breath of falloff at the walls, where there used to be a quarter
         * of a stop. The deep version was a legibility fix and the problem it
         * fixed is real: most of what this store makes is white metal set
         * with white stones, and a white piece on a cut-out laid on a white
         * room has nothing to separate it from the ground. But at 0.26 the
         * fix WAS the thing the reader objected to, a grey vignette standing
         * in front of the picture. Held to a tenth it still gives the frame a
         * lit core and a quieter edge; the separation the pieces actually
         * need comes from their own contact shadows and from the seams they
         * cross, not from painting the room darker than they are. */
        "  lum -= 0.10 * smoothstep(0.55, 2.0, rr);",
        "  vec3 tint = vec3(0.0);",
        // The near shell: big facet cells turning slowly with the scroll,
        // each one a flat shade with one soft ramp of light across it.
        "  vec2 idA;",
        "  vec2 qa = rot(0.35 + uK * 0.045) * q * 1.5 + vec2(uK * 0.085, uK * 0.022);",
        "  vec3 va = facets(qa, idA);",
        "  vec2 dirA = normalize(hash2(idA + 17.0) - 0.5);",
        "  lum += (hash(idA) - 0.5) * 0.05 + dot(va.yz, dirA) * 0.028;",
        "  float eA = 1.0 - smoothstep(0.0, 0.03, va.x);",
        "  float eAr = 1.0 - smoothstep(0.0, 0.03, va.x - 0.012);",
        "  float eAb = 1.0 - smoothstep(0.0, 0.03, va.x + 0.010);",
        "  lum += eA * 0.05;",
        // Red pulled to one side of every edge and blue to the other: the
        // stone's own fire trick at a whisper, and only ever on an edge.
        "  tint += (vec3(eAr, eA, eAb) - vec3(eA)) * 0.10;",
        // The far shell: larger, softer cells counter-turning behind the
        // near ones.
        "  vec2 idB;",
        "  vec2 qb = rot(-0.62 - uK * 0.03) * q * 0.8 + vec2(-uK * 0.05, uK * 0.04);",
        "  vec3 vb = facets(qb, idB);",
        "  lum += (hash(idB + 3.7) - 0.5) * 0.022;",
        "  float eB = 1.0 - smoothstep(0.0, 0.06, vb.x);",
        "  lum += eB * 0.022;",
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
        // whole job: without them the place reads as graphics, and with them
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
        "  lum -= incl * 0.16;",
        "  lum += feather * 0.6;",
        "  vec3 col = vec3(lum) + tint - vec3((tint.r + tint.g + tint.b) / 3.0);",
        /* THE WAY IN IS THE FLASH, and nothing else. Snell's window used to
         * open this chapter: past the critical angle a diamond is a mirror,
         * so the whole outside world arrived squeezed into one octagon
         * overhead with the four claws biting its rim, and a shroud lifted
         * off the room as the reader sank away from it. The reader asked for
         * the transition into the stone gone, and this is the version of
         * that which costs the film nothing: the crystal room takes the
         * canvas at 0.66, three thousandths after the flash reaches full
         * white, so the room is simply ALREADY THERE when the white decays
         * off it. No shape, no fade, and still no frame that shows the
         * switch. */
        /* The way out is a dim, not a shape. This used to fold the room to
         * its own seams and then gather them into the octagon of the table,
         * held across the splice so the coda could open face-up on that same
         * shape. The reader asked for that piece of business gone from both
         * ends of the stone, so the room now simply goes down to black and
         * the coda cuts up out of it. Squared rather than linear because
         * light falls off that way, and a linear ramp on a room this bright
         * reads as a wipe.
         *
         * uOut IS BACK-LOADED, which matters more than the curve here. Driven
         * by a smoothstep it spends the middle of the collapse window near a
         * half, and half of a white room, under an exposure that is coming
         * down at the same time, is a grey room: hold the scroll anywhere in
         * there and what is on screen is a mid-grey wall with facets in it,
         * which is the exact frame the reader circled. A cubic ease-in holds
         * the white for most of the window and then falls off it hard, so the
         * chapter ends in a cut rather than in a long grey. */
        "  col *= (1.0 - uOut) * (1.0 - uOut);",
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
   * is the most emotional move in the whole vocabulary: it tells you what
   * to care about without moving the camera an inch. So as the box leaves,
   * it melts rather than slides; then focus drifts forward onto the near arc
   * of the band, and is pulled back onto the stone as the stone rises out of
   * the claws. Depth comes from a real depth texture and the circle of
   * confusion is the honest |z - f| / z, so what goes soft is what is
   * actually at the wrong distance: the far side of the shank, the box on
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
   * stage put together, and almost none of it was the taps: it was writing
   * every fragment of the scene at sixteen bits a channel and reading the
   * whole frame back.
   *
   * An UNSIGNED_BYTE target tagged sRGB gets three to ask WebGL2 for an
   * SRGB8_ALPHA8 attachment, and the hardware then does both conversions for
   * free: the materials still write linear, the framebuffer encodes on the
   * way in, the sampler decodes on the way out. So the gather still happens
   * in linear (the only place a blur is allowed to happen), the darks get
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
         * decision, not a photographic one: a fixed budget of taps spread
         * over an unbounded radius stops being a blur and starts being a
         * ring of copies, which is the one artefact that gives a cheap depth
         * of field away. Nothing beyond the subject here is more than a
         * gradient anyway. */
        "float coc(float z) {",
        "  return clamp(abs(z - uFocus) / max(z, 0.001) * 2.6, 0.0, 1.0) * uAper;",
        "}",
        /* EVERYTHING HERE IS RGBA, and that is not tidiness (v0.3.7). The
         * scene renders into this target over a clear of (0,0,0,0), so the
         * alpha channel IS the coverage: 1 where a prop or the floor stands,
         * 0 where the page's silk should show through. A pass that gathered
         * only .rgb and wrote 1.0 for alpha handed the canvas a solid
         * rectangle again for exactly the stretch of the film the rack focus
         * is fitted over, which is most of the ring chapters.
         *
         * The gather is correct on premultiplied values, and these are
         * premultiplied by construction rather than by declaration: opaque
         * materials draw with blending off, so a covered texel is (colour, 1)
         * and an uncovered one is the clear, (0,0,0,0). A weighted mean of
         * those is a premultiplied colour with the right coverage, which is
         * also the form the canvas wants, since the context is the default
         * premultipliedAlpha. Gathering straight colour and alpha separately
         * instead would fringe every bokeh edge toward black. */
        "void main() {",
        "  vec4 col;",
        "  if (uPress > 0.0005) {",
        "    vec2 c = (vUv - 0.5) * vec2(uA, 1.0);",
        "    float r2 = dot(c, c) / (0.25 * (uA * uA + 1.0));",
        "    float k = uPress * (0.26 * r2 + 0.14 * r2 * r2);",
        "    float f = uPress * (0.003 + 0.022 * r2);",
        "    vec2 b = vUv - 0.5;",
        "    vec4 mid = texture2D(uCol, 0.5 + b * (1.0 - k));",
        "    col.r = texture2D(uCol, 0.5 + b * (1.0 - k + f)).r;",
        "    col.g = mid.g;",
        "    col.b = texture2D(uCol, 0.5 + b * (1.0 - k - f)).b;",
        // Coverage takes the middle sample: it is the one the green channel
        // is read at, so the shape stays registered with the picture.
        "    col.a = mid.a;",
        "  } else if (uAper > 0.02) {",
        "    float z = viewZ(vUv);",
        "    float rad = coc(z);",
        "    if (rad < 0.9) {",
        "      col = texture2D(uCol, vUv);",
        "    } else {",
        "      vec4 sum = texture2D(uCol, vUv);",
        "      float wsum = 1.0;",
        /* Taps on a golden-angle spiral: an even disc at any radius, and no
         * ring artefacts, which a square kernel gives away instantly.
         * Sixteen of them, or eight on a phone, where the aperture is
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
         * its own blur is wide enough to scatter this far, which is what
         * stops a sharp foreground smearing across the subject, and, just as
         * importantly, what lets a DEFOCUSED one spread outward the way real
         * bokeh does. Weighing a front neighbour against this fragment's
         * radius instead, as this did until v0.3.0, forbids the spread in
         * both cases: the object's own edge darkens as it gathers the ground
         * behind it while the ground receives nothing back, and a hard dark
         * line gets drawn around every lit thing on the stage. That outline
         * was the artefact, not the model. */
        "        float w = zs < z - 0.02 ? clamp(coc(zs) - dp + 1.0, 0.0, 1.0) : 1.0;",
        "        sum += texture2D(uCol, su) * w;",
        "        wsum += w;",
        "      }",
        "      col = sum / wsum;",
        "    }",
        "  } else {",
        "    col = texture2D(uCol, vUv);",
        "  }",
        "  gl_FragColor = col;",
        // Encodes rgb and leaves a alone, which is what a premultiplied
        // colour wants.
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
        // Hoisted, not asked per frame: this is the hot loop.
        if (NO_LENS) {
          renderer.render(scene, camera);
          return;
        }
        renderer.getDrawingBufferSize(size);
        renderer.setRenderTarget(target(size.x, size.y));
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(lScene, lCam);
      },
    };
  })();

  /* ------------------------------------------------------------ the gallery */

  /* THE PROCESSION.
   *
   * Until v0.3.2 this was three bands of small pieces drifting upward at
   * three speeds, and the reader's verdict was that nothing in it could be
   * seen clearly. That was right, and it was structural rather than a matter
   * of tuning: seventy-four pieces spread over three screens, all at roughly
   * the same size, a third of them deliberately blurred, is a texture. A
   * texture is a fine thing for a background and a poor way to show somebody
   * the work a bench has spent years on.
   *
   * So the pieces are laid out in DEPTH instead of across a plane. Each one
   * has a slot in the procession and a direction out from the centre; the
   * reader's scroll is a camera moving down it. A piece appears small near
   * the vanishing point, swells along its own radius as it approaches, comes
   * to the front of the room at its full size and full sharpness, and sweeps
   * out past the frame while the next is already resolving behind it. About
   * a dozen are in flight at once and three or four of those are large, so
   * there is always something being READ rather than merely passing.
   *
   * Two consequences worth knowing before touching it. The pieces are sized
   * ONCE, in pixels, at the largest they will ever be drawn, and perspective
   * is a transform scale that only ever goes DOWN from there: a layer
   * rasterised small and then scaled up is exactly the blur this rework
   * exists to remove. And only the pieces actually in flight are written to
   * each frame; the rest are left alone entirely, so a frame of this costs a
   * dozen transforms rather than seventy-four. */
  const IN_FLIGHT = 12; // pieces between the vanishing point and the frame
  const PAST = 0.16; // how far past the camera a piece keeps travelling
  const items = [];
  let galleryArmed = false;

  function buildGallery() {
    if (!galleryEl) return;
    const rand = rng(20260801);
    const frag = document.createDocumentFragment();
    const n = JEWELRY.length;
    JEWELRY.forEach((piece, i) => {
      const el = document.createElement("div");
      el.className = "gallery__item";
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.dataset.src = "assets/img/jewelry/" + piece.f;
      img.width = piece.w;
      img.height = piece.h;
      el.appendChild(img);
      frag.appendChild(el);
      /* Its place in the queue, its bearing out of the centre and how far out
       * it flies. The bearing is the golden angle rather than a random draw:
       * consecutive pieces then leave in maximally different directions, so
       * no two neighbours in time are ever neighbours on screen, and the
       * frame fills evenly without anybody having to check that it does. */
      items.push({
        el,
        img,
        slot: (i + 0.5) / n,
        ang: i * 2.3999632 + rand() * 0.5,
        // Nothing travels down the middle of the tunnel: the copy does.
        rad: 0.68 + rand() * 0.6,
        // A piece is only ever as big as its own longest side allows.
        aspect: piece.w / piece.h,
        tall: piece.h >= piece.w,
        tilt: (rand() * 8 - 4).toFixed(1),
        live: false,
        w: 0,
      });
    });
    galleryEl.appendChild(frag);
  }

  /* The size a piece is rasterised at: the biggest it will be drawn, which is
   * the moment it reaches the front of the room. Capped at the shipped file's
   * own longest side so nothing is ever upscaled. */
  function layoutGallery() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    // Half the frame's width or getting on for half its height, whichever is
    // the tighter, capped at the shipped file's own longest side. A phone
    // gets a piece nearly half the screen across, which is the whole point of
    // the rework; a laptop gets the file at native resolution.
    //
    // The 0.9 is the reader's, asked for as "the same size as they are now
    // and like 10% smaller": at the old figure the biggest pieces crowded the
    // copy standing in the tunnel's core, and a tenth off is enough air to
    // read both. It multiplies the measured size rather than the caps, so the
    // ceiling is still the shipped file's own 384px longest side and nothing
    // is ever upscaled.
    const base = clamp(Math.min(w * 0.5, h * 0.45) * 0.9, 135, 384);
    for (const it of items) {
      const wid = Math.round(it.tall ? base * it.aspect : base);
      if (wid === it.w) continue;
      it.w = wid;
      it.h = wid / it.aspect;
      it.el.style.width = wid + "px";
    }
  }

  /* ARMED IN TWO WAVES, IN THE ORDER THE READER MEETS THEM.
   *
   * One call used to set all seventy-four srcs at once, which asks the
   * connection for 1.5MB in a single burst somewhere around p 0.44, right in
   * the middle of the ring chapter, and hands the decoder seventy-four images
   * to unpack while the film is drawing. The pieces themselves are already as
   * small as they are ever going to be (384px longest side, WebP at quality
   * 64 with a lossy alpha, a median of 20KB), so there are no bytes left to
   * take out; what was left was WHEN.
   *
   * The procession is a queue, and its order is known at build time, so the
   * first wave is only the pieces that arrive first. Sixteen of them, which
   * is a little more than the twelve ever in flight at once, fetched early
   * and marked high priority so they are decoded before the room opens. The
   * rest follow one frame later at low priority, behind anything the film
   * still needs. Nothing waits on either: a piece with no pixels yet is an
   * empty box travelling the same path, and by the time it reaches the front
   * of the room it has them.
   *
   * fetchPriority is set as a property rather than an attribute so a browser
   * that does not know it simply ignores an unknown property instead of
   * carrying a dead attribute in the DOM. */
  const FIRST_WAVE = 16;

  function armFrom(from, to, priority) {
    for (let i = from; i < to && i < items.length; i++) {
      const img = items[i].img;
      if (!img.dataset.src) continue;
      img.fetchPriority = priority;
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    }
  }

  function armGallery() {
    if (galleryArmed) return;
    galleryArmed = true;
    armFrom(0, FIRST_WAVE, "high");
    /* The tail goes out on the next frame rather than in this one. Setting
     * seventy-four srcs is seventy-four synchronous DOM writes plus the
     * fetches they start, and the frame that calls this is a frame of the
     * film; handing the browser the first sixteen and then yielding keeps
     * that cost off it. */
    requestAnimationFrame(() => armFrom(FIRST_WAVE, items.length, "low"));
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
    if (cue.hidden) return;
    cue.classList.add("is-gone");
    // And then out of the document's way entirely. Fading it to nothing still
    // leaves an element the compositor has to consider on every frame of the
    // rest of the film; the attribute takes it out of the layout altogether,
    // which is the state it was in before it was ever needed.
    setTimeout(() => {
      cue.hidden = true;
      cue.classList.remove("is-shown", "is-gone");
    }, 420);
  }

  /* --------------------------------------------------------------- the film */

  const eyeV = new THREE.Vector3();
  const focusV = new THREE.Vector3();
  const camInv = new THREE.Matrix4();

  /* Every style write below is guarded on an actual change. A frame of this
   * film writes a dozen of them, and a write that sets a property to the
   * value it already holds still costs the invalidation, the string, and the
   * garbage, for nothing. Three decimals is finer than a screen can show. */
  const vigEl = document.getElementById("vig");
  let veilKLast = -1;
  let vigKLast = -1;
  let velvetKLast = -1;
  let rigSigLast = NaN;
  function setOpacity(el, last, v, keep) {
    if (Math.abs(v - last) < 0.002) return;
    keep(v);
    el.style.opacity = v.toFixed(3);
  }

  function filmAt(p, now, dt) {
    const aspect = viewW / viewH;

    /* The box. Its turn ARRIVES rather than easing to a halt: it goes a
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

    /* THE LAMP IS ALWAYS ON, and it leaves with the box.
     *
     * It used to be a function of the lid: `open * (fade as the box goes)`,
     * so the light climbed out of nothing as the lid stood up and there was
     * no lamp at all for the first fifth of the film. The reader noticed it
     * arriving late, somewhere around the ring's rise, and asked for it to be
     * on the whole time. They are right on both counts. A jeweller's box with
     * a lamp in the lid is a box whose lamp is ON when it is handed to you;
     * that is the whole trick of it, and the shut box has a seam for the
     * light to come out of, which is the one thing in the opening chapter
     * that says there is something inside.
     *
     * So it holds at full from the first frame and only ever comes down as
     * the box is carried off stage left. `boxReveal` below still gates what
     * the light is allowed to REACH, since the ring is behind a shut lid
     * whether or not the lamp is burning; nothing downstream had to change.
     * Still clamped, because the sprung hinge is allowed to overshoot its
     * stop and a lamp brighter than lit has no meaning. */
    const lit = clamp(
      Math.max(1 - seg(p, B.boxOut[1] - 0.02, B.boxOut[1] + 0.03), teaseLit),
      0,
      1
    );
    const openNow = Math.max(open, teaseOpen);

    // The ring. It rises and settles rather than gliding to a stop, and it
    // is carried off with a turn and a tip in it. The whole point of the
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
    // The relight is already under way at the cut (the range opens before
    // CODA does), so the stone arrives lit rather than climbing out of the
    // black the collapse leaves behind.
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
    // Back-loaded, in step with the shader's own uOut: the exposure and the
    // room have to come down together or one of them draws the grey stage
    // the other is avoiding.
    const collapseK = easeIn3(seg(p, B.collapse[0], B.collapse[1]));
    renderer.toneMappingExposure = Math.max(
      0.2,
      inCoda
        ? lerp(0.22, 1.12, codaIn)
        : // A HALF stop into the stone, not a full one. The swell is here so
          // the flash has somewhere to land, but exposure is also the first
          // thing that kills contrast, and contrast is the entire subject of
          // this shot now that the tent has an observer in it: pushed a full
          // stop the arrows washed out and the stone went back to being the
          // grey plate this pass set out to fix.
          1.12 + 0.5 * easeIn3(enterK) - 1.9 * collapseK
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
    /* Shut in the box the ring is not dim, it is NOT THERE. The seat keeps
     * 0.12 of headroom under the closed lid, and the ring's metal is built
     * before any of the box's, so three's opaque sort submits it ahead of the
     * lid that covers it and not one of those fragments is rejected: a fully
     * shaded, envmapped, shadow-mapped piece of jewelry, drawn inside a closed
     * box, for the whole first fifth of the film. Same gate and same number as
     * the stone one line down. */
    ring.root.visible = !inCoda && reveal > 0.001;
    /* Two shadow maps is one more than most of this film needs. The key's is
     * only ever read by surfaces inside the open box; once the box has gone
     * there is nothing left on stage that receives a shadow at all, so its
     * map stops being redrawn, for the two thirds of the film that follows.
     * The light goes on DECLARING itself a caster (see the note where it is
     * built); it is the raster that stands down, not the flag. */
    /* A shadow map is a function of what CASTS, not of where the camera
     * stands, and neither of these shadow cameras follows the eye. Three
     * stretches of the opening chapter move the camera hard while the rig is
     * frozen: before B.turn, between B.turn and B.open, and between B.open and
     * B.ringUp. That was a fifth of the chapter spent re-rasterising a 1024
     * depth pass, twice once the lamp is on, for texels that cannot have
     * changed. So the flag is qualified by the POSE of the casters.
     *
     * openNow rather than open: the tease leans on the lid without touching
     * the film's own number, and the lamp is a child of the lid, so a tease
     * pulse genuinely does invalidate the map. outK is carried explicitly
     * rather than left to ride inside boxYaw, so this cannot quietly break if
     * B.turn and B.boxOut ever stop being disjoint. */
    const rigSig =
      boxYaw + openNow * 7.31 + outK * 5.17 +
      ringY * 13.7 + ringOutK * 29.3 + ringYaw * 3.9;
    const moved = renderer.shadowMap.needsUpdate && rigSig !== rigSigLast;
    rigSigLast = rigSig;
    key.shadow.needsUpdate = moved && p < B.boxOut[1] + 0.02;

    /* THE GROUND USED TO BE FADED OUT HERE, from the ring's exit to the
     * solo, and the reasoning is worth keeping even though the code is not.
     * Once the ring has been carried off there is nothing standing on a floor,
     * and what a floor goes on doing is filling the bottom of every remaining
     * shot with a sheet of mid grey; a diamond photographed against mid grey
     * has no contrast to show, because the arrows, the flashes and the fire
     * all need black behind the stone to be anything at all. As of v0.3.7 that
     * is true of the whole film rather than its last third, so the floor is
     * gone outright and there is nothing here to fade. */

    eyeV.copy(camera.position);
    const eyeOk = enterK < 0.12 || inCoda ? eyeV : null;
    box.update({ open: openNow, lit, eye: eyeV, moved });
    ring.update({ lit: ringLit });
    stone.update({ lit: stoneLit, spin: stoneSpin, reveal, eye: eyeOk });
    // Debug only. Guarded because this is the hot loop and building a string
    // every frame to be read by nobody is exactly the sort of cost this file
    // spends its comments warning about.
    if (DBG) dbgState =
      "lit=" + lit.toFixed(3) + " ringLit=" + ringLit.toFixed(3) +
      " stoneLit=" + stoneLit.toFixed(3) + " riseK=" + riseK.toFixed(3) +
      " liftK=" + liftK.toFixed(3) + " reveal=" + reveal.toFixed(3) +
      " expo=" + renderer.toneMappingExposure.toFixed(3);

    /* The lens. Focus rides the subject's own axis; the PULL is an offset
     * along the view: forward onto the near arc of the band as the box
     * leaves, then drawn back onto the stone as the stone comes up out of
     * the claws. That is the whole rack focus, and it is why the ring goes
     * to bokeh at exactly the moment the reader is meant to stop looking at
     * it. Aperture opens and closes around the stretch so the rest of the
     * film never pays for the pass. */
    /* The rack focus runs everywhere now, phones included. It used to be cut
     * on a touch device to save the pass's fixed cost, and the trade was a
     * bad one: it is the most emotional move in the whole vocabulary, it is
     * what tells the reader to stop looking at the ring and start looking at
     * the stone, and dropping it is dropping a beat of the film rather than
     * some resolution. If a device cannot afford it the governor takes the
     * resolution instead, which is the cheaper thing to lose. */
    const aperF =
      0.017 *
      smooth(seg(p, B.focus[0], B.focus[0] + 0.052)) *
      (1 - smooth(seg(p, B.focus[1] - 0.048, B.focus[1])));
    const pressK = easeIn3(seg(p, B.press[0], B.press[1]));
    const lensOn = !inCoda && (aperF > 0.0004 || pressK > 0.0005);
    let focusZ = 6;
    if (lensOn && aperF > 0.0004) {
      camera.updateMatrixWorld();
      camInv.copy(camera.matrixWorld).invert();
      // The plane of focus sits on the ring's head, and the pull carries it
      // up onto the stone, deliberately a beat BEHIND the stone's own rise,
      // so the brilliant drifts soft on its way out of the claws and comes
      // sharp as the focus catches it. Both are on the same axis, so the
      // separation is the height the stone has gained, read through a camera
      // that is looking down at it; that is small, and it is exactly the
      // depth a macro lens has to work with on a real ring.
      /* THE PULL HAS TO LAND INSIDE THE STONE'S OWN BEAT. It used to run to
       * B.stoneUp[1] + 0.012, i.e. p 0.414 to 0.472, which meant focus was
       * still only 70% of the way onto the brilliant at p 0.45 with the
       * aperture wide open. A defocused diamond is not a soft diamond, it is
       * a DEAD one: every bit of what makes it worth looking at is
       * high-frequency, the arrows, the flashes, the fire, and a blur is
       * exactly the operation that removes high frequencies. So the stone
       * spent most of the beat headed "Lifted clear of its claws, so you can
       * see what they hold" as a grey lump, which is what read as broken
       * lighting when the lighting was never touched.
       *
       * It still drifts soft on the way out of the claws, because that beat
       * is right and it is what hands the reader from the metal to the
       * stone. It just finishes the journey, by 0.438, and is sharp for the
       * rest of the shot. */
      const pullK = smooth(seg(p, B.stoneUp[0] + 0.008, B.stoneUp[0] + 0.05));
      focusV.set(0, lerp(ringY + GIRDLE, stoneY, pullK), 0).applyMatrix4(camInv);
      focusZ = Math.max(-focusV.z, 0.2);
    }

    /* Contact, and the vignette handed across with it. Not a dissolve. A
     * hit: dark right up to the table, one frame of bloom off the strike,
     * gone. The crystal room takes the canvas under the top of the spike, so
     * no frame ever shows the switch. The coda takes the vignette back,
     * because it plays in the dark room's photography even though the room
     * by then is only the stone and its light. */
    const veilK =
      easeIn3(seg(p, FLASH[0], FLASH[1])) * (1 - smooth(seg(p, FLASH[1], FLASH[2])));
    setOpacity(veil, veilKLast, veilK, (v) => (veilKLast = v));
    const vigK = Math.max(
      1 - smooth(seg(p, B.enter[0], B.press[1])),
      inCoda ? 0.85 * codaIn : 0
    );
    if (vigEl) setOpacity(vigEl, vigKLast, vigK, (v) => (vigKLast = v));

    /* THE SILK GOES OUT BEFORE THE READER GOES IN, and comes back with the
     * stone. Inside the diamond the ground is white and it belongs to the
     * crystal shader alone; the shader is opaque, so nothing would show
     * through it anyway, but a layer left standing under an opaque one is a
     * layer the compositor is still carrying, and the point of the chapter is
     * that there is no room left outside the stone.
     *
     * It leaves across the dive rather than at the cut. From B.press the frame
     * is being squeezed and split by channel, and the silk is a PAGE layer, so
     * it cannot be squeezed with it: held at strength it would sit dead still
     * behind a picture visibly bending, which is the one thing that would give
     * away that the wall is not in the room. Fading it out over the same
     * stretch means the stone crosses the table against black, which is where
     * the film was already going.
     *
     * codaIn on the way back, the same ramp the stone's own light rides, so
     * the wall comes up with the piece it is behind rather than ahead of it. */
    const velvetK = VELVET * (inCoda ? codaIn : 1 - smooth(seg(p, B.press[0], FLASH[0])));
    if (velvetEl) setOpacity(velvetEl, velvetKLast, velvetK, (v) => (velvetKLast = v));

    // Which world the canvas shows. Past the collapse the crystal renders
    // itself black, and the coda takes the canvas back for the stone.
    const isInside = p >= B.inside[0] && !inCoda;
    // How far into the room the reader has come: 1 at the instant of arrival,
    // 0 once it has opened around them. The window it used to drive is gone,
    // so this only ramps the gallery in behind the flash now.
    const winK = isInside ? 1 - smooth(seg(p, B.window[0], B.window[1])) : 0;
    if (isInside) {
      inside.mat.uniforms.uK.value = p * 34;
      inside.mat.uniforms.uOut.value = easeIn3(seg(p, B.collapse[0], B.collapse[1]));
      inside.mat.uniforms.uA.value = aspect;
      renderer.render(inside.scene, inside.cam);
    } else if (lensOn) {
      lens.set(focusZ, aperF, pressK, aspect);
      lens.draw();
    } else {
      renderer.render(scene, camera);
    }

    /* The gallery rides the inside stretch. It ramps in behind the flash
     * rather than being at full strength in the frame the room arrives on,
     * and dims out with the collapse rather than hanging over the black
     * that follows it. */
    const galleryOn = p > B.inside[0] && p < B.collapse[0] + 0.024;
    if (galleryEl) {
      galleryEl.classList.toggle("is-on", galleryOn);
      if (galleryOn) {
        const ik = seg(p, B.inside[0] + 0.03, B.collapse[0] + 0.02);
        const fade =
          (1 - smooth(seg(p, B.collapse[0], B.collapse[0] + 0.022))) * (1 - winK);
        galleryEl.style.opacity = fade.toFixed(3);
        driveGallery(ik);
        driveBeams(p, aspect, fade);
      } else if (beamsLit) {
        driveBeams(p, aspect, 0);
        if (galleryLive) driveGallery(-1);
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

  /* One frame of the procession.
   *
   * `ik` is the camera's way down the queue, 0 to 1. Everything a piece does
   * is a function of `u`, its own distance ahead of that camera: nothing here
   * accumulates, so the whole thing scrubs backwards exactly as it plays
   * forwards, which is the same rule the rest of the film obeys.
   *
   * Pass -1 to retire every piece at once, which is what the frames either
   * side of the chapter want. */
  let galleryLive = false;
  function driveGallery(ik) {
    const n = items.length;
    // The window of the queue in flight, plus the stretch behind the camera a
    // piece keeps travelling through on its way out of frame.
    const win = IN_FLIGHT / n;
    const cx = viewW * 0.5;
    /* The tunnel's core has to sit where the WORDS are, and on a narrow frame
     * the words are not in the middle. home.css stacks an ink beat at the top
     * of a portrait screen instead of centring it, so a core held at 50% left
     * the copy outside its own clearing with a ring across it. The tunnel
     * drops by the same measure the type rose, on the same 9/10 line the
     * camera and the beats already trade layouts at. */
    const portraitK = clamp((0.9 - viewW / viewH) / 0.45, 0, 1);
    const cy = viewH * (0.5 + 0.13 * portraitK);
    /* How far out a piece at full size flies, PER AXIS. One radius taken off
     * the frame's longest side works on a laptop and falls apart on a phone:
     * a portrait frame's long side is its height, so the tunnel was built
     * more than twice as wide as the screen and every piece left through the
     * sides before it was worth looking at, leaving the middle empty. Sized
     * to each axis in turn, the same tunnel fills a 16:9 frame and a 9:19.5
     * one with the same handful of pieces. Slightly past the frame on both,
     * so the nearest ones leave at an edge rather than piling up. */
    const spreadX = viewW * 0.6;
    const spreadY = viewH * 0.52;
    let live = false;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const u = ik < 0 ? 9 : it.slot - ik;
      // Behind the camera by more than PAST windows, or not yet in flight.
      const on = u < win && u > -PAST * win;
      if (!on) {
        if (it.live) {
          it.live = false;
          it.el.style.visibility = "hidden";
        }
        continue;
      }
      live = true;
      if (!it.live) {
        it.live = true;
        it.el.style.visibility = "visible";
      }
      // d runs 1 at the vanishing point to 0 at the front of the room, and
      // negative once the piece is past the reader.
      const d = u / win;
      /* Perspective. A piece's apparent size goes as 1/(1+kd), which is what
       * a real lens does and what makes the approach ACCELERATE into the
       * frame instead of creeping in linearly. Past the camera it is allowed
       * a little over full size and no more: the raster is only as big as
       * full size, and anything beyond that is enlarging a bitmap. */
      const s = d >= 0 ? 1 / (1 + d * 3.4) : 1 + Math.min(-d, PAST) * 0.9;
      /* THE CORE IS KEPT CLEAR, and this one term is what makes the chapter
       * work. A true fly-through collapses everything to a vanishing point,
       * and the vanishing point is the exact middle of the frame, which is
       * where the copy stands: the first cut of this had "Every piece begins
       * as a drawing" with a ring sitting on the word "drawing". Holding the
       * radius at a third of its travel even at the far end turns the
       * procession into a TUNNEL rather than a funnel. The pieces come down
       * its walls, the words stand in its middle, and neither has to
       * apologise to the other. */
      const r = it.rad * (0.58 + 0.42 * s);
      /* AND EVERY PIECE RISES INTO ITS PLACE. Without this term a piece is
       * simply nearer each frame than it was the frame before: it grows on
       * the spot along its own bearing, which at the far end of the tunnel is
       * barely any travel at all, and what the eye reads is a thing switching
       * on rather than a thing arriving. The reader put it exactly right,
       * that they popped from existence.
       *
       * So the far end of the procession sits a tenth of a frame LOWER than
       * where the piece will come to rest, and closes that gap as it
       * approaches. The whole queue drifts upward through the frame while the
       * reader scrolls down it, which is both the honest reading of a camera
       * moving forward and level, and the motion that makes the arrival a
       * move instead of an event. It is a pure function of d like everything
       * else here, so it scrubs backwards without a stray state. */
      const rise = Math.max(d, 0) * viewH * 0.1;
      // Offset by half the piece's own box, so the scale (which pivots on
      // that box's centre) grows it about the point it is aimed at.
      const x = cx + Math.cos(it.ang) * r * spreadX - it.w * 0.5;
      const y = cy + Math.sin(it.ang) * r * spreadY + rise - it.h * 0.5;
      /* In from the far distance over MOST of the approach, not over its last
       * fifth. The old window ran from d 1.0 to 0.82, which at this queue
       * length is a couple of hundred pixels of scroll: long enough to be a
       * fade in the code and short enough to be a pop on the screen. Opening
       * it out to nearly half the travel means a piece is already there, faint
       * and small and climbing, well before it is worth looking at. Squared,
       * so it stays quiet at the far end and does its arriving late, where the
       * rise is also biggest. */
      const inK = clamp((1 - d) / 0.45, 0, 1);
      const a = inK * inK * (d < 0 ? 1 + d / PAST : 1);
      it.el.style.opacity = clamp(a, 0, 1).toFixed(3);
      it.el.style.transform =
        "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) scale(" +
        s.toFixed(4) + ") rotate(" + it.tilt + "deg)";
    }
    galleryLive = live;
  }

  /* The room's two beams, handed to the page.
   *
   * The shader sweeps them across the crystal; the pieces drifting through
   * it and the words standing in it are DOM, and light that stops dead at
   * the edge of the canvas is what makes an overlay read as subtitles rather
   * than as type inside a place. So the same two beams are computed here
   * with the same arithmetic (they have to be the SAME beams, or the eye
   * catches the lie immediately) and published as position and angle for
   * two elements that screen over the gallery. Screen, because on the room's
   * white it changes nothing at all and on a photographed piece it flares:
   * the light lands on the world without ever touching the contrast the ink
   * beats are measured against. */
  let beamsLit = false;
  const beamEls = [
    document.querySelector(".beam--0"),
    document.querySelector(".beam--1"),
  ];
  function driveBeams(p, aspect, level) {
    const lit = level > 0.001;
    if (lit !== beamsLit) {
      beamsLit = lit;
      pin.classList.toggle("is-beamed", lit);
    }
    if (!lit) return;
    const uK = p * 34;
    for (let i = 0; i < 2; i++) {
      const el = beamEls[i];
      if (!el) continue;
      const ang = 0.9 + i * 2.2 + uK * (0.05 + 0.03 * i) * (i ? -1 : 1);
      const off = Math.sin(uK * 0.22 + i * 2.7) * 0.4;
      // The shader works in a frame whose y runs -1 to 1 and whose x is
      // scaled by the aspect; undo that to land back in pixels of the pin.
      const x = (((off * Math.cos(ang)) / aspect) * 0.5 + 0.5) * viewW;
      const y = (0.5 - off * Math.sin(ang) * 0.5) * viewH;
      // Along the band the aspect cancels between the two conversions, so
      // the screen angle is the plain perpendicular of the beam's normal.
      const rot = (Math.atan2(-Math.cos(ang), -Math.sin(ang)) * 180) / Math.PI;
      // On the element, not on the pin: see the note beside .beam--0.
      el.style.setProperty("--beam", level.toFixed(3));
      el.style.setProperty("--x", x.toFixed(1) + "px");
      el.style.setProperty("--y", y.toFixed(1) + "px");
      el.style.setProperty("--r", rot.toFixed(2) + "deg");
    }
  }

  /* ------------------------------------------------------------- the loop */

  let queued = false;
  let lastFrame = 0;
  let healTick = 0;

  /* The governor's bookkeeping. Only frames the film asked to be drawn back
   * to back are evidence: a frame that follows a sleep carries a delta of
   * whatever the reader was doing in between and says nothing about cost. */
  let qSeen = 0;
  let qSlow = 0;
  let qFast = 0;
  let qHold = 0;
  const qForced = params.has("q");
  if (qForced) quality = clamp(parseFloat(params.get("q")) || 1, 0.4, 1);

  function govern(t, dt, continuous) {
    if (qForced) return;
    if (!continuous) {
      qSeen = qSlow = qFast = 0;
      return;
    }
    qSeen++;
    if (dt > 0.024) qSlow++; // worse than about 42 a second
    else if (dt < 0.019) qFast++; // holding the refresh rate
    if (qSeen < 45 || t < qHold) return;
    const slow = qSlow / qSeen;
    const fast = qFast / qSeen;
    qSeen = qSlow = qFast = 0;
    let next = quality;
    // Down decisively on a third of frames missing, up cautiously and only
    // from near-unanimous evidence, so the picture cannot oscillate.
    if (slow > 0.33) next = Math.max(QUALITY_MIN, quality - 0.15);
    else if (fast > 0.9 && quality < 1) next = Math.min(1, quality + 0.1);
    if (next === quality) return;
    quality = next;
    qHold = t + 1500;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(viewW, viewH, false);
  }

  function wake() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frameStep);
  }

  function frameStep(t) {
    queued = false;
    const dt = Math.min((t - lastFrame) / 1000 || 0.016, 0.05);
    lastFrame = t;

    /* Self-heal the buffer: some embedded viewers resize without ever firing
     * an event. Reading clientWidth is not free: it is a question the
     * browser can only answer by flushing layout, and asking it in the first
     * line of every frame of a scroll interleaves a forced synchronous layout
     * with the film for the whole of its length. Twice a second is plenty for
     * a fallback whose whole purpose is to catch a resize nobody announced;
     * the ResizeObserver catches every one that anybody did. */
    if ((healTick = (healTick + 1) & 31) === 0) {
      if (canvas.width !== Math.floor(pin.clientWidth * pixelRatio())) resize();
    }

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
    const live = settling || teasing || soloLive || codaLive || introLive;
    govern(t, dt, live);
    if (live) wake();
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
   * out; it flies to where the seam actually is on screen, taking the
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
  canvas.addEventListener("webglcontextrestored", () => {
    // A restored context has empty shadow maps and no scroll to announce it,
    // and `moved` is an AND, so clearing the pose guard alone cannot rebuild
    // them. Both halves have to be raised.
    rigSigLast = NaN;
    renderer.shadowMap.needsUpdate = true;
    wake();
  });
  reduceMotion.addEventListener("change", () => {
    // Flipping it on cancels any tease in flight; flipping it off gives the
    // chain back its life (armTease self-terminates while it holds).
    teaseT0 = -1;
    if (loaderDone && !held) armTease(reduceMotion.matches ? 0 : 2600);
    wake();
  });

  setLoad(0.82);
  resize();
  readScroll();

  /* ------------------------------------------------------------ warming up */

  /* Every program the film will ever need, compiled here, under the loader.
   *
   * This used to be three `renderer.compile()` calls, and they were not
   * enough, not nearly. A compile is not triggered by a material, it is
   * triggered by a material IN A CONFIGURATION, and this film changes the
   * configuration underneath its materials several times on the way through:
   * a second light starts casting, a light stops, the whole scene is
   * suddenly being drawn into a render target with its own colour space
   * rather than to the canvas. Each of those is a fresh cache key for every
   * material on the stage, and three answers a cache miss the only way it
   * can: by compiling and linking, synchronously, inside the frame that
   * asked. Measured on this machine, before this: 2973ms at the lid,
   * 1170ms at the ring, 422ms where the rack focus opens. The reader feels
   * those as the page seizing, and they land on the three most-watched
   * moments in the film, because that is where the lighting changes.
   *
   * Compiling by prediction is a losing game: you cannot enumerate cache
   * keys from the outside. So the film warms itself: it PLAYS, once, at a
   * spread of progresses chosen to hit every distinct lighting and target
   * configuration, and whatever that compiles is by construction exactly
   * what the reader's scroll will need. Nothing is guessed.
   *
   * It runs a couple of stops per animation frame rather than in one block,
   * so the loader's own hairline keeps moving while it happens and the page
   * stays answerable; and the bar's last stretch is the honest progress of
   * it, which is what a loading bar is supposed to be. */
  const WARM = [
    0, // the closed box and the floor
    0.19, // the lamp: a second shadow-caster joins the scene
    0.27, // the ring lit and rising
    0.31, // the rack focus opens: the scene into a render target
    0.42, // the key's map stands down, the box is gone
    0.5, // the stone out of the claws, still under the lens
    0.58, // the stone alone, no post pass at all
    0.6555, // the press: the target again, different uniforms
    0.7, // the crystal room
    0.83, // the room folding, the gallery lit
    0.9, // the coda: the stone relit against black
  ];
  let warmI = 0;

  /* The stops above only compile what happens to be on screen at a stop, and
   * some of this stage's smallest pieces are on screen for a handful of
   * frames at an angle no list would think to name: the glow that breathes
   * through the lid seam exists only while the lid is between cracked and
   * properly open, and the stone's flare fires only when a facet happens to
   * line up with a light down the lens, which is not a progress at all. So
   * everything the scene owns is forced visible for one compile and put
   * back. The configuration is fixed by now, so this is exhaustive by
   * construction rather than by a list somebody has to maintain. */
  function warmHidden() {
    const was = [];
    scene.traverse((o) => {
      was.push(o.visible);
      o.visible = true;
    });
    renderer.compile(scene, camera);
    let i = 0;
    scene.traverse((o) => {
      o.visible = was[i++];
    });
  }

  function warmChunk(n) {
    if (warmI === 0) warmHidden();
    const t = performance.now();
    for (let i = 0; i < n && warmI < WARM.length; i++, warmI++) {
      renderer.shadowMap.needsUpdate = true;
      filmAt(WARM[warmI], t, 0.016);
    }
    setLoad(0.82 + 0.18 * (warmI / WARM.length));
    return warmI >= WARM.length;
  }

  function warmStep() {
    if (!warmChunk(2)) {
      requestAnimationFrame(warmStep);
      return;
    }
    // Back to the frame the reader actually asked for, and hand over.
    renderer.shadowMap.needsUpdate = true;
    pDrawn = pTarget;
    wake();
  }

  /* ?fps=<0..1>: draw that one frame of the film sixty times as fast as the
   * machine will, and print the median cost of it.
   *
   * Every expense on this page is a fragment cost, and a fragment cost cannot
   * be read off a source file; the only honest way to answer "it lags" is to
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
    // The harness measures a warm film, not a cold one: a compile landing in
    // the loop would be reported as the cost of drawing, which it is not.
    warmChunk(WARM.length);
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
    // Triangles and draw calls go in the line too, because "is it the
    // geometry?" is the first thing anybody asks about a slow 3D page and it
    // is answerable in one number rather than by argument.
    const out =
      "p=" + at + "  " + ms.toFixed(2) + " ms  " + (1000 / ms).toFixed(0) +
      " fps  buf=" + canvas.width + "x" + canvas.height +
      "  tris=" + renderer.info.render.triangles +
      "  calls=" + renderer.info.render.calls + "\n" + dbgState;
    document.title = out;
    const el = document.createElement("pre");
    el.id = "fps-out";
    el.textContent = out;
    document.body.appendChild(el);
    return;
  }
  // A page restored mid-track opens on that frame rather than replaying the
  // whole film at it. The warm runs first and hands over when it is done,
  // which is also what keeps the loader up until the film can actually be
  // scrolled without seizing.
  pDrawn = pTarget;
  warmStep();
})();
