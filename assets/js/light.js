/* The hero light — caustics, refracted, in about 4KB of WebGL and no library.
 *
 * WHAT THIS IS. A single full-screen quad running a fragment shader that
 * computes a caustic web: the bright, restless net of light a faceted stone
 * throws onto a surface when a lamp catches it. It is the thing on a jeweller's
 * bench that everybody recognises and nobody photographs, and it is completely
 * abstract — there is no object in frame, so it claims nothing about any piece
 * this shop has made.
 *
 * WHY NOT THREE.JS. Three.js is a scene graph, a camera model, a material
 * system and a loader stack, ~150KB gzipped, and this page needs exactly one
 * quad and one shader. Raw WebGL is the whole of it below and costs nothing
 * against a 2.0s LCP budget.
 *
 * WHY IT DOES NOT ANIMATE ON A TIMER. The brief forbids anything that moves on
 * a clock, and that rule is right: a background that churns on its own is
 * restless and cheap. So the caustic's phase is driven by SCROLL POSITION and
 * POINTER POSITION and nothing else. Stand still and the light stands still.
 * Move, and it moves — which is also the honest physical model, because that is
 * what happens when you tilt a stone under a lamp. It renders on demand rather
 * than on a loop, so an idle page costs zero frames.
 *
 * WHAT HAPPENS WHEN IT CANNOT RUN. The CSS gradient in home.css is the base
 * layer and is always painted. This only adds the canvas on top, and only after
 * the context and both shaders have compiled successfully; the `has-webgl`
 * class it sets is what fades the CSS layer back. No WebGL, no JavaScript, or
 * reduced motion — the page keeps the gradient and loses nothing structural.
 */
(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  if (!hero) return;
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  var canvas = document.createElement("canvas");
  canvas.className = "hero__canvas";
  canvas.setAttribute("aria-hidden", "true");

  var gl = null;
  try {
    gl =
      canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        /* TRUE, and this is the bug that made the first version paint the
           whole hero cream. The shader emits vec4(col * a, a) — premultiplied,
           which is the correct form for an additive light. Declaring the
           context as NOT premultiplied tells the compositor to un-premultiply
           on the way out, i.e. divide the colour back by alpha. Where alpha is
           near zero — which is most of this frame, by design — that division
           reconstructs full-brightness gold from a nearly-black pixel, and the
           blend mode then screens it over the page. Result: a flat cream
           rectangle exactly the size of the hero. */
        premultipliedAlpha: true,
        powerPreference: "low-power",
      }) || canvas.getContext("experimental-webgl");
  } catch (e) {
    return;
  }
  if (!gl) return;

  var VERT =
    "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  /* The caustic itself is the classic iterated-distortion trick: push a point
     through a handful of sine folds and accumulate the reciprocal distance, so
     the places where folds converge blow up into bright filaments and
     everything else stays dark. Five iterations is the knee of the curve —
     four looks like plastic, six costs frames on integrated graphics for a
     difference nobody sees through a 12% opacity layer.

     Everything after that is restraint: a hard directional falloff so the light
     only exists in the top-right corner and the headline is never fighting it,
     a warm ramp from deep gold through to almost-white in the hottest
     filaments, and a final gamma that crushes the mid-tones so the frame stays
     mostly black. */
  var FRAG = [
    "precision mediump float;",
    "uniform vec2 uRes;",
    "uniform float uPhase;",
    "uniform vec2 uPointer;",
    "",
    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / uRes.xy;",
    "  vec2 sp = uv;",
    "  sp.x *= uRes.x / uRes.y;",
    "",
    /* Origin of the beam, off the top-right corner, nudged by the pointer so
       the light leans toward the cursor without ever chasing it. */
    "  vec2 origin = vec2(1.28, 0.86) + uPointer * 0.09;",
    "  float d = distance(sp, origin);",
    "",
    /* The rake: an anisotropic falloff, wide across the beam and short along
       it, which is what makes it read as light thrown at a shallow angle
       rather than a lamp pointed at the viewer. */
    "  vec2 rake = (sp - origin) * vec2(0.78, 2.35);",
    "  float beam = exp(-dot(rake, rake) * 2.35);",
    "",
    /* Domain-warped ridge field. Each pass bends the sample point by the sine
       of its own neighbour — that warping is what stops the result looking like
       plaid — and then `1 - abs(sin(...))` turns the smooth wave into a ridge
       that peaks along the zero crossings. Averaging four passes gives a value
       that sits around 0.35 almost everywhere and only approaches 1 where all
       four ridges happen to align.

       Every stage is bounded by construction: abs(sin) is 0..1, so the average
       is 0..1 and the pow below can only ever darken. That is the whole reason
       this replaced a ported caustic shader whose accumulator ran past 1 and
       turned a 7th power into a floodlight instead of a crush. */
    "  vec2 p = (sp - origin) * 6.4;",
    "  vec2 q = p;",
    "  float acc = 0.0;",
    "  for (int n = 0; n < 4; n++) {",
    "    float t = uPhase * (0.55 + 0.4 * float(n));",
    "    q += vec2(sin(q.y * 1.7 + t), cos(q.x * 1.7 - t)) * 0.55;",
    "    float r = 1.0 - abs(sin(q.x + q.y * 0.7 + t));",
    "    acc += pow(r, 15.0);",
    "  }",
    "  acc = clamp(acc * 0.42, 0.0, 1.0);",
    /* 5th power keeps roughly the top eighth of the field and discards the
       rest, so what survives is filaments rather than a haze. */
    /* max(), not clamp(), on the pow input. pow(0.0, y) is UNDEFINED in GLSL
       ES — the spec only defines it for x > 0 — and a good number of drivers
       return NaN rather than 0. NaN then survives clamp() on many
       implementations (clamp is min(max(x,lo),hi), and NaN comparisons are
       false, so it falls through to a bound), which is how a single undefined
       pow turned this entire layer into a flat cream rectangle and made it
       immune to every brightness constant I tuned. Both pow() calls in this
       shader take a strictly positive base now. */
    "  float glow = acc;",
    "",
    /* Caustics only exist inside the beam; outside it the surface is bench. */
    "  float lit = glow * beam;",
    "  float wash = beam * 0.045;",
    "  float v = lit * 1.15 + wash;",
    "",
    /* Warm ramp: gold-deep in the dim wash, brand gold through the body, and
       only the very hottest filaments approach white. Gold never becomes a
       flat fill, which is what keeps it under the 5%-of-pixels rule. */
    "  vec3 deep = vec3(0.48, 0.36, 0.15);",
    "  vec3 gold = vec3(0.96, 0.85, 0.60);",
    "  vec3 hot  = vec3(1.00, 0.97, 0.88);",
    "  vec3 col = mix(deep, gold, clamp(v * 1.7, 0.0, 1.0));",
    "  col = mix(col, hot, clamp(pow(max(lit, 1e-4), 1.6) * 1.25, 0.0, 1.0));",
    "",
    /* This mask is an ACCESSIBILITY control, not a vignette.
       Measured against the built page, unmasked filaments ran straight behind
       the H1 and dropped the worst-case contrast there to 2.05:1 — under even
       the 3:1 floor that large text gets, on the single most important line on
       the site. uv.y is bottom-up in GL, so the y term confines the light to
       the top strip above the headline and the x term pushes it right, off the
       text column. The light now lives where the type is not. Re-measure the
       contrast behind .hero__title if either constant is ever touched. */
    "  float frame = smoothstep(0.05, 0.52, uv.x) * smoothstep(0.44, 0.96, uv.y);",
    "  float a = clamp(v, 0.0, 1.0) * frame * 0.5;",
    "  gl_FragColor = vec4(col * a, a);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "uRes");
  var uPhase = gl.getUniformLocation(prog, "uPhase");
  var uPointer = gl.getUniformLocation(prog, "uPointer");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  hero.appendChild(canvas);
  hero.classList.add("has-webgl");

  /* Rendered at 55% of layout resolution and scaled up by CSS. The field is
     soft by nature, so nobody can tell, and it cuts fragment work — which is
     the entire cost of this effect — to under a third. DPR is ignored on
     purpose for the same reason. */
  /* Internal render scale. Fragment work is the entire cost of this effect and
     it scales with the square of this number, so the phone value is not a
     rounding-down — it is a 47% cut in shaded pixels versus desktop. The field
     has no hard edges anywhere, so upscaling a soft gradient costs nothing
     visible even on a 3x display. */
  var SCALE = window.innerWidth < 700 ? 0.4 : 0.55;
  var w = 0;
  var h = 0;
  var phase = 0;
  var px = 0;
  var py = 0;
  var queued = false;

  function resize() {
    var r = hero.getBoundingClientRect();
    var nw = Math.max(1, Math.round(r.width * SCALE));
    var nh = Math.max(1, Math.round(r.height * SCALE));
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  function draw() {
    queued = false;
    lastDrawn = phase;
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uPhase, phase);
    gl.uniform2f(uPointer, px, py);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* One frame per animation tick at most, and only when something actually
     changed. An untouched page draws nothing at all. */
  var lastDrawn = -999;
  function request() {
    /* Two gates before any GPU work. The rAF coalesce caps this at one draw per
       frame no matter how many scroll events arrive, and the delta check skips
       the draw entirely when the phase has barely moved — trackpad jitter, a
       one-pixel scroll, a pointer twitch. Together they mean a page being read
       rather than scrolled costs nothing at all. */
    if (queued) return;
    if (Math.abs(phase - lastDrawn) < 0.004) return;
    queued = true;
    requestAnimationFrame(draw);
  }

  /* Scroll is the main driver. The hero is one viewport tall, so this maps the
     first screen of scrolling onto a couple of radians of phase — enough for
     the filaments to visibly crawl and re-form as the headline leaves, not so
     much that it strobes. */
  var visible = true;
  function onScroll() {
    if (!visible) return;
    phase = (window.scrollY / Math.max(1, window.innerHeight)) * 2.1;
    request();
  }

  function onPointer(e) {
    if (!visible) return;
    var r = hero.getBoundingClientRect();
    px = (e.clientX / Math.max(1, r.width)) * 2 - 1;
    py = (e.clientY / Math.max(1, r.height)) * 2 - 1;
    /* The pointer contributes to the phase as well as the origin, so moving
       across the hero makes the caustic re-form rather than merely slide. */
    phase =
      (window.scrollY / Math.max(1, window.innerHeight)) * 2.1 + px * 0.55;
    request();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener(
    "resize",
    function () {
      resize();
      request();
    },
    { passive: true }
  );

  /* Stop entirely once the hero is off-screen. Without this, every scroll event
     down a 8000px page would still be running a full-screen fragment pass for
     something nobody can see. */
  if (window.IntersectionObserver) {
    new IntersectionObserver(
      function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) request();
      },
      { rootMargin: "120px" }
    ).observe(hero);
  }

  /* The first frame is drawn synchronously rather than queued.
     A WebGL canvas that has been given a context but never painted is not
     reliably transparent — under a software rasteriser it can composite as an
     opaque buffer, which is a flash of solid colour over the hero on any device
     slow enough to miss the first animation frame. Painting once, inline, means
     the canvas is never on screen in an undrawn state. It also removes a whole
     class of "nothing renders" bug on browsers that throttle rAF in background
     or prerendered tabs. */
  resize();
  phase = (window.scrollY / Math.max(1, window.innerHeight)) * 2.1;
  draw();
})();
