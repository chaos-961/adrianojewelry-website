/* Adriano Jewelry: the ground.
 *
 * Every page on this site now stands on black silk rather than on a flat
 * colour, and this file is the whole of it: one fragment shader painted ONCE
 * into a plain 2D canvas, after which the WebGL context is deliberately thrown
 * away. There is no animation loop, no scroll listener, no live GL context to
 * lose or restore, and nothing running from here on. The cost is one draw at
 * load and a texture upload; after that it is a picture.
 *
 * WHY IT IS FIXED TO THE VIEWPORT AND NOT TO THE DOCUMENT. The obvious version
 * spans the whole document and scrolls with it like a photograph you pan
 * across, and on a two-screen policy page that is the nicer thing. It is not
 * available here: index.html is a 1700vh scroll track, so a document-spanning
 * texture on the landing page would be seventeen screens tall, which the pixel
 * budget below would then have to answer by rendering it at roughly a quarter
 * scale and stretching it back up. Pinned to the viewport it is rendered at
 * the panel's own density, 1:1 DEVICE pixels wherever the budget in paint()
 * allows, which is also what lets the pile be baked into the shader instead
 * of composited over it.
 *
 * WHY THE PILE IS IN THE SHADER. The source this is taken from carries its
 * fine pile as a second DOM layer, an SVG turbulence tile at mix-blend-mode:
 * soft-light. That is the right call for a layer that scrolls with the
 * document and is rasterised once, and the wrong one here: a FIXED blended
 * layer has to be re-composited against the moving page on every scroll frame,
 * and this site has already paid for that lesson once (see the note on the
 * scroll cue's infinite animation in CLAUDE.md). Baked into the fragment it is
 * free, it lands at true 1:1, and the page is left with exactly one extra
 * layer instead of two.
 *
 * WHAT THIS COSTS, MEASURED, AND IT IS NOT WHAT ANY OF US GUESSED. On a
 * GeForce 930MX at 1265x720 the whole of paint() is 295ms warm and about
 * 1420ms the first time a device ever sees it. Split by phase, through the
 * three numbers this leaves on window.__velvet:
 *
 *     getContext                55ms
 *     compile + link           233ms
 *     drawArrays, with finish    1ms
 *     readback and 2D upload     6ms
 *
 * The DRAW IS ONE MILLISECOND. Thirty-seven simplex noise evaluations per
 * fragment over 910,000 fragments, and it does not register; the bill is
 * almost entirely the driver translating and compiling a shader with all of
 * that inlined, which ANGLE does at link. Two things follow, and the first one
 * was tried and reverted before it was believed: rendering the weave small and
 * laying the pile over it at 1:1, a two-pass split that should have quartered
 * the fragment count, moved the total by nothing at all and cost a second
 * program to compile. Resolution is free here. What is NOT free is the one-off
 * compile, and the only thing to do about that is to keep it off the critical
 * path, which is what schedule() below is for.
 *
 * THE ONE KNOB is opacity, set in CSS and driven per frame by home.js on the
 * landing page. The silk sits over --ink, so lowering its opacity walks the
 * whole texture back toward the near-black it is painted on without touching
 * its shape. That is what dims it behind the film, and what takes it to
 * nothing inside the diamond, where the ground is white and belongs to the
 * crystal room alone.
 *
 * No hue: the shader returns a single luminance in all three channels, so the
 * ground obeys the same rule as every token in site.css.
 */

(function () {
  "use strict";

  var host = document.getElementById("velvet");
  if (!host) return;

  var coarse = matchMedia("(pointer: coarse)").matches;

  var VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 uTex;", // the texture's own size, in texels
    "uniform vec2 uDoc;", // the viewport, in CSS px
    "uniform float uRef;", // feature scale reference

    /* Ashima's simplex noise, unchanged. */
    "vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }",
    "vec2 mod289(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }",
    "vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }",
    "float snoise(vec2 v){",
    "  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);",
    "  vec2 i  = floor(v + dot(v, C.yy));",
    "  vec2 x0 = v - i + dot(i, C.xx);",
    "  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);",
    "  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;",
    "  i = mod289(i);",
    "  vec3 p = permute( permute( i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));",
    "  vec3 m = max(0.5 - vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)), 0.0);",
    "  m = m*m; m = m*m;",
    "  vec3 x = 2.0*fract(p * C.www) - 1.0;",
    "  vec3 h = abs(x) - 0.5;",
    "  vec3 ox = floor(x + 0.5);",
    "  vec3 a0 = x - ox;",
    "  m *= 1.79284291400159 - 0.85373472095314*(a0*a0 + h*h);",
    "  vec3 g;",
    "  g.x  = a0.x  * x0.x  + h.x  * x0.y;",
    "  g.yz = a0.yz * x12.xz + h.yz * x12.yw;",
    "  return 130.0 * dot(m, g);",
    "}",

    /* Three octaves is the whole noise budget. Anything finer is wasted here:
     * the field is smooth by construction and the pile below carries every
     * frequency above a pixel. */
    "float fbmLow(vec2 p){",
    "  float s = 0.0;",
    "  s += 0.500*snoise(p);",
    "  s += 0.250*snoise(p*2.03 + vec2(17.31,9.07));",
    "  s += 0.125*snoise(p*4.11 + vec2(41.70,3.90));",
    "  return s/0.875;",
    "}",
    "float fbm2(vec2 p){",
    "  return (0.5*snoise(p) + 0.25*snoise(p*2.03 + vec2(17.31,9.07))) / 0.75;",
    "}",

    /* Sin-free hash (Hoskins), the same one the crystal room uses: two of
     * these per fragment for the pile and the dither, and a sin() would be a
     * transcendental per pixel for something a multiply chain answers. */
    "float hash12(vec2 p){",
    "  vec3 q3 = fract(vec3(p.xyx) * 0.1031);",
    "  q3 += dot(q3, q3.yzx + 33.33);",
    "  return fract((q3.x + q3.y) * q3.z);",
    "}",

    /* ---------------- the weave ----------------
     * A fixed weave axis with a heavy along-axis squash: 4.2:1 elongation with
     * an exactly linear Jacobian, so the sweeps stay the same width wherever
     * they are on screen. A rotating sample frame instead makes the streaks
     * shrink toward one corner, which reads as a lens rather than as cloth.
     * The only warp is a bounded low-frequency bend, so the cross-flow
     * frequency is multiplied by at most 1.10 anywhere. */
    "float bend(vec2 s){",
    "  return 0.54 * fbm2(s * 0.24 + vec2(1.7, 5.3))",
    "       + 0.15 * fbm2(s * 0.67 + vec2(-4.2, 2.9));",
    "}",
    "float height(vec2 s, float bnd, float amp){",
    "  vec2 c = vec2(s.x * 0.24, s.y + bnd);", // 4.2:1 stretch along the flow
    "  return fbmLow(c) * 0.62", // the main silk streaks
    "       + fbm2(c * 1.95 + vec2(8.3, -3.1)) * 0.26 * amp", // finer combing
    "       + fbm2(s * 0.31 + vec2(-6.0, 3.4)) * 0.30;", // broad isotropic body
    "}",

    "float velvet(vec2 p, vec2 uvd){",
    "  mat2 R = mat2(0.978, -0.208, 0.208, 0.978);", // fixed 12 degree weave axis
    "  vec2 s = R * (p * 1.15);",
    "  float amp = 0.60 + 0.40 * (fbm2(s * 0.19 + vec2(6.4, -2.2)) * 0.5 + 0.5);",

    /* The surface normal by finite difference, and the flow tangent as the
     * level set of the bent axis. Six of the shader's thirty-seven noise
     * evaluations are the field itself and the other thirty-one are these two
     * derivatives, which is worth knowing and, per the note at the head of
     * this file, worth nothing: the draw is a millisecond either way. */
    "  float e  = 0.05;",
    "  float b0 = bend(s);",
    "  float bx = bend(s + vec2(e, 0.0));",
    "  float by = bend(s + vec2(0.0, e));",
    "  float h0 = height(s,                b0, amp);",
    "  float hx = height(s + vec2(e, 0.0), bx, amp);",
    "  float hy = height(s + vec2(0.0, e), by, amp);",
    "  float bump = 0.34;",
    "  vec2  gr2  = vec2(hx - h0, hy - h0) / e;",
    "  vec3  N    = normalize(vec3(-gr2 * bump, 1.0));",
    "  float bgx = (bx - b0) / e;",
    "  float bgy = (by - b0) / e;",
    "  vec2  d   = normalize(vec2(1.0, -bgx / max(0.35, 1.0 + bgy)));",
    "  vec3  T   = normalize(vec3(d, dot(gr2, d) * bump));",

    "  vec3 L  = normalize(vec3(-0.62, 0.46, 0.64));", // upper left, grazing
    "  vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));",
    "  float ndl  = dot(N, L);",
    "  float diff = max(0.0, (ndl + 0.52) / 1.52); diff *= diff;", // wrapped, soft to zero
    "  float rim  = pow(max(0.0, 1.0 - ndl * ndl), 4.0);", // the wide velvet sheen
    "  float spc  = pow(max(0.0, dot(N, Hv)), 10.0);", // no gloss, a broad lobe

    /* Kajiya-Kay fibre lobe: the weave brightens where it runs ACROSS the
     * light, which is the whole difference between silk and plastic. */
    "  float tl = dot(T, L);",
    "  float tv = T.z;",
    "  float kk = sqrt(max(0.0, 1.0 - tl * tl)) * sqrt(max(0.0, 1.0 - tv * tv)) - tl * tv;",
    "  float ani = pow(max(0.0, kk), 10.0);",
    "  float nap = fbm2(s * 3.0 + vec2(7.0, 2.0)) * 0.5 + 0.5;",

    "  float lum = 0.005",
    "            + 0.35 * diff * (0.87 + 0.13 * nap)",
    "            + 0.26 * rim  * diff",
    "            + 0.15 * ani  * diff",
    "            + 0.30 * spc  * diff;",

    /* A flag on all four walls so the frame's edges stay quiet, and a gentle
     * pool toward the top: light comes from above in every room worth being
     * in. Both are in viewport coordinates, which is what a pinned ground
     * wants. */
    "  float ve = smoothstep(0.0, 0.09, uvd.x) * (1.0 - smoothstep(0.91, 1.0, uvd.x));",
    "  ve *= smoothstep(0.0, 0.030, uvd.y) * (1.0 - smoothstep(0.972, 1.0, uvd.y));",
    "  lum *= mix(0.70, 1.0, ve);",
    "  lum *= 1.03 - 0.14 * smoothstep(0.05, 0.92, uvd.y);",

    "  lum = pow(max(lum, 0.0), 2.15);",
    "  lum = 1.0 - exp(-lum * 3.3);",

    /* The tone curve. Four mixes rather than a pow: it holds the black end
     * flat for a long time and then opens hard through the sheen, which is
     * what stops black cloth reading as dark grey cloth. */
    "  float gr = mix(0.016, 0.068, smoothstep(0.00, 0.15, lum));",
    "  gr = mix(gr, 0.195, smoothstep(0.13, 0.44, lum));",
    "  gr = mix(gr, 0.600, smoothstep(0.42, 0.86, lum));",
    "  gr = mix(gr, 0.930, smoothstep(0.74, 0.95, lum));",
    "  return gr;",
    "}",

    "void main(){",
    // gl_FragCoord is y-up and the page is y-down.
    "  vec2 dpx = vec2(gl_FragCoord.x, uTex.y - gl_FragCoord.y) / uTex * uDoc;",
    "  vec2 uvd = dpx / uDoc;",
    "  vec2 p   = dpx / uRef * 3.0;",
    "  float g = velvet(p, uvd);",

    /* THE PILE. Soft-light against a mid-grey noise, worked out rather than
     * composited: soft-light with a source either side of 0.5 moves the
     * backdrop toward white or black by an amount that vanishes at BOTH ends
     * of the ramp, so the pile shows on the sheen and never lifts the black
     * off the floor. That last property is the reason it is worth doing
     * properly instead of just adding noise: added noise turns a black ground
     * grey, and this ground's blacks are most of it.
     *
     * n is white noise at one texel, and the texture is at 1:1 DEVICE pixels
     * wherever the budget below allows, so this is a real tooth rather than a
     * blur. Rendering it any smaller is what a half-scale test looked like:
     * coarse, blotchy sheen, and a dense phone panel fed CSS-sized texels
     * was getting exactly that, which is why paint() sizes the texture to
     * device pixels rather than CSS ones. */
    "  float n = hash12(gl_FragCoord.xy) - 0.5;",
    "  g += 0.34 * n * g * (1.0 - g) * 2.0;",

    /* 8-bit dither on top. Large soft dark gradients band badly without it,
     * and this ground is nothing but a large soft dark gradient. */
    "  float d = hash12(gl_FragCoord.yx + 7.31);",
    "  g += (d - 0.5) * (2.0/255.0);",
    "  gl_FragColor = vec4(vec3(clamp(g, 0.0, 1.0)), 1.0);",
    "}",
  ].join("\n");

  var out = null;
  var lastKey = "";

  function paint() {
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (vw < 2 || vh < 2) return; // collapsed; the resize below retries

    /* The panel's own density, wherever the budget allows. This painted at
     * 1:1 CSS pixels until the reader reported the phone soft against the
     * desktop, and a phone is exactly where a CSS pixel is not a pixel: at
     * dpr 3 the pile's one-texel tooth was being stretched over nine device
     * pixels, which is the "coarse, blotchy sheen" the half-scale test in
     * the note above produced, shipped to every dense screen while a dpr-1
     * desktop got the real thing. Capped at 3 for the same reason the film
     * caps there: past three device pixels per CSS pixel there is nothing
     * left for an eye to collect and cost still rises with the square.
     *
     * The budgets stay memory and upload caps rather than render ones (the
     * draw is a millisecond at any of these sizes; see the head of this
     * file). Coarse covers the largest phone at dpr 3 (430x932 is 3.6M);
     * fine covers a dpr-2 laptop (1512x982 is 5.9M). Past either, s shares
     * the shortfall evenly rather than letting one axis go soft. */
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var budget = coarse ? 3800000 : 6500000;
    var s = Math.min(1, Math.sqrt(budget / (vw * vh * dpr * dpr)));
    var texW = Math.max(2, Math.round(vw * dpr * s));
    var texH = Math.max(2, Math.round(vh * dpr * s));

    var key = texW + "x" + texH;
    if (key === lastKey) return true;
    var t0 = performance.now();

    /* Feature size blends viewport-relative with absolute. Purely relative
     * makes the weave microscopic on a phone; purely absolute crops it to a
     * featureless patch. */
    var ref = Math.sqrt(Math.min(vw, vh) * 900);

    var src = document.createElement("canvas");
    src.width = texW;
    src.height = texH;

    var gl;
    try {
      gl =
        src.getContext("webgl", {
          antialias: false,
          alpha: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: true,
          /* This is a background painted once. Asking a laptop to wake its
           * discrete GPU for one frame, and on the landing page to do it
           * alongside the film's own high-performance context, is the wrong
           * request to make. */
          powerPreference: "low-power",
        }) || src.getContext("experimental-webgl", { preserveDrawingBuffer: true });
    } catch (err) {
      gl = null;
    }
    if (!gl) return false;

    /* mediump would band this ramp into stripes; a device that cannot offer
     * highp in a fragment shader gets the painted fallback instead. */
    var hp =
      gl.getShaderPrecisionFormat &&
      gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (hp && hp.precision < 23) return false;
    var tCtx = Math.round(performance.now() - t0);

    function sh(type, code) {
      var o = gl.createShader(type);
      gl.shaderSource(o, code);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
        console.warn("velvet: " + gl.getShaderInfoLog(o));
        return null;
      }
      return o;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT);
    var fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    var pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.bindAttribLocation(pr, 0, "a");
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      console.warn("velvet: " + gl.getProgramInfoLog(pr));
      return false;
    }
    gl.useProgram(pr);
    var tLink = Math.round(performance.now() - t0);

    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(gl.getUniformLocation(pr, "uTex"), texW, texH);
    gl.uniform2f(gl.getUniformLocation(pr, "uDoc"), vw, vh);
    gl.uniform1f(gl.getUniformLocation(pr, "uRef"), ref);

    gl.viewport(0, 0, texW, texH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* A real barrier, so the number below is the GPU's own and not the
     * driver's opinion of when it queued the work. This is the call that
     * proved the fragment count is not what this costs. */
    gl.finish();
    var tDraw = Math.round(performance.now() - t0);

    /* Hand the pixels to a plain 2D canvas and drop the GL context entirely.
     * The landing page wants its WebGL2 context for the film and there is no
     * reason for this one to go on existing: no drawing buffer to hold, no
     * context to lose or restore, nothing to schedule. */
    if (!out) {
      out = document.createElement("canvas");
      host.appendChild(out);
    }
    out.width = texW;
    out.height = texH;
    out.getContext("2d").drawImage(src, 0, 0);

    var lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();

    lastKey = key;
    /* Exposed for the throwaway probes described in CLAUDE.md. The canvas is
     * the only way to measure what the ground actually puts under a paragraph,
     * and the contrast floors in site.css are measured off it; the four
     * timings are what corrected the guess recorded at the head of this file,
     * and are cumulative from the top of paint(). */
    window.__velvet = {
      ms: Math.round(performance.now() - t0),
      msCtx: tCtx,
      msLink: tLink,
      msDraw: tDraw,
      canvas: out,
    };
    requestAnimationFrame(function () {
      out.classList.add("is-on");
    });
    return true;
  }

  function boot() {
    if (paint() === false) host.classList.add("is-painted-flat");
  }

  /* AFTER load, AND THEN OUT OF THE WAY. The first visit to the site on a
   * given device pays for the driver to translate and compile the weave, which
   * measured at about 1.4 seconds on a GeForce 930MX against 295ms warm, and
   * the copy at the end of paint() is a synchronous barrier, so wherever that
   * work lands it lands on the main thread. The landing page is the one that
   * cannot afford it: home.js spends the loader playing the film once at
   * eleven progresses to warm its own programs, and a second of GPU compile
   * dropped into the middle of that stalls the bar the reader is watching.
   *
   * An idle callback puts it after that work rather than into it, and the
   * timeout is the promise that it happens anyway on a page that never goes
   * idle. Nothing waits on it: the ground is --paper until it arrives and the
   * canvas fades up when it does. */
  function schedule() {
    if (window.requestIdleCallback) requestIdleCallback(boot, { timeout: 2500 });
    else setTimeout(boot, 120);
  }

  if (document.readyState === "complete") schedule();
  else addEventListener("load", schedule, { once: true });

  /* The only thing that can invalidate the texture is a real change of the
   * viewport's shape. Debounced hard, and a no-op if the size it would render
   * has not actually changed, so a phone's address bar sliding away costs
   * nothing. */
  var t = 0;
  addEventListener(
    "resize",
    function () {
      clearTimeout(t);
      t = setTimeout(paint, 450);
    },
    { passive: true }
  );
})();
