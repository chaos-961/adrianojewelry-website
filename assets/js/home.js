/* Adriano Jewelry, the landing journey.
 *
 * One scroll drives one continuous shot. The page opens on the closed ring
 * box in its dark room; scrolling turns the box to face the reader, opens
 * the lid under its own lamp, lifts the ring out while the box leaves the
 * frame, lifts the stone out of its claws while the ring leaves the other
 * way, closes right in on the turning brilliant, and then passes through
 * its table into a white crystalline room where the store's finished pieces
 * hang, gather into a turning halo, stream past in counter-flowing lanes,
 * and settle into a salon wall of work. Scrolling on folds the white back to black, stands the
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
 * The rest of the pass is handling: the props move as though a hand had
 * them (moves overlap, a departing piece leans into its travel, a turn
 * arrives past its mark and rocks back) and the lid is sprung rather than
 * slid. The rack focus that used to open over the ring chapters is gone
 * (v0.4.3, at the reader's word), so the jewelry plays every frame at the
 * canvas's own crispness.
 *
 * Everything visual is a pure function of one number, the reader's way
 * through the track (0 to 1), so the film runs forward and backward at
 * whatever speed the thumb sets and a deep link can open the page on any
 * frame of it. The only time-driven motions are four politenesses: the
 * closed box teasing its lid at the top, the lifted stone's slow idle turn,
 * the showcase constellation swaying inside the diamond with the room
 * turning a breath at a time under it, and the loader. Reduced motion
 * stills all four and drops the scroll smoothing, leaving a film you pull
 * through by hand.
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
 *   ?nogal=1       stand the constellation's draw down, cost isolation
 *
 * Rendering only happens while something moves; a held frame costs nothing.
 * The one post-process pass (the squeeze through the table) is allocated
 * lazily and routed around entirely outside the one stretch that asks for
 * it, so the rest of the film draws straight to the canvas as it always
 * has. WebGL2 is required (three r185). Without it the journey
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

  /* IS THERE A GPU AT ALL? (v0.3.9)
   *
   * Chrome falls back to SwiftShader, a CPU rasteriser, whenever it cannot
   * use the machine's graphics hardware: a driver on the blocklist, a VM, a
   * remote desktop, a locked-down corporate image, an old integrated part.
   * Those readers get the same film through a renderer that is one to two
   * orders of magnitude slower, and they are the ones least able to afford a
   * full-frame post-process pass.
   *
   * They also could not compile one. Measured while landing v0.3.9: under
   * SwiftShader with a real clock the depth-of-field gather this film used
   * to carry failed to LINK on four runs out of four, with an empty program
   * log, an empty log on both shaders, no GL error and the context not
   * lost, and with `getShaderSource` still returning the whole shader. A
   * five-line vertex shader that reports COMPILE_STATUS false with nothing
   * to say about why is a rasteriser giving up, not a shader with a mistake
   * in it. The gather is gone as of v0.4.3, and the lesson keeps the gate:
   * what the pass still does is render the whole scene into a full-frame
   * target for the press, and a machine already one to two orders of
   * magnitude slow does not pay a second full-frame write for a squeeze it
   * can live without.
   *
   * `?soft=1` forces this path on so it can be checked, and `?lens=1` forces
   * the pass back on in spite of it, which is not a nicety: `scripts/shot.js`
   * runs Chrome with `--disable-gpu`, so every headless capture this repo
   * takes is a SwiftShader capture, and without that knob no screenshot could
   * ever show the press. Photograph the press with `&lens=1`. */
  const softGL = (() => {
    if (params.get("soft") === "1") return true;
    try {
      const c = document.createElement("canvas").getContext("webgl2");
      if (!c) return false;
      const x = c.getExtension("WEBGL_debug_renderer_info");
      const r = x ? String(c.getParameter(x.UNMASKED_RENDERER_WEBGL) || "") : "";
      const lose = c.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      return /swiftshader|llvmpipe|softpipe|software|basic render|paravirtual/i.test(r);
    } catch (e) {
      return false;
    }
  })();
  const NO_LENS =
    params.has("nolens") || (softGL && params.get("lens") !== "1");
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
   * v0.3.2 kept one last shaving of that guess, a touch device STARTING the
   * governor at 0.8, and v0.4.3 retires it, because the reader sent a
   * screenshot of their phone and the arithmetic of what they were looking
   * at is not close. The governor can only climb on 45 CONTINUOUS drawn
   * frames, a parked film draws nothing, and the film is parked exactly
   * when somebody is looking hard at it: the hero, a held beat, the coda.
   * So every phone, however fast, opened this page on 0.8 of the resolution
   * and stayed there until its reader had scrolled for a full second, which
   * on a dpr-3 panel under the dpr cap of 2 this page had then is 53% of
   * the pixels the screen has. A start guess that softens the first thing
   * every capable phone shows, to protect the slow ones for the one second
   * the governor needs to find them anyway, is the wrong side of the trade,
   * and the film is also a cheaper thing to hold at full resolution than it
   * was when the guess was made: v0.4.3 deleted the depth-of-field gather
   * outright.
   *
   * So there is one dial, `quality`, it starts at 1 for everyone, and the
   * governor below moves it only on the evidence of frames actually landing.
   * A phone that holds the rate keeps every pixel from the first frame; one
   * that cannot loses 0.15 of resolution within a second and a half, which
   * is the same second the old guess was spending on everybody. `?lp=1` is
   * retired with it; `(pointer: coarse)` no longer changes a thing.
   *
   * THE CAP ITSELF WAS THE LAST OF THOSE GUESSES. Two device pixels per CSS
   * pixel was defended here as the trade every heavy canvas makes, and on a
   * dpr-3 phone it is a permanent one-third cut of linear resolution: every
   * frame drawn at 2/3 scale and stretched, on the densest panel in the
   * house, beside DOM text the browser renders at native 3x. That contrast
   * is exactly what the reader reported as the phone looking blurry against
   * the desktop, whose ordinary panels sit at dpr 1 and 2 and were never
   * touched by the cap at all. So the cap is 3: every panel up to three
   * device pixels per CSS pixel now renders 1:1, which covers the iPhone
   * and nearly every Android there is. It stays a cap rather than going
   * away, because fragment cost rises with the SQUARE of this number and
   * the few dpr-3.5..4 panels would pay double for detail finer than an eye
   * at a phone's distance can resolve; at a buffer of 3 they sit within 86%
   * of native, which is not a findable shortfall. The machines where the
   * extra pixels do not land still belong to the governor: it starts
   * everyone at 1 and steps down only on dropped frames, and QUALITY_MIN
   * below scales so its floor is the same absolute buffer the old cap
   * allowed. The ceiling rises; the floor does not move. */
  const DPR_CAP = 3;

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
  let quality = 1;
  /* The floor is an ABSOLUTE buffer, not a fraction of the ceiling: 0.55 of
   * the old cap of 2, so 1.1 buffer pixels per CSS pixel at the bottom.
   * When the cap rose to 3 a flat 0.55 would have lifted the worst-case
   * floor by half on exactly the machines the floor exists for; dividing by
   * the device's own capped ratio keeps the bottom of the governor's range
   * where it has always been and spends the whole change on the top. */
  const QUALITY_MIN = Math.min(
    0.55,
    1.1 / Math.min(window.devicePixelRatio || 1, DPR_CAP)
  );

  /* THE SECOND MULTIPLIER: WHETHER THE PICTURE IS MOVING (v0.3.9).
   *
   * The governor above only ever answers one question, "is this machine
   * missing frames", and a machine that holds sixty of them by running its
   * GPU at three quarters of its clock answers it with a cheerful no. That
   * is the case the reader actually reported: not a stutter, a fan. Frame
   * rate is what a governor can see and it is not what a laptop pays.
   *
   * So resolution is also spent on whether it can be SEEN. While the reader
   * is scrolling, every prop on screen is being carried across the frame
   * and the whole picture is under a camera move; a tenth of a millimetre
   * of edge definition in there is not something an eye has any way to
   * collect. The
   * moment the scroll comes to rest, and that is the moment somebody stops
   * to read a beat and look at the stone, the film draws that frame again at
   * every pixel the device has. Sharp where it is looked at, cheap where it
   * is moving, which is the same bargain the governor makes and a better
   * trigger for it.
   *
   * 0.72 is half the fragments (0.72 squared is 0.52) and it is deliberately
   * a mild step rather than the biggest one that would still work: it has to
   * survive being wrong. If a reader does somehow catch the film mid-scroll
   * and stare, what they have caught is a frame at a slightly lower
   * resolution, not a frame with a beat missing from it. */
  const MOTION_K = 0.72;
  let moving = false;
  let moveRun = 0;
  const pixelRatio = () =>
    Math.max(
      0.75,
      Math.min(window.devicePixelRatio || 1, DPR_CAP) *
        quality *
        (moving ? MOTION_K : 1)
    );

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

  /* Multisampling is bought per sample per pixel, and what it buys is edge
   * quality the display may already be providing for free. On a screen dense
   * enough that one CSS pixel is two device pixels the downsample is itself an
   * antialias, and MSAA on top of it measured at a sixth of the frame for a
   * difference that needs a loupe. So it is spent only where it shows: a
   * one-to-one display. On the context it cannot be changed later, since the
   * flag belongs to the context, which is the other reason the governor below
   * works in resolution instead. The lens's own target reads the same number
   * (see the note on the target), so the film antialiases the same way for its
   * whole length rather than for three quarters of it. */
  const MSAA = (window.devicePixelRatio || 1) < 1.5;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: MSAA,
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
   * beat wants. The press pass carries the alpha through with it (its
   * coverage rides the same middle sample as the green channel), because a
   * pass that moves colour and drops coverage would hand the canvas a solid
   * rectangle for exactly the frames it is fitted over.
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
   * scroll length it always had; the two new screens all belonged to the
   * coda at the end. v0.4.7 plays the same trick again, in the middle:
   * the track is 2200vh now, every range outside the diamond is scaled
   * by 17/22 (the dark room, the dive and the coda still play at the
   * exact scroll pace they were tuned at), and all five new screens
   * belong to the showcase inside the stone, which the reader asked to
   * have reworked from A to Z and made long. The chapter that was 3.3
   * screens of road is 8.3 now, and what fills it is the formation
   * timeline in the constellation's vertex shader: scatter, halo,
   * stream, wall, with staggered flights between them. */
  const B = {
    turn: [0.051, 0.109], // the box comes round to face the reader
    open: [0.119, 0.177], // the lid stands, the lamp comes up with it
    ringUp: [0.194, 0.2558], // the ring rises out of the slot
    boxOut: [0.2364, 0.3068], // the box leaves, stage left
    stoneUp: [0.2998, 0.3555], // the stone rises out of the claws
    ringOut: [0.3516, 0.4196], // the ring leaves, stage right
    solo: [0.4196, 0.4667], // the stone alone, turning
    enter: [0.4667, 0.51], // the stone swells past the camera
    /* `focus` stood here from v0.2.8 to v0.4.2: the window the shallow lens
     * was fitted over. The rack focus is gone as of v0.4.3 (the story is on
     * the pass itself), so the only range the lens acts on now is `press`. */
    press: [0.4791, 0.5088], // glass pressed against the eye at the table
    inside: [0.51, 0.8856], // the crystal room and the showcase
    window: [0.51, 0.54], // arrival: the showcase ramps in behind the flash
    collapse: [0.85, 0.8856], // the white goes down to black for the cut
  };

  /* Contact. The old join was a slow white dissolve; this is a hit: the
   * bloom off a single frame of it, up hard and gone. The crystal room takes
   * the canvas at 0.66, under the top of the spike, so the eye is still
   * recovering when the switch happens and no frame shows the seam. */
  const FLASH = [0.5027, 0.5096, 0.5189];

  /* The coda. Out of the black the collapse leaves behind, the brilliant
   * stands back up, relit and turning, and is carried stage left while the
   * closing words take the right of the frame: the film's goodbye, played
   * on the same ground the finale below stands on. */
  const CODA = [0.8903, 1];

  /* Camera keys: lookAt, orbit, distance, lens, how far the subject slides
   * off centre on a wide screen (sx), and the width of world that must stay
   * in frame however narrow the viewport gets (fitW). The fit is enforced
   * after interpolation, so a phone simply stands further back instead of
   * cropping the story. The last three keys are the coda: nothing between
   * the dive at 0.51 and the coda's first key is ever rendered (the crystal
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
    { p: 0.068, y: 2.2, yaw: 0.3, pit: 0.26, d: 14.2, fov: 30, sx: -1.0, fitW: 8.2 },
    { p: 0.113, y: 2.25, yaw: 0.02, pit: 0.22, d: 11.6, fov: 30, sx: 0, fitW: 8.2 },
    { p: 0.184, y: SEAT + GIRDLE + 0.5, yaw: -0.06, pit: 0.38, d: 8.2, fov: 30, sx: 0, fitW: 7.6 },
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
    { p: 0.256, y: RING_Y_UP + 0.28, yaw: 0.1, pit: 0.36, d: 6.2, fov: 30, sx: 0, fitW: 3.6 },
    { p: 0.3, y: RING_Y_UP + 0.32, yaw: 0.16, pit: 0.38, d: 5.8, fov: 30, sx: 0, fitW: 3.4 },
    /* AND THEN THE CAMERA COMES IN ON THE STONE, which is the other half of
     * what the reader meant by the first diamond not being the same quality
     * as the last one (v0.4.1). The pass below fixed the outline; this is the
     * picture.
     *
     * These three keys used to hold at d 5.4, 5.2 and 4.2 with the lookAt a
     * whole unit BELOW the girdle, because the ring is still leaving through
     * them and the frame was being asked to hold both. What that bought was a
     * stone 0.82 across in 4.6 of world, which is eighteen percent of the
     * width, about two hundred and fifty pixels on a laptop, seen from
     * thirteen degrees above its own girdle. Fifty-eight facets at that size
     * and that angle average into one pale grey lozenge: there are not enough
     * pixels for the arrows, the flashes or the fire to be anything but their
     * own mean, and thirteen degrees is looking at the girdle edge-on with
     * the pavilion under it, which is the part of a brilliant that is dark by
     * design. The coda plays the same stone at thirty-four degrees filling a
     * third of the frame and it reads as a diamond, and nothing else about
     * the two shots differs: exposure is 1.120 in both and stoneLit is 1.000
     * in both, measured.
     *
     * So the eye comes down to about twenty-eight degrees above the girdle,
     * where the crown returns the tent's coffered ceiling and the pavilion
     * folds the observer disc into arrows, and the distance closes until the
     * stone is nearer a third of the frame than a fifth. The lookAt rises
     * with it, and `sx` carries the subject right of centre so the copy on
     * the left keeps its own half of the frame rather than sharing it. The
     * ring is on its way out through all three and is allowed to leave past
     * the edge; a thing being carried off does not need to be held in frame
     * to read as leaving. */
    { p: 0.358, y: STONE_Y - 0.34, yaw: 0.24, pit: 0.6, d: 3.5, fov: 30, sx: -0.4, fitW: 2.2 },
    { p: 0.389, y: STONE_Y - 0.26, yaw: 0.32, pit: 0.56, d: 3.2, fov: 30, sx: -0.34, fitW: 2.1 },
    { p: 0.42, y: STONE_Y - 0.18, yaw: 0.4, pit: 0.54, d: 2.9, fov: 31, sx: 0, fitW: 1.9 },
    { p: 0.444, y: STONE_Y, yaw: 0.46, pit: 0.5, d: 2.35, fov: 32, sx: 0, fitW: 1.6 },
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
    { p: 0.476, y: STONE_Y, yaw: 0.56, pit: 0.6, d: 2.1, fov: 31, sx: 0, fitW: 1.85 },
    { p: 0.495, y: STONE_Y + 0.02, yaw: 0.66, pit: 0.78, d: 1.7, fov: 31, sx: 0, fitW: 1.55 },
    { p: 0.51, y: STONE_Y + 0.04, yaw: 0.76, pit: 0.98, d: 1.4, fov: 32, sx: 0, fitW: 1.35 },
    { p: 0.8903, y: STONE_Y - 0.02, yaw: 0.0, pit: 1.36, d: 3.5, fov: 30, sx: 0, fitW: 0.9 },
    { p: 0.9165, y: STONE_Y - 0.05, yaw: -0.26, pit: 0.64, d: 3.05, fov: 30, sx: 0, fitW: 1.05 },
    /* sx 0.3, because at 0 the closing words were written across the stone.
     * The coda beat opens at data-a 0.93 but this key still said centre, and
     * the monotone slope at the previous key is forced to zero, so the brilliant
     * sat dead centre for the first half of the beat and did the whole carry
     * in the last 6% of the track. Measured at ?p=0.938: at 1024x768 "Made
     * once." began at x 678 with the lit crown reaching x 763, so the line
     * ran straight over the brightest part of the stone, pearl on white. The
     * frame now opens before the words arrive in it, which is what the film
     * always said it did. */
    { p: 0.9521, y: STONE_Y - 0.06, yaw: 0.04, pit: 0.16, d: 2.35, fov: 30, sx: 0.3, fitW: 1.15 },
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

  /* --------------------------------------------------- the scratch frame */

  /* ONE HALF-RESOLUTION SCRATCH FRAME, and the fullscreen triangle that puts
   * anything drawn into it back on the canvas.
   *
   * This exists because of a measurement, and it is one of the two largest
   * numbers this page has ever produced (v0.3.9, software rasteriser at
   * 1264x705, `?fps=`): at p 0.7 the frame cost 120ms for exactly one
   * triangle, so the crystal room's shader was the whole of its chapter. Not
   * geometry, not overdraw: a fragment count. And the room is LOW-FREQUENCY
   * BY CONSTRUCTION, its finest feature a facet seam drawn as a soft ramp
   * about ten pixels wide, because that is how two planes of a stone meet.
   * Nothing in the image needs a full-resolution grid to carry it, so the
   * room is drawn at half the width and half the height, a quarter of the
   * fragments, and scaled back up. (The depth-of-field gather shared this
   * frame for the same reason until v0.4.3 took the gather out; the room is
   * its one tenant now.) One allocation, resized with the canvas, and the
   * governor's own resolution multiplies through it for free since it is
   * always derived from the drawing buffer.
   *
   * UNSIGNED_BYTE tagged sRGB, for the reason the lens found in v0.3.0: three
   * hands an SRGB8_ALPHA8 attachment to WebGL2, the hardware encodes on the
   * way in and decodes on the way out, so the darks keep sRGB's precision
   * instead of eight flat linear bits and nothing has to be written twice.
   * Whatever renders into it therefore leaves its own tone mapping alone and
   * skips its encode (three renders into a target in the WORKING space, so
   * the encode chunk is a no-op there anyway); the blit below does it. */
  /* `?full=1` runs the scratch frame at 1:1 instead of a quarter of the
   * fragments. It is not a quality setting and it does not ship as one: it is
   * the reference arm for anything that goes wrong in the room, since the
   * artefacts this file has chased in scratch-frame passes have come from the
   * half resolution rather than from the arithmetic, and the fastest way to
   * tell the two apart is to take the resolution away. */
  const HALF = params.has("full") ? 1 : 0.5;
  const fx = (() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
    );
    /* One triangle, one scene, one camera, and the material is swapped for
     * whichever pass is being run. Every fullscreen pass on this page draws
     * the same three vertices; giving each its own scene was three matrix
     * updates and three render lists a frame to draw the same triangle. */
    const scn = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.Mesh(geo, null);
    tri.frustumCulled = false;
    scn.add(tri);

    const VERT = [
      "varying vec2 vUv;",
      "void main() {",
      "  vUv = position.xy * 0.5 + 0.5;",
      "  gl_Position = vec4(position.xy, 0.0, 1.0);",
      "}",
    ].join("\n");

    const blitMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { uTex: { value: null } },
      vertexShader: VERT,
      fragmentShader: [
        "varying vec2 vUv;",
        "uniform sampler2D uTex;",
        "void main() {",
        // Linear in (the sampler decoded it), sRGB out. Alpha is carried
        // through untouched, which is what a premultiplied colour wants and
        // what lets the page's silk stay visible under a half-res frame.
        "  gl_FragColor = texture2D(uTex, vUv);",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
    });

    let rt = null;
    const size = new THREE.Vector2();
    return {
      VERT,
      /** The scratch frame, at half of whatever the canvas currently is. */
      half() {
        renderer.getDrawingBufferSize(size);
        const w = Math.max(1, Math.round(size.x * HALF));
        const h = Math.max(1, Math.round(size.y * HALF));
        if (rt && rt.width === w && rt.height === h) return rt;
        if (rt) rt.dispose();
        rt = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.UnsignedByteType,
          colorSpace: THREE.SRGBColorSpace,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        });
        rt.texture.generateMipmaps = false;
        rt.texture.wrapS = THREE.ClampToEdgeWrapping;
        rt.texture.wrapT = THREE.ClampToEdgeWrapping;
        return rt;
      },
      /** Run one fullscreen pass with the given material, wherever the
       *  render target currently points. */
      pass(mat) {
        tri.material = mat;
        renderer.render(scn, cam);
      },
      /** Put a scratch frame back on the canvas, scaled up and encoded. */
      blit(tex) {
        blitMat.uniforms.uTex.value = tex;
        tri.material = blitMat;
        renderer.render(scn, cam);
      },
    };
  })();

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
    const mat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uK: { value: 0 },
        uOut: { value: 0 },
        uA: { value: 1 },
        uExp: { value: 1 },
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
        "uniform float uExp;",
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
        /* ACES, WRITTEN OUT RATHER THAN INCLUDED, and this is a trap worth
         * knowing about before anything else on this page is moved into a
         * render target (v0.3.9).
         *
         * `#include <tonemapping_fragment>` compiles to nothing at all unless
         * three defines TONE_MAPPING, and three decides that per DRAW, from
         * one line in the renderer: `material.toneMapped && (currentTarget
         * !== null && !currentTarget.isXRRenderTarget || (tm =
         * renderer.toneMapping))`. Read it carefully. If the current render
         * target is anything other than null, the left side of the `||` is
         * true, the assignment never runs, and the material is compiled with
         * NO tone mapping. So the moment this shader stopped drawing to the
         * canvas and started drawing into the scratch frame it silently lost
         * ACES, and with it every bit of the exposure ramp the chapter rides:
         * the swell into the stone and the fall across the collapse are both
         * `renderer.toneMappingExposure`, which is a tone mapping uniform and
         * therefore was not being applied either. Nothing errors. The room
         * just quietly plays flat.
         *
         * So it is done here, by hand, from three's own ACESFilmic with the
         * exposure passed in as an ordinary uniform. Matched against the
         * pre-v0.3.9 frames, which is the only way to be sure of a curve. */
        "  col *= uExp / 0.6;",
        "  const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840,",
        "                           0.35458, 0.90834, 0.13383,",
        "                           0.04823, 0.01566, 0.83777);",
        "  const mat3 ACESOut = mat3( 1.60475, -0.10208, -0.00327,",
        "                            -0.53108,  1.10813, -0.07276,",
        "                            -0.07367, -0.00605,  1.07602);",
        "  col = ACESIn * col;",
        "  vec3 na = col * (col + 0.0245786) - 0.000090537;",
        "  vec3 nb = col * (0.983729 * col + 0.4329510) + 0.238081;",
        "  col = clamp(ACESOut * (na / nb), 0.0, 1.0);",
        // No encode: this draws into the scratch frame, where three's output
        // space is the working space and the chunk would be a no-op anyway,
        // and the SRGB8 attachment does it in hardware. fx.blit encodes on
        // the way to the canvas.
        "  gl_FragColor = vec4(col, 1.0);",
        "}",
      ].join("\n"),
    });
    return {
      mat,
      /* HALF RESOLUTION, and this is the cheapest 4x on the page (v0.3.9).
       * Measured at 120ms for one triangle, this shader WAS the chapter: two
       * Voronoi shells at eighteen cell points each, two beams, four glints
       * and three inclusion layers, every one of them per fragment.
       *
       * Nothing in it is fine enough to need a full-resolution grid. The
       * facet seams are `smoothstep(0.0, 0.03, d)` over a field about two
       * units tall, which is a ramp roughly a hundredth of the frame wide:
       * ten pixels on a laptop, and it stays a ten-pixel ramp when five
       * half-res pixels are scaled back up. The glints are gaussians two
       * hundredths across. The only thing here with any real edge is the
       * inclusions, which are pinpoints of about three pixels and come back
       * as pinpoints of about three slightly softer pixels; they are meant
       * to read as specks in a stone rather than as dots on a screen, and a
       * touch of softness is on the right side of that.
       *
       * The constellation draws AFTER the blit at the canvas's own full
       * resolution (see galDrawPass), and the ink beats are DOM over it
       * all, so every photograph and every word in the chapter stays at
       * the device's own resolution. What is halved is the wall behind
       * them. */
      draw() {
        // The exposure this chapter rides, handed over explicitly because
        // three does not apply its own inside a render target. See the note
        // beside the ACES block above.
        mat.uniforms.uExp.value = renderer.toneMappingExposure;
        const rt = fx.half();
        renderer.setRenderTarget(rt);
        fx.pass(mat);
        renderer.setRenderTarget(null);
        fx.blit(rt.texture);
      },
    };
  })();

  /* ---------------------------------------------------------------- the lens */

  /* One post-process pass, fitted only for the one stretch that wants a
   * lens rather than a window: the press through the table. Everywhere else
   * the film draws straight to the canvas exactly as it always has, and the
   * target is not even allocated until the first frame that asks for it.
   *
   * THE RACK FOCUS IS GONE, and the reader is why (v0.4.3). It arrived in
   * v0.2.8 as the most emotional move in the vocabulary, the box melting
   * off the stage while focus was pulled from the ring's head onto the
   * rising stone, and it then spent five versions being debugged on this
   * page: untonemapped from v0.3.0 to v0.3.9, a dotted outline in v0.4.0,
   * a dashed one in v0.4.1, and in v0.4.2 the thing itself, a plane of
   * focus thinner than the jewelry it was pointed at, reported as a weird
   * shader that changed the model as it was lifted and then stayed. v0.4.2
   * answered with a focus pocket sized to the piece, which made the metal
   * byte-consistent with the no-pass frame and left only the box melting,
   * and the reader's verdict on what remained was to remove the thing
   * entirely. That is the honest end of the story: a beat that has to be
   * defended five times is a beat this film is better without. The jewelry
   * now plays every frame at the canvas's own native crispness, the box
   * slides off sharp the way every other prop departs, and the gather, its
   * depth texture, its sixteen-tap spiral and the focus pull are deleted
   * rather than left dormant. What they taught is recorded in git history
   * and in CLAUDE.md, and the standing rule applies: if a depth of field
   * ever comes back it comes back new, knowing that a plane of focus must
   * never be thinner than the piece it is pointed at.
   *
   * THE PRESS. The last thousandths before the table are a piece of glass
   * being put against the eye: the frame squeezed toward its centre and
   * split by channel at the rim, which is what n = 2.42 does to a picture.
   * That, and one hard flash at contact, is the whole crossing. The old
   * white dissolve was an admission that the two shots would not join; this
   * is the join.
   *
   * COLOUR. Three renders into a target in the working (linear) space, so
   * the obvious target is half float: eight bits of LINEAR light in a room
   * this dark bands on sight. But measured (v0.3.0), that round trip cost
   * more than everything else on the stage put together, because it was
   * writing every fragment of the scene at sixteen bits a channel and
   * reading the whole frame back.
   *
   * So the target is eight bits, and what it stores is the FINISHED PICTURE:
   * ACES already applied, exposure already applied, sRGB already encoded, the
   * exact bytes the canvas would have been handed. See the note on the target
   * below for the three lines that arrange that, and why every one of them is
   * needed; they are v0.4.0's fix for the oldest bug in this file, which is
   * that three DISABLES tone mapping when it renders into a render target,
   * so for nine versions everything the pass touched played about 1.9 stops
   * down with its highlights clipping flat. The press is a distortion rather
   * than a blur, so it moves those finished bytes around whole and never
   * needs to decode one; outside the squeeze the composite is a straight
   * passthrough, and a passthrough frame matches the same frame with the
   * pass switched off to the byte everywhere except the silhouettes, which
   * is the multisampling note on the target below. */
  const lens = (() => {
    /* THE COMPOSITE, at the canvas's own resolution, and the only pass that
     * ever touches it. Two jobs, mutually exclusive on the press's own ramp:
     * the press (a distortion, not a blur, so it stays sharp and
     * full-resolution and costs three reads), and a straight passthrough for
     * the frames at either end of it where the squeeze is still under a
     * fraction of a pixel. uCol holds the finished, encoded picture, so
     * neither branch decodes a byte: the press moves bytes around whole and
     * the passthrough hands them over. */
    const out = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCol: { value: null },
        uPress: { value: 0 },
        uA: { value: 1 },
      },
      vertexShader: fx.VERT,
      fragmentShader: [
        "varying vec2 vUv;",
        "uniform sampler2D uCol;",
        "uniform float uPress;",
        "uniform float uA;",
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
        "  } else {",
        // Nothing to do at all: the target already holds the finished,
        // encoded picture, so this hands the canvas exactly the bytes the
        // scene would have written to it with no pass fitted.
        "    col = texture2D(uCol, vUv);",
        "  }",
        "  gl_FragColor = col;",
        "}",
      ].join("\n"),
    });

    let rt = null;
    const size = new THREE.Vector2();
    function target(w, h) {
      if (rt && rt.width === w && rt.height === h) return rt;
      if (rt) rt.dispose();
      rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        colorSpace: THREE.SRGBColorSpace,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
        /* MULTISAMPLED WHEREVER THE CANVAS ITSELF IS, and this is the reader's
         * "low quality" (v0.4.1). `antialias` belongs to the CONTEXT and does
         * not reach a render target, so for the quarter of its length this
         * pass is fitted over, the film was drawing every silhouette in it
         * without antialiasing and then handing that to the canvas: the ring
         * chapters had stair-stepped edges on a shank whose whole subject is
         * a polished curve, and the coda, which draws straight to the canvas,
         * did not. Put side by side that reads exactly as it was reported,
         * one stone crisp and the other rough, and no amount of work on the
         * gather could have touched it, because it is in the frame the gather
         * is handed.
         *
         * v0.4.0 measured this and took it out, and the measurement stands:
         * 14.4ms to 19.9ms at p 0.32 and 8.6ms to 12.9ms at p 0.45 on this
         * box's own GPU. What was wrong was the conclusion. It was weighed
         * against a mean difference of 0.13 of 255 over the whole frame,
         * which is the wrong statistic for an artefact that lives entirely on
         * the silhouettes: an edge is one percent of the pixels in a frame
         * and most of what anybody looks at in a photograph of jewelry.
         *
         * It costs nothing on the machines that cannot show it. The same flag
         * the context uses gates it, so above 1.5 device pixels the target
         * and the canvas agree at zero samples exactly as they did before,
         * and the phones this file spent v0.3.9 economising for pay nothing
         * at all. */
        samples: MSAA ? 4 : 0,
      });
      /* THREE LINES THAT PUT THE COLOUR PIPELINE BACK, and they only work
       * together (v0.4.0).
       *
       * `isXRRenderTarget` is the switch this whole file needed and could not
       * find. Three's rule is one line: `material.toneMapped && (target !==
       * null && !target.isXRRenderTarget || (tm = renderer.toneMapping))`, so
       * a target that claims to be an XR one is the only kind three will tone
       * map into. It also makes three take the OUTPUT COLOUR SPACE from the
       * target's own texture instead of forcing the working space, which is
       * the second half of what is wanted: the material now writes ACES,
       * exposure and the sRGB encode, exactly as it would to the canvas.
       *
       * Which leaves the encode being done twice, because an sRGB-tagged
       * texture also gets an SRGB8_ALPHA8 attachment and the hardware encodes
       * on write. `internalFormat` is the one hook three offers for that: set
       * explicitly it is returned verbatim and the format guess is skipped,
       * so the storage is plain eight-bit and the shader's encode is the only
       * one. Eight bits is the right size for an ENCODED picture (it is what
       * a screen holds); it was the wrong size for linear light, which is the
       * whole of the v0.3.0 note above.
       *
       * The one thing to remember when reading the two shaders: uCol is no
       * longer linear. It is the finished frame. */
      rt.isXRRenderTarget = true;
      rt.texture.internalFormat = "RGBA8";
      rt.texture.generateMipmaps = false;
      rt.texture.wrapS = THREE.ClampToEdgeWrapping;
      rt.texture.wrapT = THREE.ClampToEdgeWrapping;
      out.uniforms.uCol.value = rt.texture;
      return rt;
    }

    return {
      set(press, aspect) {
        out.uniforms.uPress.value = press;
        out.uniforms.uA.value = aspect;
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
        fx.pass(out);
      },
    };
  })();

  /* ------------------------------------------------------------ the gallery */

  /* THE SHOWCASE IS A CHOREOGRAPHY NOW (v0.4.7), asked for as the pieces
   * shown "in a new way", the whole thing reworked "from A-Z" and made
   * "very good and long". The chapter grew from 3.3 screens of road to
   * 8.3 (see the B table), and the one fixed hung set now passes through
   * FOUR FORMATIONS on the way down: the scatter (v0.4.4's constellation,
   * kept whole as the arrival), a turning golden-angle HALO around the
   * second ink beat's words, a STREAM of counter-flowing lanes that
   * carries the collection past the reader like work going by on a
   * bench's wheel, and a salon WALL that assembles for the third beat
   * and opens a seam of rows for its words. Between them the flock
   * FLIES: per-piece staggered smoothsteps of the chapter's own
   * progress, each flight bowed along a seeded arc, so the room
   * reorganises a few pieces at a time and never slides as one sheet.
   * Nothing pops: membership is still fixed for the chapter, no piece
   * ever fades alone, and the stream's wrap happens entirely off
   * screen. All of it is still a closed function of (p, galT, seeds)
   * evaluated in the vertex shader, so the choreography scrubs
   * backwards, costs the CPU the same handful of uniforms, and holds
   * still under ?p= for the captures. The formation standings are laid
   * per hang in layoutGallery; the blend weights, flights and the
   * wall's live seam are in the vertex shader; the ellipse, wrap and
   * clock uniforms are set in galDrawPass.
   *
   * THE CONSTELLATION LIVES INSIDE THE FILM'S OWN FRAME (v0.4.6),
   * asked for as the showcase reworked "with optimization", with "new
   * animations", and above all "it doesnt lag on phone".
   *
   * What moved is the machinery, not the constellation. The constellation
   * itself is the reader's own ask from v0.4.4 ("always there ... moving
   * kinda like a bubble in space") and every rule of it is kept whole:
   * membership fixed for the chapter, nothing arriving or leaving on a
   * frame of the film, the same seeded hang in the same R2 scatter at the
   * same sizes, the sway a clock frozen under ?p= and reduced motion, the
   * near pieces parting around the words. What is gone is the DOM. The
   * pieces used to be seventy-four elements, each promoted to its own
   * compositor layer with a transform string written per frame, under two
   * more full-viewport screen-blended layers carrying the room's beams out
   * of the canvas. The film's own chapter is one half-resolution triangle;
   * the machine's real bill was compositing a hundred layers over it, and
   * that bill was heaviest exactly where the reader reported it, on a
   * phone.
   *
   * Now the pieces are ONE INSTANCED DRAW inside the film's frame. The
   * images live in a shelf-packed canvas atlas uploaded as one mipmapped
   * texture; every piece is a quad whose entire life (slide, sway, rock,
   * breath, parting, the new tilt) is derived in the vertex shader from
   * seeds that ride the instance buffer, so a frame of the constellation
   * costs the CPU about fifteen uniform floats and the compositor nothing
   * at all. A frame used to cost seventy-four style writes and a
   * hundred-layer composite; the same motion now costs one draw call.
   *
   * WHAT THE SHADER BUYS BEYOND THE OLD MOTION, since a fragment program
   * can light a photograph in ways the compositor never could. The room's
   * two beams now cross the pieces INSIDE the same pass, computed from the
   * same sum the room shader reads (they screen, exactly as the old DOM
   * beams did, so a piece flares as the light passes and the room's white
   * is untouched). Each piece hangs with a third dimension: a slow seeded
   * yaw and pitch under a real perspective divide, the way a card hangs in
   * water, and as it rolls a soft sheen glides across it, which is what a
   * polished surface does under a moving light. And once in a long while a
   * piece throws a four-ray star glint, seeded and scheduled off the same
   * clock as the sway, so a parked reader sees the case twinkle the way a
   * lit case actually does. All of it is deterministic: every rate and
   * phase is seeded, the clock is the constellation's own galT, and a held
   * frame under ?p= is one fixed picture.
   *
   * THE PIECES STILL NEVER POP. Membership changes only on a resize;
   * loading is the one honest exception (it always was: the DOM version
   * popped a piece the frame its file decoded), and a piece whose file
   * lands while the chapter is on screen now eases in over half a second
   * instead. The contact shadow that separated each piece from the white
   * room survives as an analytic soft ellipse composited under the piece
   * in the same fragment, so it costs no second pass and no atlas bytes.
   *
   * ---------------------------------------------------------------------
   * THE INHERITED RULES, all of them still binding, and where they live
   * now.
   *
   * From the field (v0.4.1): SIZE IS RASTERISED ONCE at the largest the
   * piece will ever be drawn, and the transform only ever scales DOWN.
   * The atlas packs each piece at its hang size times the device ratio
   * (capped at the file's own 320), and the breath in the vertex shader
   * stays strictly below one, so no piece is ever drawn from more pixels
   * than its raster holds; the atlas is mipmapped so the governor's
   * whole-frame downscales stay clean. THE SCATTER IS LOW-DISCREPANCY,
   * NOT RANDOM (a random draw clumps three pieces into a corner and
   * leaves a hole, every time), and it is the R2 sequence BY RANK IN THE
   * HANG ORDER, because any prefix of R2 is itself low-discrepancy while
   * a shuffled subset of a lattice is a random draw again. BIGGER IS
   * NEARER: sz is one number a piece's size, draw order, parallax share,
   * sway reach and rock all read off, so the differences read as depth.
   * Near pieces make room for the words, far ones hold their ground and
   * pass behind the clearing's veil, which is what gives the parted field
   * a back wall.
   *
   * From the procession (v0.3.2): depth is carried by SIZE and never by
   * blur, because a blurred showcase is a third of the work made
   * unlookable; and nothing off screen may cost anything, which the
   * instanced form gives by construction (the draw is skipped outside the
   * chapter, and there is no layer anywhere to keep alive).
   *
   * HOW MANY / WHICH / HOW BIG are v0.4.5's rules verbatim, checked
   * against the same captures: the whole manifest hangs wherever every
   * piece clears GAL_FLOOR, only a phone trims the order, sizes come back
   * off the count so the set covers about GAL_COVER of the frame, and one
   * seeded shuffle fixes membership across visits. The seed streams are
   * untouched, so this build hangs the exact room v0.4.5 hung. */

  /* The constellation's dials, v0.4.5's numbers untouched. GAL_COVER is
   * the share of the frame the hung pieces may sum to, and the sizes are
   * derived from it and from the count, so the chapter reads equally full
   * on a phone and a cinema display without either being tuned by hand.
   * GAL_FLOOR is the smallest a hung piece is allowed to raster, and it
   * is what decides HOW MANY: the reader asked to see all seventy-four,
   * so the whole manifest hangs wherever the frame can carry every piece
   * at or above the floor, and only a screen too small for that trims the
   * order. The old dial was a fixed area per piece, which hung twelve of
   * seventy-four on an ordinary laptop window and read as a sample of the
   * showcase rather than the showcase. The field's slide across the
   * chapter (0.14 frame heights at the nearest depth, small because the
   * standing instruction is that every piece stays on screen) lives in
   * the vertex shader now, beside the rest of the motion. ATLAS_PAD is
   * the transparent guard around each packed entry: the piece pass reads
   * mip levels a couple deep during governor downscales and the shadow
   * spills past the raster, and both stop at the guard instead of
   * bleeding into a neighbour. */
  const GAL_COVER = 0.3;
  const GAL_FLOOR = 64;
  const ATLAS_PAD = 10;
  const NO_GAL = params.has("nogal");
  const items = [];
  let galOrder = [];
  let galDraw = [];
  let galT = 0;
  let galleryArmed = false;

  /* WHICH OF THE TWO SHIPPED SETS THIS BROWSER CAN READ (v0.4.0).
   *
   * The 74 pieces are the only photographs on the site and they were the
   * largest thing it downloads. There are no bytes left in WebP: the note in
   * CLAUDE.md is right that most of every one of these files is its ALPHA
   * channel, that libwebp writes alpha losslessly unless told otherwise, and
   * that the lossy alpha was already turned down as far as it would go. What
   * is left is the CODEC, which nobody had tried.
   *
   * Measured over fifteen of the originals, mean bytes per piece against the
   * error of the decoded piece composited over the room's own near-white
   * ground, which is where any of it can actually be seen: the shipped WebP
   * is 21.5KB at an RMSE of 5.13, and AVIF at quality 45 in 4:4:4, at the
   * smaller 320px the pieces are now drawn at, is 15.5KB at an RMSE of 4.88.
   * Fewer bytes AND a closer picture, which is not a trade at all. Whole set:
   * 1570KB to 1143KB. 4:4:4 rather than 4:2:0 is worth its 10%, because these
   * are pave renders and the entire subject is chroma-sharp sparkle.
   *
   * Every piece ships twice all the same, because a jewelry store cannot show
   * one visitor in twenty an empty tunnel: the WebP set is still there, cut to
   * the same 320 and 1340KB, for the browsers that predate AVIF. One decode of
   * a one-pixel AVIF WITH AN ALPHA PLANE settles which, since alpha is the
   * whole of what these files are and a decoder that took an opaque probe
   * would prove nothing about them.
   *
   * THE ARMING WAITS FOR IT, and it has to: a decode is a callback, and the
   * film warms itself at a dozen progresses inside the first second, several
   * of which are past 0.34, so the gallery can be armed before the probe has
   * answered. On the first cut of this it always was, and every visitor got
   * the WebP set while the AVIF set sat on the server unread. So `ext` starts
   * undecided and an arm that arrives early parks; the probe releases it. A
   * second and a half of silence settles on WebP anyway, because a gallery
   * that never arms is worse than one in the wrong format, and a browser that
   * answers neither onload nor onerror to a data URI is not one to bet a
   * chapter on. */
  let ext = null;
  let armPending = false;
  {
    const probe = new Image();
    const settle = (v) => {
      if (ext) return;
      ext = v;
      if (armPending) {
        armPending = false;
        armGallery();
      }
    };
    probe.onload = () => settle(probe.width > 0 ? ".avif" : ".webp");
    probe.onerror = () => settle(".webp");
    setTimeout(() => settle(".webp"), 1500);
    probe.src =
      "data:image/avif;base64," +
      "AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAA" +
      "AAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAHAAAAAGAACAAAAAQAAAa4AAAASAAAA" +
      "QmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmly" +
      "ZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAAD" +
      "CAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMA" +
      "AAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKD" +
      "BAACBAEFhgcAAAAybWRhdBIACgQYAAYVMggfkP/xAAIgqBIACggYAAYICGg0IDIKH5A////EAACv7g==";
  }

  function buildGallery() {
    const rand = rng(20260801);
    JEWELRY.forEach((piece) => {
      /* How near this piece is and how it sways; WHERE it hangs is decided
       * in layoutGallery, off its rank in the hang order rather than off
       * this manifest index, and the note there says why that distinction
       * was paid for. `sz` is the piece's nearness, and its size, its
       * draw order, its share of the parallax and the reach of its sway
       * all read off that one number, which is what makes the differences
       * read as depth rather than as assorted styling. The sway itself is
       * two slow sines a little off each other's pace, so the path never
       * repeats and never goes anywhere, with a rock and a breath of
       * scale on their own phases; every rate and phase is seeded, so no
       * two pieces breathe together and every visit hangs the same room.
       *
       * THIS STREAM IS v0.4.5'S, DRAW FOR DRAW: ten pulls per piece in
       * the same order, then the shuffle off the same stream, so the
       * rework hangs the exact room the DOM version hung and a capture
       * diffs against the old one on light and motion alone. Everything
       * the shader era added draws from the second stream below, which
       * is why it is a second stream. */
      const sz = 0.5 + 0.5 * rand();
      items.push({
        f: piece.f,
        nw: piece.w,
        jx: (rand() - 0.5) * 0.06,
        jy: (rand() - 0.5) * 0.06,
        sz,
        w1: 0.5 + 0.5 * rand(),
        w2: 0.4 + 0.45 * rand(),
        w3: 0.3 + 0.3 * rand(),
        p1: rand() * 6.283,
        p2: rand() * 6.283,
        p3: rand() * 6.283,
        // Radians now: the rock lives in the vertex shader.
        tilt: ((rand() * 9 - 4.5) * Math.PI) / 180,
        // Far pieces rock a little more than near ones: a big piece
        // swinging reads as heavy, a small one as weightless.
        rr: ((1.1 + 1.7 * (1 - sz)) * Math.PI) / 180,
        // A piece is only ever as big as its own longest side allows.
        aspect: piece.w / piece.h,
        tall: piece.h >= piece.w,
        active: false,
        slot: -1,
        img: null,
        loaded: false,
        failed: false,
        loadT: -1,
        rx: 0,
        ry: 0,
        rw: 0,
        rh: 0,
        w: 0,
        h: 0,
        cx: 0,
        cy: 0,
        ax: 0,
        ay: 0,
        wy: 0,
        py: 0,
        wp: 0,
        pp: 0,
        seed: 0,
        haloTh: 0,
        haloU: 0,
        strSpeed: 0,
        strPh: 0,
        wallX: 0,
        wallY: 0,
        wallS: 1,
        wallR: 0,
        j3x: 0,
        j3y: 0,
      });
    });
    /* One seeded shuffle decides WHICH pieces a given count hangs, so the
     * membership is stable across visits, and a resize only adds to or
     * trims from the end of the same order rather than recasting the
     * room. */
    galOrder = items.map((_, i) => i);
    for (let i = galOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = galOrder[i];
      galOrder[i] = galOrder[j];
      galOrder[j] = t;
    }
    /* The second stream: the third dimension and the glints. Appending
     * these to the first stream would have moved every draw the shuffle
     * makes and recast the whole room, which is exactly the kind of
     * invisible regression the captures would have paid for. */
    const rand2 = rng(20260808);
    for (const it of items) {
      it.wy = 0.14 + 0.16 * rand2();
      it.py = rand2() * 6.283;
      it.wp = 0.11 + 0.13 * rand2();
      it.pp = rand2() * 6.283;
      it.seed = rand2();
    }
    /* The third stream: the formations (v0.4.7). Same rule as the second
     * stream, for the same reason: a new era appends a new stream rather
     * than pulling more from an old one, because every extra pull moves
     * every later draw and recasts a room the captures have already
     * signed off. These are the wall's own jitter and lean and the
     * stream's bob phase; where a piece stands in the halo and how fast
     * its lane flows come off its RANK in the hang order instead (see
     * layoutGallery), so a resize that trims the order cannot reshuffle
     * the survivors. */
    const rand3 = rng(20260816);
    for (const it of items) {
      it.j3x = (rand3() - 0.5) * 0.24;
      it.j3y = (rand3() - 0.5) * 0.24;
      it.wallR = (rand3() - 0.5) * 0.07;
      it.strPh = rand3() * 6.283;
    }
  }

  /* THE ATLAS. Every hung piece rasterised once into one canvas, uploaded
   * as one mipmapped texture, so the whole constellation is a single
   * bind. Entries are packed at hang size times the device ratio (capped
   * at the file's own pixels, so nothing is an upscale), shelf-packed by
   * height, each inside ATLAS_PAD of transparent guard. Premultiplied on
   * upload, because these files are alpha cut-outs and a linear filter
   * walking a straight-alpha edge drags whatever colour hides under the
   * transparent pixels into the fringe; premultiplied, the fringe is
   * simply fainter piece. flipY stays off so the atlas's own row order is
   * the texture's, and the shader measures v from the top like everything
   * else that touches the canvas. */
  const galAtlas = (() => {
    const cv = document.createElement("canvas");
    cv.width = 4;
    cv.height = 4;
    const c2d = cv.getContext("2d");
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = false;
    tex.premultiplyAlpha = true;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return { cv, c2d, tex, w: 4, h: 4, packed: false, timer: 0 };
  })();

  /* Draws into the atlas CANVAS only. The texture upload is marked by the
   * batch timer in galWake and by galPack, never here: an upload means
   * re-sending the whole atlas and regenerating its mip chain, and doing
   * that once per landed file turned seventy-four arrivals into
   * seventy-four uploads, which under a software rasteriser stretched the
   * boot by whole seconds. One batch, one upload. */
  function galBlit(it) {
    if (!it.loaded || !it.rw) return;
    const c = galAtlas.c2d;
    // The 2d context forgets these whenever the canvas is resized.
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.clearRect(it.rx, it.ry, it.rw, it.rh);
    c.drawImage(it.img, it.rx, it.ry, it.rw, it.rh);
  }

  function galRect(it) {
    if (it.slot < 0) return;
    const a = galAttr.aRect;
    a.array[it.slot * 4] = it.rx / galAtlas.w;
    a.array[it.slot * 4 + 1] = it.ry / galAtlas.h;
    a.array[it.slot * 4 + 2] = it.rw / galAtlas.w;
    a.array[it.slot * 4 + 3] = it.rh / galAtlas.h;
    a.needsUpdate = true;
  }

  function galPack() {
    const list = items.filter((it) => it.active);
    if (!list.length) return;
    const maxTex = Math.min(renderer.capabilities.maxTextureSize || 4096, 8192);
    let dprA = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    for (;;) {
      const ent = list.map((it) => {
        const pw = Math.max(8, Math.min(Math.round(it.w * dprA), it.nw));
        const ph = Math.max(8, Math.round(pw / it.aspect));
        return { it, pw, ph, w: pw + 2 * ATLAS_PAD, h: ph + 2 * ATLAS_PAD, x: 0, y: 0 };
      });
      // Shelves want even heights; sorted, the tallest row is the first
      // and every later shelf is tighter than the one above it.
      ent.sort((a, b) => b.h - a.h);
      const area = ent.reduce((s, e) => s + e.w * e.h, 0);
      let W = 1024;
      while (W < maxTex && W * W < area * 1.25) W *= 2;
      let x = 0;
      let y = 0;
      let rowH = 0;
      for (const e of ent) {
        if (x + e.w > W) {
          x = 0;
          y += rowH;
          rowH = 0;
        }
        e.x = x;
        e.y = y;
        x += e.w;
        if (e.h > rowH) rowH = e.h;
      }
      const H = y + rowH;
      // A screen big enough to overflow the texture unit gets the same
      // room at a slightly lower density instead of a lost chapter.
      if (H > maxTex) {
        dprA *= 0.8;
        continue;
      }
      galAtlas.w = W;
      galAtlas.h = H;
      // Assigning the size clears the canvas, which is the reset the
      // repack wants anyway.
      galAtlas.cv.width = W;
      galAtlas.cv.height = H;
      for (const e of ent) {
        e.it.rx = e.x + ATLAS_PAD;
        e.it.ry = e.y + ATLAS_PAD;
        e.it.rw = e.pw;
        e.it.rh = e.ph;
        galBlit(e.it);
      }
      galAtlas.tex.needsUpdate = true;
      galAtlas.packed = true;
      for (const it of list) galRect(it);
      return;
    }
  }

  /* THE PASS. One quad, instanced over the hung set, drawn over the
   * room's blit with the same premultiplied-over blend the compositor
   * used to apply to the DOM pieces. The vertex shader is the whole of
   * driveGallery's per-frame arithmetic plus the motion the DOM could
   * never afford; the fragment is one atlas read plus the light. The
   * instances are sorted far to near once at hang time (instances raster
   * in order, so draw order is depth order), which is what the DOM
   * version spent z-index on. */
  const galU = {
    uTex: { value: galAtlas.tex },
    uView: { value: new THREE.Vector2(1, 1) },
    uBand: { value: new THREE.Vector4(0, 0, 1, 1) },
    uBeam0: { value: new THREE.Vector4(1, 0, 0, 0) },
    uBeam1: { value: new THREE.Vector4(1, 0, 0, 0) },
    uT: { value: 0 },
    uIk: { value: 0 },
    uInk: { value: 0 },
    uFade: { value: 0 },
    uA: { value: 1 },
    /* The formation dials (v0.4.7). uG is the reader's way down the whole
     * chapter, 0 at the flash and 1 at the cut, and it is the only clock
     * the choreography runs on: every weight in the vertex shader is a
     * smoothstep of it, so the formations scrub backwards exactly as they
     * play forwards. uHalo is the ring's centre and inner radii, uHalo2
     * the band's spread beyond them, uStream the river's wrap span,
     * margin, travel and drift, all in CSS pixels of the frame they were
     * computed for. */
    uG: { value: 0 },
    uHalo: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHalo2: { value: new THREE.Vector2(0, 0) },
    uStream: { value: new THREE.Vector4(1, 200, 0, 10) },
  };

  const galGeo = new THREE.InstancedBufferGeometry();
  galGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
      3
    )
  );
  galGeo.setIndex([0, 1, 2, 2, 1, 3]);
  const galAttr = {};
  for (const [name, size] of [
    ["aRect", 4],
    ["aPlace", 4],
    ["aSway1", 4],
    ["aSway2", 4],
    ["aChar", 4],
    ["aTilt", 4],
    ["aForm1", 4],
    ["aForm2", 4],
    ["aLoad", 1],
  ]) {
    // Sized off the manifest, not off items: this block runs before
    // buildGallery() has filled the item list, and a zero-length buffer
    // here is an out-of-bounds throw at the first hang.
    const a = new THREE.InstancedBufferAttribute(
      new Float32Array(JEWELRY.length * size),
      size
    );
    a.setUsage(THREE.DynamicDrawUsage);
    galAttr[name] = a;
    galGeo.setAttribute(name, a);
  }
  galGeo.instanceCount = 0;

  const galMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: galU,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: [
      /* Everything a piece does in a frame, from seeds. The clock and the
       * scroll arrive as uniforms; nothing per piece is computed on the
       * CPU at all. All of it is highp on purpose: galT grows for as long
       * as a reader stays inside the chapter, and sin() of a large
       * argument in mediump is the kind of bug that only ever shows on
       * somebody else's phone. */
      "precision highp float;",
      "in vec3 position;",
      "in vec4 aRect;",
      "in vec4 aPlace;",
      "in vec4 aSway1;",
      "in vec4 aSway2;",
      "in vec4 aChar;",
      "in vec4 aTilt;",
      "in vec4 aForm1;",
      "in vec4 aForm2;",
      "in float aLoad;",
      "uniform vec2 uView;",
      "uniform vec4 uBand;",
      "uniform float uT;",
      "uniform float uIk;",
      "uniform float uInk;",
      "uniform float uA;",
      "uniform float uG;",
      "uniform vec4 uHalo;",
      "uniform vec2 uHalo2;",
      "uniform vec4 uStream;",
      "out vec2 vPuv;",
      "out vec2 vSuv;",
      "out vec2 vQ;",
      "out vec4 vAux;",
      "out vec3 vSpk;",
      "flat out vec4 vRect;",
      "flat out vec2 vPsz;",
      "flat out float vLoad;",
      "const float PI = 3.141592653589793;",
      "void main() {",
      "  float sz = aChar.x;",
      "  float seed = aChar.w;",
      "  float w = aPlace.z;",
      "  float h = aPlace.w;",
      /* The slide is centred on the middle of the chapter, so the beats,
       * which sit near it, read the room at its hung positions; the sway
       * rides on top. Nearer pieces take more of both, which is the
       * parallax that makes a moving frame and a held one feel like the
       * same place seen from two heights. The 0.14 is the old GAL_PAR. */
      "  float par = (0.5 - uIk) * uView.y * 0.14 * (0.35 + 0.75 * sz);",
      /* The sway: v0.4.4's two slow sines, with a second, smaller pair a
       * little off their pace underneath, so the path is a slow loop that
       * never quite repeats instead of a figure the eye can learn. */
      "  float swx = sin(uT * aSway1.x + aSway1.y) * aChar.y",
      "            + sin(uT * aSway1.x * 0.53 + aSway2.y * 2.1) * aChar.y * 0.45;",
      "  float swy = sin(uT * aSway1.z + aSway1.w) * aChar.z",
      "            + cos(uT * aSway1.z * 0.61 + aSway1.y * 1.7) * aChar.z * 0.4;",
      /* THE FOUR FORMATIONS (v0.4.7). The chapter is a choreography now,
       * and this is the whole of it: the hung set opens as the scatter,
       * gathers into a turning halo around the words, unravels into a
       * river of counter-flowing lanes, and settles onto a salon wall
       * for the goodbye, all without a single piece ever fading in or
       * out. Each formation is a closed position per piece; uG blends
       * between them through per-piece staggered smoothsteps, so the
       * flock reorganises a few pieces at a time instead of sliding as
       * one sheet, and every flight bows along a seeded arc rather than
       * running the straight rail between two marks. Everything is a
       * function of (uG, uT, seeds): the film scrubs backwards through
       * every formation and a held ?p= frame is one fixed picture. */
      "  vec2 pScat = vec2(aPlace.x + swx, aPlace.y + par + swy);",
      "  pScat.x = clamp(pScat.x, w * 0.18, uView.x - w * 0.18);",
      "  float stg = (seed - 0.5) * 0.07;",
      "  float m1 = smoothstep(0.20 + stg, 0.31 + stg, uG);",
      "  float m2 = smoothstep(0.46 + stg, 0.57 + stg, uG);",
      "  float m3 = smoothstep(0.70 + stg, 0.79 + stg, uG);",
      /* The halo: golden-angle seats around an ellipse fitted to the
       * frame, each piece in its own radial lane of the band, the whole
       * wreath turning gently with the scroll and breathing on the
       * clock. The words of the second ink beat stand in its middle. */
      "  float th = aForm1.x + uG * 2.2 + uT * 0.016;",
      "  vec2 pHalo = uHalo.xy + vec2(cos(th), sin(th)) * (uHalo.zw + aForm1.y * uHalo2)",
      "             + vec2(swx, swy) * 0.35;",
      /* The stream: horizontal lanes dealt from the scatter's own
       * latitudes, adjacent lanes flowing opposite ways, each piece
       * wrapping around a span two margins wider than the frame so the
       * jump home always happens fully off screen. It flows with the
       * scroll and keeps a whisper of drift on the clock, so a parked
       * reader still watches a river rather than a shelf. */
      "  float sdx = aForm1.z * (uG * uStream.z + uT * uStream.w);",
      "  float xs = mod(aPlace.x + uStream.y + sdx, uStream.x) - uStream.y;",
      "  float ys = mix(aPlace.y, uView.y * 0.5, 0.08)",
      "           + sin(uT * aSway1.x * 0.55 + aForm2.w) * 11.0 + swy * 0.5;",
      /* The wall: the salon grid laid down in layoutGallery, still
       * breathing a sixth of the sway so it hangs rather than sticks. */
      "  vec2 pWall = aForm2.xy + vec2(swx, swy) * 0.16;",
      /* The flights. Each morph bows sideways along a seeded arc, capped
       * in pixels so a long crossing swoops without leaving the frame;
       * sin(PI * m) is zero at both ends, so every flight departs from
       * and lands on its formation exactly. */
      "  float b1 = fract(seed * 5.7) - 0.5;",
      "  float b2 = fract(seed * 8.3) - 0.5;",
      "  float b3 = fract(seed * 11.9) - 0.5;",
      "  vec2 pos = pScat;",
      "  vec2 dd = pHalo - pos;",
      "  float bk = min(1.0, 560.0 / (length(dd) + 1.0));",
      "  pos = mix(pos, pHalo, m1) + vec2(-dd.y, dd.x) * (0.6 * b1 * bk * sin(PI * m1));",
      "  dd = vec2(xs, ys) - pos;",
      "  bk = min(1.0, 560.0 / (length(dd) + 1.0));",
      "  pos = mix(pos, vec2(xs, ys), m2) + vec2(-dd.y, dd.x) * (0.6 * b2 * bk * sin(PI * m2));",
      "  dd = pWall - pos;",
      "  bk = min(1.0, 560.0 / (length(dd) + 1.0));",
      "  pos = mix(pos, pWall, m3) + vec2(-dd.y, dd.x) * (0.6 * b3 * bk * sin(PI * m3));",
      /* THE PIECES STILL PART AROUND THE WORDS, v0.4.5's taper and
       * measured-from-the-edge arithmetic, applied to the blended
       * position so a piece mid-flight makes room exactly as a hung one
       * does. Two modes now. In the scatter, the halo and the stream the
       * push is horizontal, near pieces only, the far ones passing
       * behind the clearing's veil as they always have; on the halo it
       * is what flexes the wreath open at the words' line. On the wall
       * every piece is the front row, so the wall parts VERTICALLY
       * instead: the rows above the words rise and the rows below sink,
       * a seam opening in the hang exactly while the third beat stands,
       * and closing behind it. */
      "  float dyb = abs(pos.y - uBand.y) / (uBand.w + h * 0.42);",
      "  if (dyb < 1.0 && uInk > 0.002) {",
      "    float tq = clamp((dyb - 0.42) / 0.58, 0.0, 1.0);",
      "    float kq = uInk * (1.0 - tq * tq * (3.0 - 2.0 * tq));",
      "    if (m3 > 0.5) {",
      "      float dy = pos.y - uBand.y;",
      "      float needY = uBand.w * 0.9 + h * 0.55;",
      "      if (abs(dy) < needY) {",
      "        float dir = dy >= 0.0 ? 1.0 : -1.0;",
      "        pos.y = clamp(uBand.y + dir * mix(abs(dy), needY + abs(dy) * 0.3, kq * 0.9),",
      "                      h * 0.3, uView.y - h * 0.3);",
      "      }",
      "    } else if (sz >= 0.74) {",
      "      float dx = pos.x - uBand.x;",
      "      float need = uBand.z + w * 0.4;",
      "      if (abs(dx) < need) {",
      "        float dir = dx >= 0.0 ? 1.0 : -1.0;",
      "        pos.x = clamp(uBand.x + dir * mix(abs(dx), need + abs(dx) * 0.45, kq * 0.95),",
      "                      w * 0.18, uView.x - w * 0.18);",
      "      }",
      "    }",
      "  }",
      /* The rock and the breath, plus a whisper of scroll-linked lean so
       * a swipe tips the field, far pieces a touch more than near. The
       * breath stays strictly below one: the raster is never enlarged,
       * and every formation multiplier below only ever scales DOWN. The
       * halo half-stills the rock so the wreath reads as set rather than
       * scattered, the stream leans each piece into its own travel and
       * doubles the sail of the yaw, and the wall straightens everything
       * to its own seeded lean at its own fitted size. */
      "  float rot = (aSway2.z + sin(uT * aSway2.x + aSway2.y) * aSway2.w",
      "            + (0.5 - uIk) * (seed - 0.5) * 0.14)",
      "            * (1.0 - 0.45 * m1 * (1.0 - m2) - 0.75 * m3)",
      "            + aForm2.z * m3",
      "            - m2 * (1.0 - m3) * sign(aForm1.z) * 0.05;",
      "  float s = (0.968 + 0.026 * sin(uT * aSway1.z * 0.83 + aSway1.y * 1.7))",
      "          * (1.0 - 0.05 * m1 * (1.0 - m2)) * mix(1.0, aForm1.w, m3);",
      /* THE THIRD DIMENSION, from v0.4.6: a slow seeded yaw and pitch, a
       * few degrees each, under a real perspective divide, which is a
       * card hanging in water rather than a sticker drifting on glass.
       * Far pieces roll a little more, the same weight rule the rock
       * follows; in the stream the roll swells, a card carried by water
       * rather than hanging in it. */
      "  float yaw = sin(uT * aTilt.x + aTilt.y) * (0.10 + 0.10 * (1.0 - sz))",
      "            * (1.0 + 1.1 * m2 * (1.0 - m3));",
      "  float pit = sin(uT * aTilt.z + aTilt.w) * 0.07;",
      /* The quad is padded past the raster so the contact shadow has
       * somewhere to fall; the piece sits centred in it. */
      "  float pad = 0.30 * min(w, h) + 14.0;",
      "  vec2 psz = vec2(w, h) * s;",
      "  vec2 quad = psz + 2.0 * pad;",
      "  vec2 loc = position.xy * quad;",
      "  float cr = cos(rot);",
      "  float sr = sin(rot);",
      "  vec2 lr = vec2(loc.x * cr - loc.y * sr, loc.x * sr + loc.y * cr);",
      "  vec3 v3 = vec3(lr.x * cos(yaw), lr.y * cos(pit), lr.x * sin(yaw) + lr.y * sin(pit));",
      /* An honest w, so the varyings interpolate perspective-correct and
       * the near edge of a tilted piece genuinely grows. Focal length
       * about 830 css px, far enough that the tilt reads as air rather
       * than as a card trick. */
      "  float wc = 1.0 + v3.z * 0.0012;",
      "  vec2 Am = vec2(2.0 / uView.x, -2.0 / uView.y);",
      "  vec2 Bm = vec2(-1.0, 1.0);",
      "  gl_Position = vec4((Am * pos + Bm) * wc + Am * v3.xy, 0.0, wc);",
      "  vec2 pxy = loc + quad * 0.5;",
      "  vPuv = (pxy - vec2(pad)) / psz;",
      /* The shadow's own frame: an ellipse displaced down the page,
       * radii a little over the piece's half sizes, so the falloff in
       * the fragment lands where the DOM's drop-shadow used to. */
      "  vSuv = (pxy - (quad * 0.5 + vec2(0.0, 10.0 + 0.10 * h))) / (psz * vec2(0.62, 0.56));",
      /* Where this fragment stands in the ROOM's own frame, for the
       * beams: the crystal shader's q is ndc with x scaled by aspect. */
      "  vec2 nd = (Am * pos + Bm) + Am * (v3.xy / wc);",
      "  vQ = vec2(nd.x * uA, nd.y);",
      /* The glint schedule: each piece throws a small star once in a
       * while, on its own seeded cycle, some cycles skipped so the case
       * twinkles instead of blinking. Everything is a function of uT and
       * the seed, so a held frame holds its glints too. */
      "  float cyc = uT * (0.030 + 0.025 * fract(seed * 13.7)) + seed * 29.0;",
      "  float ph = fract(cyc);",
      "  float env = ph < 0.06 ? sin(PI * ph / 0.06) : 0.0;",
      "  env *= step(0.35, fract(seed * 7.31 + floor(cyc) * 0.618));",
      "  vSpk = vec3(0.30 + 0.40 * fract(seed * 5.1 + floor(cyc) * 0.377),",
      "              0.28 + 0.40 * fract(seed * 9.7 + floor(cyc) * 0.711),",
      "              env);",
      /* The sheen rides the yaw: position from the roll itself, strength
       * from its velocity, so the light glides across the face exactly
       * while the face is turning and rests when it rests. */
      "  vAux = vec4(yaw * 3.2, sin(uT * aTilt.x + aTilt.y + PI * 0.5), seed, sz);",
      "  vRect = aRect;",
      "  vPsz = psz;",
      /* Loading is the one honest pop the DOM version had; eased here.
       * loadT is the clock's value when the file landed: at or before
       * zero means it landed before the chapter ever ran, so it simply
       * is there, exactly as a held ?p= frame wants. */
      "  vLoad = aLoad < -0.5 ? 0.0",
      "        : (aLoad <= 0.0 ? 1.0 : clamp((uT - aLoad) / 0.5, 0.0, 1.0));",
      "}",
    ].join("\n"),
    fragmentShader: [
      "precision mediump float;",
      "uniform sampler2D uTex;",
      "uniform vec4 uBeam0;",
      "uniform vec4 uBeam1;",
      "uniform float uFade;",
      "in vec2 vPuv;",
      "in vec2 vSuv;",
      "in vec2 vQ;",
      "in vec4 vAux;",
      "in vec3 vSpk;",
      "flat in vec4 vRect;",
      "flat in vec2 vPsz;",
      "flat in float vLoad;",
      "out vec4 outCol;",
      "void main() {",
      /* The piece: one premultiplied sRGB read, clamped to its own atlas
       * entry and zeroed outside it, so the pad and the neighbours can
       * never leak in whatever the derivatives do at the quad's edge. */
      "  vec2 cu = clamp(vPuv, 0.0, 1.0);",
      "  float inP = step(abs(vPuv.x - 0.5), 0.5) * step(abs(vPuv.y - 0.5), 0.5);",
      "  vec4 piece = texture(uTex, vRect.xy + cu * vRect.zw) * inP;",
      /* The contact shadow, composited UNDER the piece in the same
       * fragment: the separation from the white room that the DOM spent
       * a rasterised drop-shadow filter on, as one smooth ellipse. */
      "  float rs = length(vSuv);",
      "  float sh = 0.20 * pow(clamp(1.0 - rs, 0.0, 1.0), 1.6);",
      "  vec3 rgb = piece.rgb + vec3(0.102) * sh * (1.0 - piece.a);",
      "  float a = piece.a + sh * (1.0 - piece.a);",
      /* THE ROOM'S BEAMS CROSS THE PIECES HERE, the same two beams the
       * crystal shader sweeps, from the same sum (the cos, sin and offset
       * arrive precomputed off roomK). They screen, exactly as the DOM
       * layers did: on white nothing happens, on a photographed piece the
       * light passes across it, and the amplitudes land almost entirely
       * on mid-tones and shadows, which is what a light crossing a
       * photograph actually does. */
      "  float b0 = dot(vQ, uBeam0.xy) - uBeam0.z;",
      "  float b1 = dot(vQ, uBeam1.xy) - uBeam1.z;",
      "  float g = exp(-b0 * b0 * 3.0) * uBeam0.w + exp(-b1 * b1 * 3.0) * uBeam1.w;",
      /* The sheen: a soft band gliding across the face while the piece
       * rolls, gone when it rests. */
      "  float band = dot(vPuv - 0.5, vec2(0.778, 0.628));",
      "  float dsh = band - vAux.x * 0.21;",
      "  g += exp(-dsh * dsh * 26.0) * 0.14 * abs(vAux.y) * piece.a;",
      "  rgb += clamp(g, 0.0, 1.0) * (vec3(a) - rgb);",
      /* The star glint: a core and four rays, masked to the piece's own
       * bright pixels so it reads as a facet catching the room rather
       * than a sprite over it. */
      "  if (vSpk.z > 0.001) {",
      "    vec2 sp = (vPuv - vSpk.xy) * vPsz;",
      "    float R = 0.14 * min(vPsz.x, vPsz.y);",
      "    float rn = dot(sp, sp) / (R * R);",
      "    float star = exp(-rn * 3.0) * 1.15",
      "               + exp(-abs(sp.x) / (R * 0.85)) * exp(-abs(sp.y) / (R * 0.14)) * 0.85",
      "               + exp(-abs(sp.y) / (R * 0.85)) * exp(-abs(sp.x) / (R * 0.14)) * 0.85;",
      "    float lum = piece.g / max(piece.a, 0.001);",
      "    star *= vSpk.z * smoothstep(0.35, 0.75, piece.a) * (0.30 + 0.70 * lum);",
      "    rgb += clamp(star, 0.0, 1.5) * (vec3(a) - rgb);",
      "  }",
      /* uFade is the chapter's own light (the old container opacity) and
       * vLoad the ease-in of a file that landed mid-chapter; both scale
       * the whole premultiplied colour, which is what opacity means. */
      "  outCol = vec4(rgb, a) * (uFade * vLoad);",
      "}",
    ].join("\n"),
  });
  const galMesh = new THREE.Mesh(galGeo, galMat);
  galMesh.frustumCulled = false;
  const galScn = new THREE.Scene();
  galScn.add(galMesh);
  const galCam = new THREE.Camera();

  /* Hang the room: how many pieces, which ones, how big, and where.
   *
   * The count comes off the viewport's area and the sizes come back off
   * the count, so the hung set always sums to about GAL_COVER of the
   * frame; the mean size is the square root of the share each piece gets,
   * spread by nearness so the nearest is a little over twice the size of
   * the furthest. Rasterised once at that size, capped at the 320 the
   * files are cut at, and the per-frame scale breathes strictly below
   * one, so nothing is ever a bitmap being enlarged. Everything a frame
   * needs rides the instance buffer from here; the film's own per-frame
   * share of the constellation is a handful of uniforms. */
  function layoutGallery() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    if (!w || !h) return;
    /* All of them, wherever all of them fit. 0.42 rather than GAL_COVER is
     * the coverage the frame is allowed AT THE FLOOR, since a set pinned to
     * its minimum size cannot shrink to make room: at that size a piece
     * occupies about GAL_FLOOR squared times the mean aspect, so this hangs
     * the full manifest on anything from a portrait tablet up, and a phone
     * hangs the twenty-odd the floor allows instead of the ten the old
     * area dial gave it. */
    const n = Math.min(
      items.length,
      Math.max(10, Math.floor((w * h * 0.42) / (GAL_FLOOR * GAL_FLOOR)))
    );
    const mean = Math.sqrt((GAL_COVER * w * h) / n);
    for (let r = 0; r < galOrder.length; r++) {
      const it = items[galOrder[r]];
      const active = r < n;
      if (active !== it.active) {
        // Membership only ever changes here, on a resize, never on a
        // frame of the film: nothing pops while anybody is watching.
        it.active = active;
        if (active && galleryArmed) armItem(it, "low");
      }
      if (!active) {
        it.slot = -1;
        // And no atlas rect either: a file still in flight for a piece
        // trimmed here would otherwise land, after the repack, on a rect
        // the packer has since handed to somebody else, and stamp itself
        // across another piece's raster.
        it.rw = 0;
        continue;
      }
      /* Where it hangs comes off the R2 sequence BY RANK IN THE HANG
       * ORDER, not by manifest index, and the difference was visible the
       * one time it was got wrong: any PREFIX of the R2 sequence is
       * itself low-discrepancy, so hanging the first n ranks spreads any
       * count evenly and a resize hangs the next piece in the largest
       * gap, while indexing by manifest position hands a shuffled subset
       * of the lattice, which is a random draw again, and the first
       * capture of it had five pieces in one chain down the left of the
       * frame. The jitter is a seeded breath so the lattice underneath
       * never shows. */
      it.cx = (0.07 + 0.86 * ((r * 0.7548776662466927 + 0.5 + it.jx) % 1)) * w;
      it.cy = (0.12 + 0.76 * ((r * 0.5698402909980532 + 0.5 + it.jy) % 1)) * h;
      /* THE HALO AND THE STREAM STAND ON RANK, NOT ON MANIFEST INDEX,
       * for the same reason the scatter does: the hang order is one
       * seeded shuffle, so rank spaces the SIZES around the ring as
       * evenly as it spaces the pieces, and a resize that trims the
       * order leaves every survivor exactly where it stood. The angle is
       * the golden angle by rank (any prefix stays evenly spread), the
       * radial seat is the golden ratio by rank (same property along
       * the band's width), and the stream lane is dealt from the
       * piece's own scatter latitude, so the river inherits the
       * scatter's even vertical spread instead of inventing one. */
      it.haloTh = r * 2.399963229728653 + 0.85;
      it.haloU = (r * 0.6180339887498949 + 0.37) % 1;
      const lane = clamp(Math.floor(((it.cy / h - 0.12) / 0.76) * 5), 0, 4);
      it.strSpeed =
        (lane % 2 ? -1 : 1) *
        (0.55 + 0.5 * ((r * 0.7548776662466927 + 0.19) % 1)) *
        (0.7 + 0.5 * it.sz);
      const long = clamp(Math.round(mean * (0.62 + 0.76 * it.sz)), GAL_FLOOR, 320);
      const wid = Math.max(48, Math.round(it.tall ? long * it.aspect : long));
      it.w = wid;
      it.h = wid / it.aspect;
      /* The sway keeps a floor in pixels. It used to be a pure fraction of
       * the piece's width, which was right when twenty pieces averaged a
       * hundred and forty; with the whole manifest hung the mean piece is
       * half that, and a seventy-pixel piece drifting seven would read as
       * parked. Ten pixels of drift is alive at any size and still small
       * beside the piece itself. */
      it.ax = Math.max(10, it.w * 0.1);
      it.ay = Math.max(13, it.w * 0.13);
    }
    /* THE WALL, laid once per hang: a salon grid over the middle of the
     * frame, filled in RANK order so the seeded shuffle deals the sizes
     * through it and no corner collects the big pieces. The column count
     * comes off the frame's own shape, the last row is centred rather
     * than left ragged, each piece keeps a seeded breath of jitter and
     * lean so the grid reads as a wall somebody hung rather than a
     * spreadsheet, and wallS is the one place in the chapter a piece is
     * allowed to render under its hang size: the fit into a cell only
     * ever scales DOWN, so the raster ceiling holds. The words' own row
     * is not reserved here; the wall opens a seam for them live, in the
     * vertex shader, exactly while the third ink beat is standing. */
    {
      const act = [];
      for (let r = 0; r < galOrder.length && act.length < n; r++) {
        const it = items[galOrder[r]];
        if (it.active) act.push(it);
      }
      const portrait = w / h < 0.9;
      const wallW = w * 0.92;
      /* Portrait hangs the whole wall BELOW the words. The wide frame
       * centres the grid and lets the seam open both ways; on a phone
       * the words live at the top by the same media query everything
       * else follows, and a row parted upward from there has nowhere to
       * go but behind the nav, which the first capture of this grid
       * showed. Started under the band instead, the only row the seam
       * ever touches is the first, and it dodges down. */
      const wallH = h * (portrait ? 0.54 : 0.72);
      const cols = Math.max(
        2,
        Math.round(Math.sqrt(((act.length * wallW) / wallH) * (portrait ? 1.05 : 0.8)))
      );
      const rows = Math.max(1, Math.ceil(act.length / cols));
      const cw = wallW / cols;
      const ch = wallH / rows;
      const x0 = (w - wallW) / 2;
      const y0 = h * (portrait ? 0.67 : 0.52) - wallH / 2;
      const lastN = act.length - cols * (rows - 1);
      for (let j = 0; j < act.length; j++) {
        const it = act[j];
        const row = Math.floor(j / cols);
        const col = j % cols;
        const off = row === rows - 1 ? ((cols - lastN) / 2) * cw : 0;
        it.wallX = x0 + off + (col + 0.5 + it.j3x) * cw;
        it.wallY = y0 + (row + 0.5 + it.j3y) * ch;
        it.wallS = Math.min(1, (Math.min(cw, ch) * 0.92) / Math.max(it.w, it.h));
      }
    }
    /* Far to near, once: instances rasterise in order, so the sort IS the
     * stacking, and two bubbles cross without the eye losing which is in
     * front. */
    galDraw = items.filter((it) => it.active).sort((a, b) => a.sz - b.sz);
    for (let i = 0; i < galDraw.length; i++) {
      const it = galDraw[i];
      it.slot = i;
      galAttr.aPlace.array.set([it.cx, it.cy, it.w, it.h], i * 4);
      galAttr.aSway1.array.set([it.w1, it.p1, it.w2, it.p2], i * 4);
      galAttr.aSway2.array.set([it.w3, it.p3, it.tilt, it.rr], i * 4);
      galAttr.aChar.array.set([it.sz, it.ax, it.ay, it.seed], i * 4);
      galAttr.aTilt.array.set([it.wy, it.py, it.wp, it.pp], i * 4);
      galAttr.aForm1.array.set([it.haloTh, it.haloU, it.strSpeed, it.wallS], i * 4);
      galAttr.aForm2.array.set([it.wallX, it.wallY, it.wallR, it.strPh], i * 4);
      galAttr.aLoad.array[i] = it.loaded ? it.loadT : -1;
      galRect(it);
    }
    galGeo.instanceCount = galDraw.length;
    for (const k in galAttr) galAttr[k].needsUpdate = true;
    galU.uView.value.set(w, h);
    /* Repacking redraws every loaded piece and re-uploads the whole
     * atlas, so a live window-edge drag is debounced; the first hang
     * packs now, because there is nothing to draw from until it has. In
     * the gap between a resize and its repack the pieces render at their
     * new sizes from the old rects, which is a fifth of a second of
     * fractionally soft sampling, not a wrong picture. */
    clearTimeout(galAtlas.timer);
    if (!galAtlas.packed) galPack();
    else galAtlas.timer = setTimeout(galPack, 180);
  }

  /* ONLY WHAT IS HUNG IS FETCHED.
   *
   * The board armed all seventy-four files because all seventy-four
   * eventually crossed the window; the constellation shows one fixed set,
   * so the connection is asked for that set and for nothing else, which
   * on a phone is about an eighth of the old download. They go out
   * together at high priority, because they arrive on screen together;
   * there is no order the reader meets them in any more. A piece hung
   * later by a resize is armed the moment it is hung, at low priority,
   * since by then it is one straggler behind a room already dressed.
   *
   * An Image is created only for a piece that is actually hung, decoded
   * off the main thread where the browser allows it, and drawn into the
   * atlas the moment it lands. The batched wake below matters more than
   * it looks: the canvas repaints nothing on its own, so without it a
   * held ?p= frame would sit forever showing the room with no pieces.
   *
   * fetchPriority is set as a property rather than an attribute so a
   * browser that does not know it simply ignores an unknown property. */
  /* One repaint per BATCH of landed files, not one per file: the whole
   * hung set arrives shoulder to shoulder off one connection, and a wake
   * per landing drew the full film once per image, which under a software
   * rasteriser stretched the boot's warm by seconds and on any machine is
   * seventy draws where one would do. A held frame repaints at most a
   * beat after the last file of a batch lands. */
  let galWakeTimer = 0;
  function galWake() {
    clearTimeout(galWakeTimer);
    galWakeTimer = setTimeout(() => {
      galAtlas.tex.needsUpdate = true;
      wake();
    }, 120);
  }

  function armItem(it, priority) {
    if (it.img || it.failed || ext === null) return;
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = priority;
    img.onload = () => {
      it.loaded = true;
      it.loadT = galT;
      galBlit(it);
      if (it.slot >= 0) {
        galAttr.aLoad.array[it.slot] = it.loadT;
        galAttr.aLoad.needsUpdate = true;
      }
      galWake();
    };
    // A file that never comes is a hole the room closes over: the slot
    // stays transparent and the piece simply is not hung this visit.
    img.onerror = () => {
      it.failed = true;
    };
    img.src = "assets/img/jewelry/" + it.f + ext;
    it.img = img;
    if (img.decode) img.decode().catch(() => {});
  }

  function armGallery() {
    if (galleryArmed) return;
    // Which of the two sets this browser gets is not known on the frame the
    // film first crosses 0.34. Park; the probe calls back.
    if (ext === null) {
      armPending = true;
      return;
    }
    galleryArmed = true;
    for (const it of items) if (it.active) armItem(it, "high");
  }

  /* One frame of the constellation: the uniforms, then one draw over the
   * room's blit.
   *
   * `ik` is the reader's way down the chapter and drives only the gentle
   * slide; `tg` is the drift clock, frozen under ?p= and reduced motion.
   * Nothing per piece accumulates anywhere: every position is a closed
   * function of (ik, tg) evaluated in the vertex shader, so the chapter
   * scrubs backwards exactly as it plays forwards and a held frame is one
   * fixed picture. The pieces never fade one by one; uFade carries the
   * chapter's own light (in behind the flash, out with the collapse) and
   * that is the only fade there is.
   *
   * The band the near pieces part around is the ink beats' own footprint,
   * from the two numbers home.css sizes the clearing with: min(46rem,
   * 86vw) across and a little over a fifth of the frame either side of
   * the line, half of each so band and clearing are the SAME shape (this
   * constant drifted once, which is why the numbers are quoted here
   * rather than trusted). Portrait stacks the copy at the top at a MEDIA
   * QUERY, which is binary: the band lands at 26% the moment aspect
   * crosses 9/10, the measured centre of the stacked block, because a
   * ramp cannot follow a step.
   *
   * The beams arrive as cos, sin and offset precomputed off roomK, which
   * is the same sum the crystal shader reads (p * 34 + galT * 0.12), so
   * the light in the room and the light crossing the pieces cannot part
   * ways; precomputed, because roomK grows for as long as a reader stays
   * parked inside and a mediump sin() of a large angle is garbage on
   * exactly the phones this rework is for. */
  function galDrawPass(ik, p, tg, fade, roomK, aspect) {
    if (NO_GAL || !galAtlas.packed || !galGeo.instanceCount) return;
    /* How much copy is actually standing in the room this frame, read off
     * the ink beats' own windows rather than restated from them. Between
     * the two beats, and after the second one has gone, there is nothing
     * to make room for, and a field still parted around words that are
     * not there is a hole in the middle of the picture. */
    let inkK = 0;
    for (const beat of beats) {
      if (!beat.ink) continue;
      const k = seg(p, beat.a, beat.b);
      if (k <= 0 || k >= 1) continue;
      inkK = Math.max(inkK, clamp(k / 0.14, 0, 1) * clamp((1 - k) / 0.16, 0, 1));
    }
    const w = viewW;
    const h = viewH;
    const portrait = w / h < 0.9;
    galU.uBand.value.set(
      w * 0.5,
      h * (portrait ? 0.26 : 0.5),
      Math.min(368, w * 0.43),
      h * (portrait ? 0.2 : 0.22)
    );
    /* The choreography's own clock: 0 at the flash, 1 at the cut, the
     * scatter's hold, the three flights and the two other holds all
     * smoothsteps of this one number in the vertex shader. */
    galU.uG.value = seg(p, B.inside[0], B.inside[1]);
    /* The halo's ellipse, refitted to the frame every pass because it is
     * four multiplies and a stale ellipse after a rotate is a wreath
     * standing off centre. On a wide frame it rings the words: the inner
     * radius clears the ink band's own width (quoted from uBand's
     * numbers above) so the second beat stands in real empty room, and
     * the band reaches toward the frame's edge with room kept for a
     * piece's own half width. Portrait cannot ring words that span most
     * of the frame, so the words keep the top of the screen, where the
     * media query stacks them, and the wreath hangs whole beneath,
     * turning under the copy rather than around it. */
    if (portrait) {
      galU.uHalo.value.set(w * 0.5, h * 0.62, w * 0.22, h * 0.165);
      galU.uHalo2.value.set(w * 0.165, h * 0.155);
    } else {
      const rx0 = Math.min(Math.min(368, w * 0.43) * 1.12 + 40, w * 0.34);
      const ry0 = Math.max(h * 0.245, h * 0.231 + 40);
      galU.uHalo.value.set(w * 0.5, h * 0.5, rx0, ry0);
      galU.uHalo2.value.set(
        Math.max(40, w * 0.46 - rx0),
        Math.max(36, h * 0.42 - ry0)
      );
    }
    /* The stream's wrap: the span is the frame plus two margins sized
     * past the largest hung piece, so the jump from one edge's overshoot
     * back to the other always happens with the piece entirely off
     * screen, which is what keeps the river honest about nothing ever
     * popping. Travel is pitched so the fastest lane crosses about one
     * frame width across the stream's own hold; the last number is the
     * parked drift in pixels a second, gentle enough that an hour of
     * staring costs no piece its place in the room. */
    /* The margin scales with the frame, capped where it started: a flat
     * 200 was measured on the first phone capture as HALF the collection
     * off screen at any instant, because 400 extra pixels of road on a
     * 320 frame is more road than frame. A fifth of the width still
     * clears the widest piece a phone hangs before the wrap jumps it. */
    const strM = Math.min(200, w * 0.22);
    galU.uStream.value.set(w + 2 * strM, strM, w * 7.0, 10.0);
    const a0 = 0.9 + roomK * 0.05;
    const a1 = 3.1 - roomK * 0.08;
    galU.uBeam0.value.set(
      Math.cos(a0),
      Math.sin(a0),
      Math.sin(roomK * 0.22) * 0.4,
      0.42
    );
    galU.uBeam1.value.set(
      Math.cos(a1),
      Math.sin(a1),
      Math.sin(roomK * 0.22 + 2.7) * 0.4,
      0.28
    );
    galU.uT.value = tg;
    galU.uIk.value = ik;
    galU.uInk.value = inkK;
    galU.uFade.value = fade;
    galU.uA.value = aspect;
    // Over the blit, not instead of it: autoClear would wipe the room the
    // pieces are supposed to hang in.
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(galScn, galCam);
    renderer.autoClear = ac;
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
      // The gallery has to know which beats stand IN it, so the field can
      // make room for them and close again once they have gone.
      ink: el.classList.contains("beat--ink"),
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
        const heroW = 1 - seg(p, 0.0062, 0.0232);
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
      Math.max(1 - seg(p, B.boxOut[1] - 0.0155, B.boxOut[1] + 0.0232), teaseLit),
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
    const codaIn = smooth(seg(p, CODA[0] - 0.0062, CODA[0] + 0.0263));
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
    key.shadow.needsUpdate = moved && p < B.boxOut[1] + 0.0155;

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

    /* The lens is the press now, and nothing else. The rack focus that used
     * to open here went in v0.4.3 at the reader's word; the story is on the
     * pass itself. The film draws straight to the canvas until the squeeze
     * through the table asks for the target, which is the one stretch a
     * post-process earns its place in this film. */
    const pressK = easeIn3(seg(p, B.press[0], B.press[1]));
    const lensOn = !inCoda && pressK > 0.0005;

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
    /* The constellation's clock, and the room turning with it. Inside the
     * chapter the film idles the way the coda does: the pieces sway on
     * their sines and the crystal turns a breath at a time under them, so
     * a parked frame is a place rather than a poster. The drift rides uK,
     * which the constellation's beam uniforms read too, so the light in
     * the room and the light crossing the pieces can never part ways
     * (galDrawPass derives its cos and sin from this same sum); 0.12 a
     * second is
     * about a thirtieth of the pace a reader's own scroll turns the room
     * at. Frozen under ?p= with the other clocks, so captures stay
     * deterministic, and by reduced motion, so a stilled film stands
     * still. */
    const galleryOn = p > B.inside[0] && p < B.collapse[0] + 0.0185;
    if (galleryOn && !held && !reduceMotion.matches) galT += dt;
    const roomK = p * 34 + galT * 0.12;
    if (isInside) {
      inside.mat.uniforms.uK.value = roomK;
      inside.mat.uniforms.uOut.value = easeIn3(seg(p, B.collapse[0], B.collapse[1]));
      inside.mat.uniforms.uA.value = aspect;
      inside.draw();
    } else if (lensOn) {
      lens.set(pressK, aspect);
      lens.draw();
    } else {
      renderer.render(scene, camera);
    }

    /* The constellation rides the inside stretch, drawn straight over the
     * room's blit in the same frame. It ramps in behind the flash rather
     * than being at full strength in the frame the room arrives on, and
     * dims out with the collapse rather than hanging over the black that
     * follows it; that fade is the only fade there is, the pieces
     * themselves never coming or going one by one. Outside the window the
     * pass simply is not run, which is the whole of the old visibility
     * machinery: there is no layer left anywhere to outlive the chapter. */
    if (galleryOn) {
      const ik = seg(p, B.inside[0] + 0.0232, B.collapse[0] + 0.0155);
      const fade =
        (1 - smooth(seg(p, B.collapse[0], B.collapse[0] + 0.017))) * (1 - winK);
      galDrawPass(ik, p, galT, fade, roomK, aspect);
    }

    // The chrome that answers the film: ink from the moment the room opens
    // around the reader to the moment the crystal folds away.
    nav.classList.toggle(
      "nav--ink",
      p > B.inside[0] + 0.017 && p < B.collapse[0] + 0.0216
    );

    return teasing;
  }

  /* THE DOM BEAMS ARE GONE, and the note that stood here is why the
   * shader ones are the same beams. The room's beams used to stop dead at
   * the edge of the canvas, so v0.4.4 computed them again in JS and
   * published centre and angle to two full-viewport screen-blended
   * elements standing over the gallery. With the pieces inside the
   * canvas, the light reaches them inside the fragment instead (see
   * galDrawPass), from the same roomK sum, and the two biggest blended
   * layers on the page retire with their per-frame style writes. Screen
   * blending survives in the shader, and so does the rule that made it
   * safe: on the room's white it changes nothing, on a photographed piece
   * it flares, so the ink beats' measured contrast can only improve. */

  /* ------------------------------------------------------------- the loop */

  let queued = false;
  let lastFrame = 0;
  let healTick = 0;

  /* FRAME PACING, and it is the one economy on this page that costs the
   * picture nothing at all (v0.3.9).
   *
   * Until now the film drew a frame for every frame the display asked for,
   * which on a 60Hz panel is 60 of the most expensive frames on the site per
   * second and on a 144Hz panel is 144 of them. Nothing about this film is
   * better at 144: it is a scroll-driven camera move through a room, its
   * fastest motion is a stone turning, and the reader's own scroll is
   * smoothed through an exponential before it ever reaches a transform.
   * Ninety of those frames a second were being drawn, composited and thrown
   * away for a difference nobody has ever been able to see, and the machine
   * paid for every one of them in heat.
   *
   * It is a DEADLINE rather than a stride: draw when the last drawn frame is
   * at least this old, otherwise hand the slot back. 15.5ms is chosen so a
   * 60Hz display's own 16.67ms interval clears it every single time with a
   * millisecond to spare, which is the property that matters most here,
   * because a cap that occasionally rounds a real frame out of a 60Hz panel
   * turns the film into 30fps and is worse than no cap at all. Above 60 the
   * skipping is uniform, one gap length and no other, so there is no judder,
   * only fewer frames: 50Hz and 60Hz draw every callback, 120Hz and 240Hz
   * land on 60, 165Hz on 55, 144Hz on 48. The one panel this is unkind to is
   * 75Hz, which has no division between 75 and 37.5 and takes the lower one;
   * that is a deadline cap's own arithmetic rather than a choice, and no
   * value of this constant gives 75Hz its full rate without also handing
   * 144Hz seventy-two frames a second it has no use for.
   *
   * The frames that ARE skipped cost a callback and nothing else. No film
   * state is advanced in them, which is why the progress smoothing had to be
   * frame-rate independent to begin with and always was. */
  const FRAME_MS = 15.5;
  let due = 0;
  /* The display's own interval, learned rather than assumed, and only ever
   * used to tell the governor below what a GOOD frame looks like now that
   * the film is no longer trying to match the panel. It is the minimum
   * delta between callbacks, because a callback can be late and never
   * early. A spurious short reading cannot do any harm: the pace is the
   * cap rounded UP to a whole number of display frames, so it is bounded
   * below by the cap however wrong the estimate is. */
  let rafGap = 16.7;
  let lastRaf = 0;
  const pace = () => Math.ceil(FRAME_MS / rafGap) * rafGap;

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
    /* Slow and fast are read against the pace the film is ACTUALLY asking
     * for, not against a fixed 42 and 53 a second. Those two numbers were
     * right when the film drew every display frame and would be quietly
     * wrong now: on a 144Hz panel the cap lands the film on 48fps by
     * design, and a governor holding a flat 24ms ceiling would read its own
     * pacing as a machine in trouble, or, worse, never see a fast frame
     * again and leave a phone that started at 0.8 stuck there for ever. The
     * ratios are the old thresholds expressed against 16.7ms, so a 60Hz
     * display behaves exactly as it did. */
    const want = pace();
    if (dt * 1000 > want * 1.44) qSlow++;
    else if (dt * 1000 < want * 1.14) qFast++;
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
    rescale();
  }

  /* The drawing buffer, and the lens's target and the scratch frame with it,
   * are reallocated when this is called, which is why neither dial that
   * reaches it is allowed to hunt: the governor holds for a second and a
   * half, and the motion tier below needs three consecutive moving frames to
   * step down and gives the pixels back on the frame the film comes to rest.
   * A flick of a trackpad that is over inside three frames never pays for
   * one. */
  function rescale() {
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

    // The display's interval, and then the cap. A skipped slot advances
    // nothing and draws nothing; it only asks for the next one.
    const gap = t - lastRaf;
    lastRaf = t;
    if (gap > 0.5 && gap < rafGap) rafGap = Math.max(gap, 3.9);
    if (t < due) {
      wake();
      return;
    }
    due = t + FRAME_MS;

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

    /* EVERY RESIZE HAPPENS BEFORE THE DRAW, NEVER AFTER IT, and that one
     * ordering is the black-and-white flicker the reader reported inside the
     * stone (v0.4.0).
     *
     * Assigning to a canvas's width or height re-initialises its drawing
     * buffer, and a WebGL buffer is re-initialised to TRANSPARENT BLACK.
     * Three's setSize does that assignment unconditionally, so every call to
     * rescale() wipes whatever is on screen. Both dials that reach it used to
     * be read at the END of the frame, after the film had been drawn: the
     * finished picture was thrown away a line after it was made, and the
     * canvas then stood empty until the NEXT frame drew into it, which the
     * 60fps cap is free to hold back by up to a display interval or two.
     *
     * In the dark room an empty canvas is a black frame over black silk and
     * nobody could ever have seen it. Inside the diamond the room is white,
     * so the same empty frame is a hard black flash across the whole screen,
     * and the motion tier fires one at the start of every scroll and another
     * at the end of it. A reader working down that chapter in short pushes,
     * which is how anybody reads, gets two flashes per push.
     *
     * Decided here, the resize lands on an empty frame and filmAt fills it in
     * the same callback, so no wiped buffer is ever presented. Nothing else
     * moves: the thresholds, the three-frame run and the governor's own hold
     * are exactly as they were. */
    const settling = pDrawn !== pTarget;
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
    const introLive = !held && introT0 && introK < 1;
    // Inside the diamond the constellation sways and the room turns on the
    // clock, so the chapter idles the way the coda does; its window is the
    // gallery's own, and ?p= and reduced motion still it with the rest.
    const roomLive =
      !held &&
      !reduceMotion.matches &&
      pDrawn > B.inside[0] &&
      pDrawn < B.collapse[0] + 0.0185;
    /* The tease is the one live state that cannot be known before the film is
     * evaluated, and it is also the one that never belongs here: it plays at
     * a PARKED progress, so it can neither move the motion tier (which asks
     * whether the reader's own hand is moving) nor tell the governor anything
     * about sustained load. Everything else is arithmetic on pDrawn. */
    const clocked = settling || soloLive || codaLive || introLive || roomLive;

    /* The motion tier. `pDrawn !== before` is the reader's own hand and
     * nothing else: the tease breathing on the lid, the lifted stone's idle
     * turn and the coda's are all live frames at a parked progress, and
     * those are exactly the frames somebody is sitting still and looking at,
     * so they keep every pixel. */
    const wasMoving = moving;
    if (!qForced && clocked && pDrawn !== before) {
      if (++moveRun >= 3) moving = true;
    } else {
      moveRun = 0;
      moving = false;
    }
    if (moving !== wasMoving) rescale();
    govern(t, dt, clocked);

    const teasing = filmAt(pDrawn, t, dt);
    driveBeats(pDrawn, introK);

    if (!canvas.classList.contains("is-ready")) {
      canvas.classList.add("is-ready");
      if (!loaderDone) finishLoader(t);
    }

    /* One more frame while the picture is still cheap, so the frame the
     * reader stops on is the sharp one: the next callback finds pDrawn
     * unmoved, steps the tier back up, resizes, and draws full resolution
     * into the buffer it has just made. That is also why `moving` is a wake
     * condition in its own right rather than a special case of the frame the
     * film comes to rest on. */
    if (clocked || teasing || moving) wake();
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
    if (pTarget >= 0.34) armGallery();
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
    if (heldP >= 0.34) armGallery();
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
    0.147, // the lamp: a second shadow-caster joins the scene
    0.209, // the ring lit and rising
    0.24, // the ring high and lit, the box on its way out
    0.325, // the box gone, the stone rising out of the claws
    0.386, // the stone out of the claws, the ring leaving
    0.448, // the stone alone
    0.5065, // the press: the scene into the render target, the composite compiles
    0.55, // the crystal room, the constellation's pass compiles over it
    0.72, // the stream mid-chapter, same programs at a second formation
    0.86, // the room folding, the wall lit
    0.93, // the coda: the stone relit against black
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
    if (at >= 0.34) armGallery();
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
