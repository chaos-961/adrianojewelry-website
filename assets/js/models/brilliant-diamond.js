/* Adriano Jewelry — the round brilliant.
 *
 * The stone the four-claw solitaire was cut for, and now the stone standing
 * in it. Fifty-eight facets in the arrangement a bench actually cuts: a table
 * octagon, eight bezel kites with eight star triangles between them, sixteen
 * upper girdle halves down to the girdle, then sixteen lower halves, eight
 * pavilion mains and a culet under it. Nothing is approximated with a cone.
 *
 * Every one of those facets is *solved*, not placed. Two planes do the whole
 * cut — one crown plane taken from the table edge to the girdle, one pavilion
 * plane from the girdle to the culet — and every vertex that is meant to lie
 * on a facet is evaluated on that plane rather than guessed, so each facet
 * comes out dead flat and its neighbours meet on a real edge. That is the
 * only reason the thing reads as cut glass instead of a faceted ball: light
 * has to break at an edge, and an edge is only an edge if the two planes
 * either side of it are exactly planes.
 *
 * The proportions in BRILLIANT are the ideal cut, and they are also the
 * numbers solitaire-ring.js already dimensioned its head around — it imports
 * them from here so the stone and the setting can never drift apart. Held
 * against GIA's grading ranges the cut is Excellent: 55% table, 34.7° crown,
 * 40.6° pavilion, 61.8% total depth, thin girdle.
 *
 *   createBrilliantDiamond({ renderer, diameter, standing }) -> {
 *     root,        a Group with the centre of the girdle at its origin
 *     metrics,     the stone's measurements, for whatever sets it
 *     update(),    light, turn, and the flash the turn throws
 *     framing(),   { cy, cr } bounding sphere for camera fit
 *   }
 *
 * WHY IT IS NOT A GLASS MATERIAL. A physically-transmissive material refracts
 * whatever is actually behind it, and what is behind this stone is the inside
 * of a black box in a dark room — so a "correct" diamond here would render
 * black. Real stones are not photographed in the room they are sold in; they
 * are photographed in a lit tent, and this one carries its own (the same
 * trick, and the same reason, as the ring's polished metal).
 *
 * So the light in it is drawn in two passes over one geometry, which is how
 * the trade's own renderers do it:
 *
 *   the back pass  — the far facets, seen through the stone, each mirroring
 *                    the tent. This is the bright inner structure, the pattern
 *                    that swims as the stone turns.
 *   the front pass — added over it: the near facets' own reflection, weighted
 *                    by Fresnel (a diamond bounces 17% of the light straight
 *                    off its face before anything else happens, which is most
 *                    of why it is so bright), plus what refracts through,
 *                    sampled three times at three slightly different bends so
 *                    red, green and blue come apart. That split is dispersion,
 *                    and dispersion is what the trade calls fire.
 *
 * The tent itself is painted here: hard-edged panels, because a soft gradient
 * reflects as a wash and the stone turns to chalk — it is the hard line
 * between a lit panel and the black beside it, raked across a facet, that the
 * eye reads as a flash. A handful of small pure-white specks in it are pushed
 * far past white in the shader, and those are the sparkles.
 *
 * Last, the flare: when a facet lines up to mirror one of the tent's lights
 * straight down the camera, a four-point star is drawn over the stone. That
 * is a lens artefact, not a property of diamond — but it is in every
 * photograph of one, including the reference this was built from, and it is
 * the difference between a bright stone and a stone that catches your eye.
 */

import * as THREE from "../vendor/three.module.min.js";

/* The cut. Fractions of the girdle RADIUS, so a stone of any size is the
 * same stone. solitaire-ring.js imports this — do not restate these numbers
 * anywhere else.
 *
 * crown and pavilion are measured from the middle of the girdle, which is
 * the plane a setting bears the stone on and therefore the only plane worth
 * measuring from. In the trade's own percentages (of the DIAMETER): table
 * 55%, crown height 16.2%, pavilion depth 43%, girdle 1.2%, total depth
 * 61.8% — an ideal round brilliant. */
export const BRILLIANT = {
  table: 0.55, // table octagon, centre to corner
  crown: 0.324, // girdle plane up to the table
  pavilion: 0.86, // girdle plane down to the culet
  girdle: 0.024, // the girdle band's full thickness
  star: 0.55, // star facet length, table edge to girdle
  half: 0.77, // lower girdle half length, girdle to culet
  culet: 0.012, // the culet facet's own radius
};

const R22 = Math.PI / 8; // the cut's whole symmetry: 22.5 degrees
const COS22 = Math.cos(R22);

/* ---------------------------------------------------------------- geometry */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/* The stone, at a girdle radius of 1. Returns the geometry and the list of
 * facet normals — the normals are wanted later for the flare, which has to
 * ask every facet whether it is currently mirroring a light at the camera. */
function buildBrilliant() {
  const P = BRILLIANT;
  const gh = P.girdle / 2;

  /* The two planes the whole cut is read off. Each is written in u — the
   * distance from the axis measured along its OWN facet's azimuth, not the
   * radius — which is what makes a facet a plane rather than a cone: a point
   * 22.5 degrees round from the facet's centre is nearer the axis in u than
   * its radius suggests, and lands lower on the crown for exactly that
   * reason. Every star tip and every lower-half tip below is placed by
   * evaluating one of these, so it cannot help but be coplanar. */
  const crownY = (u) => gh + ((1 - u) * (P.crown - gh)) / (1 - P.table);
  const uCulet = P.culet * COS22;
  const pavY = (u) => -gh - ((1 - u) * (P.pavilion - gh)) / (1 - uCulet);

  const at = (k, r, y) => [Math.cos(k * R22) * r, y, Math.sin(k * R22) * r];

  // Sixteen girdle junctions, top and bottom edge of the band.
  const gTop = [];
  const gBot = [];
  for (let j = 0; j < 16; j++) {
    gTop.push(at(j, 1, gh));
    gBot.push(at(j, 1, -gh));
  }
  // The table's eight corners, on the even azimuths — a bezel below each.
  const T = [];
  for (let i = 0; i < 8; i++) T.push(at(2 * i, P.table, P.crown));
  // Star tips and lower-half tips, on the odd azimuths, each read off a plane.
  const S = [];
  const L = [];
  const C = [];
  const tableEdge = P.table * COS22;
  const rStar = tableEdge + P.star * (1 - tableEdge);
  const rHalf = 1 - P.half * (1 - P.culet);
  for (let i = 0; i < 8; i++) {
    S.push(at(2 * i + 1, rStar, crownY(rStar * COS22)));
    L.push(at(2 * i + 1, rHalf, pavY(rHalf * COS22)));
    C.push(at(2 * i + 1, P.culet, -P.pavilion));
  }

  const pos = [];
  const nor = [];
  const facets = [];

  /* One facet: fanned into triangles and given one flat normal, since flat is
   * the whole point. The winding is not authored — it is decided by which way
   * the facet's own centroid faces, which for a convex solid is always out.
   * Half the facets here are mirrored copies of another, so hand-authoring
   * winding is just a list of chances to get one backwards. */
  const facet = (pts) => {
    let c = [0, 0, 0];
    for (const p of pts) {
      c[0] += p[0] / pts.length;
      c[1] += p[1] / pts.length;
      c[2] += p[2] / pts.length;
    }
    let n = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    let ring = pts;
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) {
      n = [-n[0], -n[1], -n[2]];
      ring = pts.slice().reverse();
    }
    facets.push(n);
    for (let i = 1; i < ring.length - 1; i++) {
      for (const p of [ring[0], ring[i], ring[i + 1]]) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
      }
    }
  };

  facet(T); // the table
  for (let i = 0; i < 8; i++) {
    const prev = (i + 7) % 8;
    // Crown: the bezel kite, the star between two of them, and the pair of
    // upper girdle halves that carry the star's tip down to the girdle.
    facet([T[i], S[i], gTop[2 * i], S[prev]]);
    facet([T[i], T[(i + 1) % 8], S[i]]);
    facet([gTop[2 * i], gTop[2 * i + 1], S[i]]);
    facet([gTop[2 * i + 1], gTop[(2 * i + 2) % 16], S[i]]);
    // Pavilion: the same arrangement upside down, except that the mains run
    // all the way to the culet and so are pentagons, not kites.
    facet([gBot[2 * i], gBot[2 * i + 1], L[i]]);
    facet([gBot[2 * i + 1], gBot[(2 * i + 2) % 16], L[i]]);
    facet([gBot[2 * i], L[i], C[i], C[prev], L[prev]]);
  }
  for (let j = 0; j < 16; j++) {
    // The girdle band: sixteen flats, one per junction, as a bruted girdle is.
    const k = (j + 1) % 16;
    facet([gTop[j], gTop[k], gBot[k], gBot[j]]);
  }
  facet(C.slice().reverse()); // the culet

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return { geometry: g, facets };
}

/* -------------------------------------------------------------------- tent */

/* The light tent, painted as one equirectangular sheet: what the stone is
 * standing in as far as it can tell. Values are linear (the texture is not
 * tagged sRGB), so what is written here is what the shader reads.
 *
 * Panels are held at or under 0.78 and the specks alone are pure white,
 * because the shader pushes anything above 0.86 far past white — that split
 * is what lets the panels stay photographic while the specks blow out into
 * sparkles. */
/* The standing panels: centre u, half width, top v, bottom v, then the
 * panel's colour.
 *
 * Two things are being bought here. The first is EDGES — nine narrow panels
 * with black between them give a turning stone far more hard lines to rake
 * across itself than four broad ones, and every one of those lines is a
 * flash on the way past and a band of fire where the spectrum straddles it.
 *
 * The second is the warm/cool split, which is not decoration: it is how a
 * bench actually lights a stone. Gel one side warm and the other cool and
 * the same facet throws a different colour depending on which way it is
 * turned, so the colour inside the stone changes as it moves instead of
 * sitting there. The ceiling — the panel the stone answers to most of the
 * time — is left a hair cool, so the body of it reads icy and the fire comes
 * up warm against that. Nothing here is more than a few percent off neutral;
 * a stone with an obvious colour cast is a stone with a problem. */
const PANELS = [
  [0.055, 0.028, 0.3, 0.5, 0.54, 0.51, 0.45],
  [0.155, 0.014, 0.33, 0.47, 0.33, 0.37, 0.44],
  [0.3, 0.044, 0.28, 0.52, 0.66, 0.66, 0.68],
  [0.41, 0.012, 0.31, 0.45, 0.46, 0.42, 0.35],
  [0.52, 0.02, 0.32, 0.47, 0.3, 0.34, 0.4],
  [0.63, 0.015, 0.29, 0.49, 0.44, 0.44, 0.44],
  [0.74, 0.048, 0.29, 0.51, 0.62, 0.58, 0.5],
  [0.865, 0.014, 0.33, 0.46, 0.36, 0.41, 0.48],
  [0.945, 0.018, 0.3, 0.48, 0.5, 0.5, 0.52],
];
const SPECKS = [
  [0.02, 0.6, 4], [0.11, 0.53, 5], [0.17, 0.63, 6], [0.21, 0.72, 3],
  [0.35, 0.55, 4], [0.4, 0.66, 5], [0.46, 0.75, 3], [0.57, 0.54, 7],
  [0.6, 0.7, 4], [0.68, 0.6, 3], [0.79, 0.58, 5], [0.83, 0.71, 4],
  [0.91, 0.55, 3], [0.97, 0.65, 6], [0.08, 0.25, 5], [0.31, 0.23, 4],
  [0.56, 0.26, 6], [0.78, 0.24, 4], [0.95, 0.26, 5],
];

/* The three lights the flare is allowed to catch: the ceiling straight
 * overhead, and the two widest panels — picked off the table above rather
 * than named, so adding a panel cannot leave this pointing at nothing. */
const FLARE_DIRS = [[0, 1, 0]].concat(
  PANELS.slice()
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map((p) => {
      const az = (p[0] - 0.5) * Math.PI * 2;
      const el = ((p[2] + p[3]) / 2) * Math.PI;
      return [
        Math.cos(az) * Math.sin(el),
        Math.cos(el),
        Math.sin(az) * Math.sin(el),
      ];
    })
);

function tentTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const to255 = (v) => Math.round(Math.min(Math.max(v, 0), 1) * 255);
  const lv = (r, gr, b) =>
    `rgb(${to255(r)},${to255(gr === undefined ? r : gr)},${to255(
      b === undefined ? r : b
    )})`;

  g.fillStyle = lv(0.004);
  g.fillRect(0, 0, W, H);

  /* The ceiling: everything from straight up out to 42 degrees off it, and
   * coffered rather than flat.
   *
   * How WIDE it is turns out to matter more than how bright. The light that
   * leaves a stone's table has come down through the crown, off the pavilion
   * twice and back up — so the eye at 30 degrees above the table is reading
   * the room roughly 55 degrees up on the far side. A tight overhead misses
   * that on every ordinary viewing angle and the table goes grey, which is
   * no way to light the one facet everybody looks at. Out to 42 degrees, the
   * table's light path lands inside it from about 15 degrees of tilt all the
   * way to straight down. The gap between this and the standing panels is
   * left dark on purpose: that is where the direct reflection lands, and the
   * black in it is what gives the crown its contrast.
   *
   * This is the single biggest thing the crown reflects, and one unbroken
   * panel comes back as one unbroken sheet — half the top of the stone goes
   * blank white, which is the look of cheap render glass. Broken into cells
   * with dark seams between them, the same facets catch a cell, then a seam,
   * then the next cell, and the crown reads as structure instead of paint.
   * The seams are also edges, and edges are where the fire lives.
   *
   * Every cell is gelled a percent or two off its neighbours, and the ring
   * of cells dims going outward the way a real overhead falls off. So what
   * comes back out of the stone is not one white — it is a dozen, and they
   * change places as it turns. */
  const RINGS = [0, 0.07, 0.135, 0.19, 0.235];
  const CELLS = 12;
  const SEAM_U = 0.0035;
  const SEAM_V = 0.005;
  const TINTS = [
    [1.0, 0.99, 0.962], [1.0, 1.0, 1.0], [0.968, 0.988, 1.026],
    [1.0, 0.997, 0.982], [0.984, 0.995, 1.014], [1.0, 0.982, 0.955],
  ];
  for (let ring = 0; ring < RINGS.length - 1; ring++) {
    for (let k = 0; k < CELLS; k++) {
      const t = TINTS[(k + ring * 2) % TINTS.length];
      // Held under the shader's hot threshold: a ceiling cell is a panel,
      // not a speck, and must never be handed the sparkle multiplier.
      const l = 0.6 * (1 - ring * 0.11) * (0.94 + (0.12 * ((k * 5) % 7)) / 6);
      g.fillStyle = lv(l * t[0], l * t[1], l * t[2]);
      g.fillRect(
        (k / CELLS + SEAM_U) * W,
        (RINGS[ring] + (ring ? SEAM_V : 0)) * H,
        (1 / CELLS - SEAM_U * 2) * W,
        (RINGS[ring + 1] - RINGS[ring] - (ring ? SEAM_V : 0)) * H
      );
    }
  }
  /* THE OBSERVER, and it is the thing this tent was missing.
   *
   * Face-up, the pavilion hands the eye back the room DIRECTLY ABOVE the
   * stone, so with an unbroken lit ceiling up there the one view everybody
   * looks at a diamond in came back as a flat sheet of light grey. Which is
   * exactly what it should have come back as: the tent had no photographer in
   * it. Every real macro of a stone is shot through a hole in the light, and
   * the black of the lens, folded down by the pavilion and broken into
   * wedges by the mains, IS the pattern the trade calls the arrows. Contrast
   * face-up is not something you add to a diamond; it is the dark that the
   * cut arranges. Without something dark overhead there is nothing to
   * arrange, and no amount of exposure will invent it.
   *
   * Nine degrees or so, which is a real lens at a real working distance, with
   * a soft rim so it reads as an aperture rather than a sticker. Small on
   * purpose: it must take the middle of the table and leave the coffered ring
   * around it to do the burning. */
  {
    const HEAD_V = 0.05;
    const cap = g.createRadialGradient(0, 0, 0, 0, 0, H * (HEAD_V + 0.028));
    cap.addColorStop(0, "rgba(0,0,0,0.97)");
    cap.addColorStop(HEAD_V / (HEAD_V + 0.028), "rgba(0,0,0,0.95)");
    cap.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = cap;
    // The pole is the whole top edge of a lat-long sheet, so the obstruction
    // is a band across it, faded by distance down from that edge.
    const band = g.createLinearGradient(0, 0, 0, H * (HEAD_V + 0.028));
    band.addColorStop(0, "rgba(0,0,0,0.97)");
    band.addColorStop(HEAD_V / (HEAD_V + 0.028), "rgba(0,0,0,0.92)");
    band.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = band;
    g.fillRect(0, 0, W, H * (HEAD_V + 0.028));
  }

  const CEIL_V = RINGS[RINGS.length - 1];
  const fade = g.createLinearGradient(0, H * CEIL_V, 0, H * (CEIL_V + 0.022));
  fade.addColorStop(0, lv(0.2, 0.21, 0.23));
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, H * CEIL_V, W, H * 0.022);

  // The standing panels, with black between them. The gaps matter as much as
  // the panels — a tent lit all the way round reflects as fog.
  for (const [u, hw, v0, v1, r, gr, b] of PANELS) {
    const grd = g.createLinearGradient(0, v0 * H, 0, v1 * H);
    grd.addColorStop(0, lv(r, gr, b));
    grd.addColorStop(0.75, lv(r * 0.82, gr * 0.82, b * 0.82));
    grd.addColorStop(1, lv(r * 0.4, gr * 0.4, b * 0.4));
    g.fillStyle = grd;
    // Drawn either side of the wrap so the seam is never a seam.
    for (const shift of [-1, 0, 1]) {
      g.fillRect((u + shift - hw) * W, v0 * H, hw * 2 * W, (v1 - v0) * H);
    }
  }

  // The floor: a low bounce off the bench the tent stands on, warm the way
  // a wooden bench is, falling away to nothing.
  const floor = g.createLinearGradient(0, H * 0.56, 0, H);
  floor.addColorStop(0, lv(0.05, 0.045, 0.037));
  floor.addColorStop(0.45, lv(0.022, 0.02, 0.017));
  floor.addColorStop(1, lv(0.003));
  g.fillStyle = floor;
  g.fillRect(0, H * 0.56, W, H * 0.44);

  // The specks. Small, pure white, and the only thing here allowed to be —
  // every hard sparkle the stone throws is one of these, seen in a facet.
  for (const [u, v, r] of SPECKS) {
    const x = u * W;
    const y = v * H;
    const s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, "rgb(255,255,255)");
    s.addColorStop(0.55, "rgb(255,255,255)");
    s.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = s;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const tex = new THREE.CanvasTexture(c);
  /* flipY STAYS AT THREE'S DEFAULT, and it matters which way round.
   *
   * This canvas is no longer read by the stone's shader; it is read once by
   * three's own equirectangular-to-cube conversion, whose v runs
   * asin(y)/PI + 0.5, the opposite way up from the acos(y)/PI this file
   * used while it sampled the sheet itself. Two flips that cancel: three
   * turns the image over on upload, its converter turns the coordinate over,
   * and the first row of the canvas comes out as straight up, which is where
   * the ceiling is painted. Set flipY false here, as the hand-rolled mapping
   * needed, and the tent hangs upside down with its ceiling under the stone. */
  // No mipmaps on purpose: the sparkles must stay needle sharp, and without
  // a mip chain the equirect's wrap seam cannot smear either.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* The flare sprite: a bright core and four spikes. Drawn, not shaded — it is
 * standing in for what a lens does to a light it cannot resolve. */
function flareTexture() {
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const core = g.createRadialGradient(64, 64, 0, 64, 64, 26);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.22, "rgba(255,255,255,0.42)");
  core.addColorStop(0.6, "rgba(246,250,255,0.08)");
  core.addColorStop(1, "rgba(246,250,255,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = "lighter";
  for (let k = 0; k < 4; k++) {
    g.save();
    g.translate(64, 64);
    g.rotate((k * Math.PI) / 2);
    const s = g.createLinearGradient(0, 0, 62, 0);
    s.addColorStop(0, "rgba(255,255,255,0.85)");
    s.addColorStop(0.18, "rgba(255,255,255,0.22)");
    s.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = s;
    g.beginPath();
    g.moveTo(0, -3.4);
    g.lineTo(62, 0);
    g.lineTo(0, 3.4);
    g.closePath();
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ shader */

const VERT = [
  "varying vec3 vN;",
  "varying vec3 vP;",
  "void main() {",
  "  vec4 wp = modelMatrix * vec4(position, 1.0);",
  "  vP = wp.xyz;",
  "  vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);",
  "  gl_Position = projectionMatrix * viewMatrix * wp;",
  "}",
].join("\n");

/* Reading the tent. The hot term is the whole difference between a stone
 * that glows and a stone that flashes: everything under 0.86 is a panel and
 * is left photographic, everything above it is a speck and is thrown far past
 * white, where the tone mapper turns it into a hard clipped star. */
const TENT = [
  /* A CUBE, not an equirectangular sheet, and the reason is arithmetic rather
   * than taste. Reading a lat-long map by direction costs an atan and an
   * acos, and this shader reads the tent EIGHT times for every fragment of
   * the stone: once for the reflection off the near facet, once more off the
   * far one, and five times over for the spectral bands that make the fire.
   * Sixteen transcendentals per pixel, on the pass that covers most of the
   * frame through the whole approach, so that a texture unit could be handed
   * a pair of numbers it was going to convert back into a direction anyway.
   * A cube map is addressed BY direction: the hardware does the face
   * selection in fixed function, for nothing. The tent is still painted as a
   * lat-long canvas, because that is the sane way to paint one; it is
   * converted once at build time and never sampled that way again. */
  "uniform samplerCube uEnv;",
  "uniform float uGain;",
  "uniform float uHot;",
  "vec3 tent(vec3 d) {",
  "  vec3 c = textureCube(uEnv, d).rgb;",
  "  float m = max(max(c.r, c.g), c.b);",
  "  return c * uGain * (1.0 + uHot * smoothstep(0.86, 1.0, m));",
  "}",
  /* The pavilion, in one line.
   *
   * This is the whole reason a brilliant is cut the way it is. A ray that
   * comes in through the crown does not pass out of the bottom — it strikes
   * one pavilion main at past the critical angle, bounces to the main
   * opposite, bounces again, and leaves back out of the top. Two mirrors
   * facing each other across the stone, and the net of the pair is to turn
   * the ray's vertical component over and leave the rest of it alone.
   *
   * Which means what you see looking into a brilliant is the room ABOVE it,
   * folded down: light is handed back to where it came from. Sample the tent
   * once with the vertical flipped and that is the effect, for the cost of a
   * minus sign. Without it, looking down at a stone reads the tent's dark
   * floor and the face-up view — the one a ring is actually worn in — goes
   * black, which is exactly backwards from how a diamond behaves. */
  "vec3 returned(vec3 d) { return vec3(d.x, -d.y, d.z); }",
].join("\n");

const FRAG_BACK = [
  "varying vec3 vN;",
  "varying vec3 vP;",
  "uniform float uLevel;",
  "uniform float uBounce;",
  TENT,
  "void main() {",
  // Seen from inside, a facet is a mirror — light that reaches the eye off a
  // far facet has bounced there, which is why a diamond has a pattern in it
  // rather than a view through it. Some of it has bounced twice.
  "  vec3 N = normalize(vN);",
  "  vec3 V = normalize(vP - cameraPosition);",
  "  vec3 r = reflect(V, N);",
  "  vec3 col = mix(tent(r), tent(returned(r)), uBounce) * uLevel;",
  // A shade darker where the far facet is square to the eye, so the pattern
  // keeps its depth instead of flattening into one sheet.
  "  col *= 0.62 + 0.38 * (1.0 - abs(dot(N, V)));",
  "  gl_FragColor = vec4(col, 1.0);",
  "  #include <tonemapping_fragment>",
  "  #include <colorspace_fragment>",
  "}",
].join("\n");

/* Five bands across the visible spectrum, each with its own index of
 * refraction and its own colour, normalised so that a stone standing in a
 * flat white room comes out white.
 *
 * The usual shortcut is three bends, one per channel — and it is why most
 * rendered gems come out with whole facets of saturated primary: with only
 * three samples a facet either catches a light in that channel or it does
 * not, so it goes fully red or fully blue. Real fire does not work like
 * that. The bands overlap, so a facet that catches a light catches it in
 * nearly all of them and reads white, and the colour appears only where the
 * bands disagree — on the EDGE, where one has swung onto a light and the
 * next has not. Spectral colour belongs on edges.
 *
 * Each band takes the tent's own colour with it rather than just its
 * brightness, so a warm panel puts warmth into the bands that carry red and
 * a cool one cools the far end. With a neutral tent this is exactly the grey
 * behaviour it replaced; with a gelled one it is the difference between fire
 * that is always the same colour and fire that changes as the stone turns. */
const BANDS = [
  ["1.0 + uDisp", "0.5319, 0.0556, 0.0"],
  ["1.0 + 0.5 * uDisp", "0.3723, 0.2593, 0.0160"],
  ["1.0", "0.0798, 0.3704, 0.0798"],
  ["1.0 - 0.5 * uDisp", "0.0160, 0.2593, 0.3723"],
  ["1.0 - uDisp", "0.0, 0.0556, 0.5319"],
];

const FRAG_FRONT = [
  "varying vec3 vN;",
  "varying vec3 vP;",
  "uniform float uEta;",
  "uniform float uDisp;",
  "uniform float uThru;",
  "uniform float uRefl;",
  TENT,
  "void main() {",
  "  vec3 N = normalize(vN);",
  "  vec3 V = normalize(vP - cameraPosition);",
  // Diamond's refractive index is 2.417, which puts 17.2% of the light
  // straight back off the face before it ever gets in. That number is most
  // of the reason a diamond outshines every other clear stone.
  "  float f = clamp(1.0 - abs(dot(N, V)), 0.0, 1.0);",
  "  float fres = 0.172 + 0.828 * pow(f, 5.0);",
  "  vec3 refl = tent(reflect(V, N));",
  "  vec3 thru = vec3(0.0);",
]
  .concat(
    BANDS.map(
      (b) =>
        "  thru += vec3(" +
        b[1] +
        ") * tent(returned(refract(V, N, uEta * (" +
        b[0] +
        "))));"
    )
  )
  .concat([
    "  vec3 col = refl * fres * uRefl + thru * (1.0 - fres) * uThru;",
    "  gl_FragColor = vec4(col, 1.0);",
    "  #include <tonemapping_fragment>",
    "  #include <colorspace_fragment>",
    "}",
  ])
  .join("\n");

/* ------------------------------------------------------------------- model */

export function createBrilliantDiamond(opts) {
  const o = opts || {};
  const diameter = o.diameter || 0.65;
  const radius = diameter / 2;
  // Standing on its own it is always under the studio; set in something, it
  // gets whatever light that thing gives it.
  const standing = !!o.standing;

  const built = buildBrilliant();
  built.geometry.scale(radius, radius, radius);

  /* The tent, painted flat and then turned into a cube once, here, so that
   * every one of the eight lookups per fragment downstream is a plain
   * hardware cube fetch. 512 a face against a 1024x512 sheet: the faces
   * oversample the sheet's own detail everywhere except at the poles, which
   * is the right way round for this tent, since the coffered ceiling is
   * exactly what the crown reads. The sheet is thrown away afterwards; it has
   * no further reader. */
  const sheet = tentTexture();
  const cube = new THREE.WebGLCubeRenderTarget(512, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  cube.fromEquirectangularTexture(o.renderer, sheet);
  sheet.dispose();
  const env = cube.texture;

  /* The exposure. Two passes of a bright tent add up fast, and a stone that
   * clips everywhere is a white pebble — the pattern is the point, so the
   * levels are set so that only a facet squarely catching the ceiling or a
   * speck is allowed to reach white, and everything else lands in the greys
   * the reference photograph is mostly made of. */
  const GAIN_LIT = 1.6;
  const GAIN_DARK = 0.14;
  const uEnv = { value: env };
  const uGain = { value: GAIN_LIT };
  const uHot = { value: 24 };

  const back = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG_BACK,
    uniforms: {
      uEnv,
      uGain,
      uHot,
      uLevel: { value: 0.42 },
      uBounce: { value: 0.55 },
    },
    side: THREE.BackSide,
  });
  const front = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG_FRONT,
    uniforms: {
      uEnv,
      uGain,
      uHot,
      uEta: { value: 0.62 },
      uDisp: { value: 0.035 },
      uThru: { value: 0.46 },
      uRefl: { value: 1.0 },
    },
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // Hung, when it is the whole shot. A brilliant cannot stand on its culet
  // and a loose one is never put down on its table, so it is held in the air
  // at about the height a hand would hold it.
  const STAND_Y = 0.75;
  const root = new THREE.Group();
  if (standing) root.position.y = STAND_Y;
  // The far facets first and opaque, so they own the silhouette and the
  // depth; the near facets added over them. Nothing casts a shadow: a stone
  // that stopped light would be the one thing in the box that was not glass.
  const inner = new THREE.Mesh(built.geometry, back);
  const outer = new THREE.Mesh(built.geometry, front);
  outer.renderOrder = 2;
  root.add(inner);
  root.add(outer);

  const flare = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flareTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  flare.visible = false;
  flare.renderOrder = 20;
  root.add(flare);

  /* The flare's question, asked of every facet once a frame: is anything in
   * this facet's mirror line pointing at the camera?
   *
   * It runs per frame while the stone turns, so it is written to be dull and
   * fast — normals in one flat array, the lights rotated into the stone's
   * own frame instead of seventy-four normals into the room's, facets on the
   * outside so a facet pointing away is dropped once rather than once per
   * light, and not a single allocation. Roughly two hundred multiply-adds,
   * which is nothing next to one frame of the box. */
  const FN = new Float32Array(built.facets.length * 3);
  built.facets.forEach((n, i) => FN.set(n, i * 3));
  const LIT_N = FLARE_DIRS.length;
  const LD = new Float32Array(LIT_N * 3);
  const eyeLocal = new THREE.Vector3();
  const dirLocal = new THREE.Vector3();
  const invQ = new THREE.Quaternion();
  function sparkleAt(eye) {
    root.getWorldQuaternion(invQ).invert();
    for (let i = 0; i < LIT_N; i++) {
      const d = FLARE_DIRS[i];
      dirLocal.set(d[0], d[1], d[2]).applyQuaternion(invQ);
      LD[i * 3] = dirLocal.x;
      LD[i * 3 + 1] = dirLocal.y;
      LD[i * 3 + 2] = dirLocal.z;
    }
    eyeLocal.copy(eye);
    root.worldToLocal(eyeLocal);
    const l = eyeLocal.length() || 1;
    const vx = -eyeLocal.x / l;
    const vy = -eyeLocal.y / l;
    const vz = -eyeLocal.z / l;
    let best = 0;
    for (let f = 0; f < FN.length; f += 3) {
      const nx = FN[f];
      const ny = FN[f + 1];
      const nz = FN[f + 2];
      const dv = vx * nx + vy * ny + vz * nz;
      if (dv > 0) continue; // the facet is turned away from the eye
      const rx = vx - 2 * dv * nx;
      const ry = vy - 2 * dv * ny;
      const rz = vz - 2 * dv * nz;
      for (let i = 0; i < LIT_N * 3; i += 3) {
        const a = rx * LD[i] + ry * LD[i + 1] + rz * LD[i + 2];
        if (a > best) best = a;
      }
    }
    // A very tight power: the star is only allowed when a facet is within a
    // couple of degrees of mirroring a light down the lens, which is what
    // makes it read as a real alignment rather than a glow that is always on.
    return best <= 0 ? 0 : Math.pow(best, 260);
  }

  return {
    root,

    /** The stone's own measurements. girdle is the plane a setting bears on;
     * rise and drop are how far it stands above and below it. */
    metrics: {
      diameter,
      radius,
      rise: BRILLIANT.crown * radius,
      drop: BRILLIANT.pavilion * radius,
    },

    /** lit fades the tent with whatever lamp the stone is under; spin turns
     * it on its own axis; reveal is how much of it can be seen at all (a
     * stone shut in a box must not throw a flare through the lid); eye is the
     * camera, which the flare needs and nothing else does. */
    update(state) {
      const s = state || {};
      const lit = standing || typeof s.lit !== "number" ? 1 : s.lit;
      uGain.value = GAIN_DARK + (GAIN_LIT - GAIN_DARK) * lit;
      root.rotation.y = s.spin || 0;

      /* Shut in a box, the stone is not dim — it is not there. Dropping it
       * out of the draw entirely costs the page nothing and saves two passes
       * over the most expensive fragments on the stage, in the state the
       * page spends most of its life in. */
      const reveal = typeof s.reveal === "number" ? s.reveal : 1;
      const seen = reveal > 0.001;
      inner.visible = seen;
      outer.visible = seen;

      const show = reveal * lit;
      if (!s.eye || show < 0.02) {
        flare.visible = false;
        return;
      }
      const spark = sparkleAt(s.eye) * show;
      flare.visible = spark > 0.004;
      if (flare.visible) {
        flare.material.opacity = Math.min(spark * 0.8, 0.85);
        flare.scale.setScalar(radius * (1.4 + 2.6 * spark));
      }
    },

    framing() {
      return { cy: standing ? STAND_Y : 0, cr: radius * 1.42 };
    },
  };
}
