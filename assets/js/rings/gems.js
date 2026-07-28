/* The stones.
 *
 * Cut to the numbers a bench actually uses, not eyeballed. Every gem here is
 * built at girdle RADIUS 1 and centred on the girdle plane, so a caller sets
 * the stone's size with a single scale and knows the girdle will land exactly
 * where it put it.
 *
 * The proportions below are the modern round brilliant as Tolkowsky solved it
 * and as the GIA still grades it — 56% table, 34.5° crown, 40.75° pavilion —
 * and they are not decoration. They are the reason a brilliant returns light
 * rather than leaking it out of the bottom: at those two angles a ray entering
 * the table strikes both pavilion mains beyond the critical angle for a
 * refractive index of 2.417 and is thrown back at the eye. Push the pavilion
 * shallower and the stone goes glassy in the middle; push it deeper and it goes
 * dark. The renderer will not simulate that path, but the FACETS are what the
 * environment map reflects, so cutting them correctly is what makes the
 * highlights break up the way a real stone's do.
 *
 * The construction is solved rather than modelled. Every facet plane is
 * required to pass through the girdle, which fixes each vertex ring's height
 * from its radius and the facet angle — see the derivations inline. That is
 * what keeps the kites genuinely planar, which is what keeps the creases sharp.
 */

import { Facets, loftRings, ringAt } from "./facets.js";

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

/* Azimuth zero is +Z and the angle sweeps toward +X — x = sin, z = cos, not
   the other way round. In a right-handed Y-up space that is the direction that
   makes a ring of points wound in increasing order come out facing UP, so a
   table cap and a girdle wall built from the same loop both face outward with
   no per-facet sign fiddling. Every ring in this file is built with it. */
const ring = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];

/* Sixteen girdle points: eight under the bezel facets and eight between them.
   Every other feature on the stone hangs off this ring. */
const GIRDLE_POINTS = 16;
const COS22 = Math.cos(TAU / GIRDLE_POINTS); // cos 22.5°, used in both solves

/**
 * A round brilliant: 33 crown facets, 24 pavilion facets, 16 girdle facets.
 *
 * @param {object}  o
 * @param {number}  o.table          table width as a fraction of the diameter
 * @param {number}  o.crownAngle     bezel facet angle from the girdle plane
 * @param {number}  o.pavilionAngle  pavilion main angle from the girdle plane
 * @param {number}  o.girdle         girdle thickness as a fraction of diameter
 * @param {number}  o.star           star facet length, 0..1 table edge to girdle
 * @param {number}  o.lowerHalf      lower girdle facet length, 0..1
 */
export function roundBrilliant({
  table = 0.56,
  crownAngle = 34.5,
  pavilionAngle = 40.75,
  girdle = 0.032,
  star = 0.55,
  lowerHalf = 0.78,
} = {}) {
  const tanC = Math.tan(rad(crownAngle));
  const tanP = Math.tan(rad(pavilionAngle));

  // Girdle radius is 1, so a fraction-of-diameter figure is already the right
  // number in radius units for anything measured across the stone; a thickness
  // measured along the axis has to be doubled to match.
  const gTop = girdle; // half the girdle thickness, in radius units
  const gBot = -girdle;

  /* CROWN. A bezel facet is the plane through the table corner and the girdle
     point directly below it. Requiring both to lie on it fixes the crown
     height: n·T = n·G with n tilted by the crown angle gives
     hc = (1 - rTable) · tan(crownAngle). The two mid points where the star,
     bezel and upper-girdle facets all meet sit 22.5° off the main axis, so
     their height falls out of the same equation with the extra cos 22.5°:
     hm = (1 - rMid · cos22.5°) · tan(crownAngle). Solving rather than
     positioning by eye is what makes the kite planar to the last decimal. */
  const rTable = table; // table radius / girdle radius === table % of diameter
  const hc = (1 - rTable) * tanC;

  // Star length is measured from the table EDGE (which at 22.5° off-axis is at
  // rTable·cos22.5°, not rTable) out to the girdle.
  const tableEdge = rTable * COS22;
  const rMid = tableEdge + star * (1 - tableEdge);
  const hm = (1 - rMid * COS22) * tanC;

  /* PAVILION. Same solve, mirrored: the mains run from the girdle to a single
     culet point, which puts the culet at depth tan(pavilionAngle) — 43.1% of
     the diameter at 40.75°, which is the figure on every grading report. */
  const hp = tanP;
  const rLow = 1 - lowerHalf; // how far in the lower-half junction sits
  const hl = (1 - rLow * COS22) * tanP;

  const f = new Facets();

  // Every vertex is one of five rings, so build them once and index into them.
  const G = []; // girdle, 16 points, top edge
  const Gb = []; // girdle, 16 points, bottom edge
  for (let j = 0; j < GIRDLE_POINTS; j++) {
    const a = (j / GIRDLE_POINTS) * TAU;
    G.push(ring(a, 1, gTop));
    Gb.push(ring(a, 1, gBot));
  }

  const T = []; // table octagon corners, on the main axes
  const M = []; // crown mid points, 22.5° off the mains
  const L = []; // pavilion lower-half junctions, 22.5° off the mains
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const b = a + TAU / GIRDLE_POINTS;
    T.push(ring(a, rTable, gTop + hc));
    M.push(ring(b, rMid, gTop + hm));
    L.push(ring(b, rLow, gBot - hl));
  }
  const culet = [0, gBot - hp, 0];

  // 1 table
  f.poly(T);

  for (let k = 0; k < 8; k++) {
    const kPrev = (k + 7) % 8;
    const kNext = (k + 1) % 8;

    // 8 bezels (kites): table corner, out to the girdle main, held on both
    // sides by the mid points 22.5° away.
    f.quad(T[k], M[kPrev], G[2 * k], M[k]);

    // 8 stars: the triangle left between two table corners and the mid point.
    f.tri(T[k], M[k], T[kNext]);

    // 16 upper girdle halves, two to each mid point.
    f.tri(M[k], G[2 * k], G[2 * k + 1]);
    f.tri(M[k], G[2 * k + 1], G[(2 * k + 2) % GIRDLE_POINTS]);

    // 8 pavilion mains — the bezel kite again, upside down, running to the
    // culet. They sit directly under the bezels, which is what pairs a crown
    // flash with a pavilion flash as the stone turns.
    f.quad(Gb[2 * k], L[kPrev], culet, L[k]);

    // 16 lower girdle halves.
    f.tri(L[k], Gb[2 * k + 1], Gb[2 * k]);
    f.tri(L[k], Gb[(2 * k + 2) % GIRDLE_POINTS], Gb[2 * k + 1]);
  }

  // 16 girdle facets. Polished rather than bruted, so they take a highlight —
  // that bright hairline around the waist of a set stone is this ring.
  f.band(G, Gb);

  return f.build();
}

/* --- Step cuts -----------------------------------------------------------
 * No fire to speak of, and that is the point of them: an emerald cut trades a
 * brilliant's scintillation for long broad flashes off a few big planes, which
 * is why it is the cut that shows off clarity and why it reads as the calm one
 * beside three sparkling stones. Built as an octagonal outline lofted through
 * a stack of scales — each pair of rings is one step. */

/* Rectangle with the corners cut off, the outline of an emerald or asscher.
   Wound +Z toward +X to match the convention at the top of this file. */
function octagonOutline(halfW, halfL, corner) {
  const cw = corner * halfW * 2;
  const cl = corner * halfL * 2;
  return [
    [halfW, halfL - cl],
    [halfW, -(halfL - cl)],
    [halfW - cw, -halfL],
    [-(halfW - cw), -halfL],
    [-halfW, -(halfL - cl)],
    [-halfW, halfL - cl],
    [-(halfW - cw), halfL],
    [halfW - cw, halfL],
  ];
}

/**
 * Emerald cut. Built at half-width 1 on the X axis; `ratio` sets the length.
 * Three crown steps, three pavilion steps, closing on a keel line rather than
 * a point — a step cut has no culet, it has a ridge.
 */
export function emeraldCut({ ratio = 1.38, corner = 0.17, girdle = 0.03 } = {}) {
  const halfL = ratio;
  const outline = octagonOutline(1, halfL, corner);
  const hc = 0.34; // crown height
  const hp = 0.92; // pavilion depth — deep, the way step cuts are cut

  const rings = [
    ringAt(outline, 0.6, girdle + hc), // table
    ringAt(outline, 0.79, girdle + hc * 0.56), // crown step 2
    ringAt(outline, 0.91, girdle + hc * 0.24), // crown step 1
    ringAt(outline, 1, girdle), // girdle, top edge
    ringAt(outline, 1, -girdle), // girdle, bottom edge
    ringAt(outline, 0.78, -girdle - hp * 0.34), // pavilion step 1
    ringAt(outline, 0.46, -girdle - hp * 0.66), // pavilion step 2
    // The keel: the outline squashed almost flat across the short axis, which
    // leaves a narrow facet along the length instead of a point. Squashed to
    // 0.03 rather than 0 on purpose — collapsing it fully would hand the
    // builder zero-area triangles.
    ringAt(outline, 0.3, -girdle - hp, 0.03),
  ];

  return loftRings(rings).build();
}

/**
 * Tapered baguette — the shoulder stones of a three-stone ring. Four sides, one
 * crown bevel, and a keel: at this size anything more is invisible, and every
 * facet saved is a facet not drawn twice a frame in the transmission pass.
 */
export function taperedBaguette({ ratio = 1.55, taper = 0.62, girdle = 0.04 } = {}) {
  const halfL = ratio;
  // Trapezoid, narrow at +Z — that is the end that points at the centre stone.
  const outline = [
    [taper, halfL],
    [1, -halfL],
    [-1, -halfL],
    [-taper, halfL],
  ];
  const hc = 0.22;
  const hp = 0.62;

  const rings = [
    ringAt(outline, 0.72, girdle + hc),
    ringAt(outline, 1, girdle),
    ringAt(outline, 1, -girdle),
    ringAt(outline, 0.55, -girdle - hp * 0.55),
    ringAt(outline, 0.22, -girdle - hp, 0.05),
  ];

  return loftRings(rings).build();
}
