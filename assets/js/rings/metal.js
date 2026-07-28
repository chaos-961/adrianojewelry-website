/* The metal.
 *
 * Bands are the opposite problem to stones. A polished shank is one continuous
 * surface and wants its normals averaged across the whole sweep, so everything
 * here is INDEXED and welded — the seam where the band closes on itself shares
 * its vertices, or a hard line would run down the finger side of every ring.
 *
 * The section is a superellipse rather than a circle because that is what a
 * comfort-fit band is: domed on the outside, flatter on the inside, and the two
 * exponents below are the only knobs that need to move to go from a half-round
 * to a court to a near-flat band. The inner radius is held constant while the
 * thickness varies, so a shank can swell into a cathedral shoulder without the
 * hole it has to fit over ever changing size.
 */

import {
  BufferGeometry,
  BufferAttribute,
  LatheGeometry,
  Vector2,
} from "../vendor/three.module.min.js";

const TAU = Math.PI * 2;

/** Superellipse: n = 2 is a circle, higher is squarer, and the two halves can
    differ so the outside domes while the inside stays flat against the finger. */
function section(phi, outerN, innerN) {
  const cs = Math.cos(phi);
  const sn = Math.sin(phi);
  const p = 2 / (sn >= 0 ? outerN : innerN);
  return [
    Math.sign(cs) * Math.abs(cs) ** p * 0.5, // across the band's width
    Math.sign(sn) * Math.abs(sn) ** p * 0.5, // through its thickness
  ];
}

/**
 * A shank: a varying section swept around a circle standing in the XY plane,
 * with the finger axis on Z. Parameter t runs 0..1 from the TOP of the ring
 * (where the stone sits) clockwise, so `width` and `depth` read naturally —
 * t = 0 is the head, t = 0.5 is the bottom of the finger.
 *
 * Both functions must agree at t = 0 and t = 1; the band closes on itself and
 * a mismatch would open a seam.
 *
 * @param {object} o
 * @param {number} o.inner       inner radius, the hole; held constant
 * @param {(t:number)=>number} o.width  band width along the finger axis
 * @param {(t:number)=>number} o.depth  band thickness, inner face to outer
 * @param {number} o.segments    steps around the finger
 * @param {number} o.sides       steps around the section
 */
export function sweepBand({
  inner = 1,
  width = () => 0.26,
  depth = () => 0.16,
  segments = 168,
  sides = 22,
  outerN = 2.1,
  innerN = 4.5,
} = {}) {
  const position = new Float32Array(segments * sides * 3);
  const index = [];

  // The section shape is identical at every step, so trace it once.
  const shape = [];
  for (let s = 0; s < sides; s++) {
    shape.push(section((s / sides) * TAU, outerN, innerN));
  }

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const theta = t * TAU;
    // Outward in the ring's plane. Zero azimuth is +Y, so t = 0 is the top.
    const nx = Math.sin(theta);
    const ny = Math.cos(theta);

    const w = width(t);
    const d = depth(t);
    const mid = inner + d * 0.5; // hole stays put as the shank thickens

    for (let s = 0; s < sides; s++) {
      const [dw, dr] = shape[s];
      const r = mid + dr * d;
      const o = (i * sides + s) * 3;
      position[o] = nx * r;
      position[o + 1] = ny * r;
      position[o + 2] = dw * w;

      const iNext = (i + 1) % segments;
      const sNext = (s + 1) % sides;
      const a = i * sides + s;
      const b = iNext * sides + s;
      const c = iNext * sides + sNext;
      const dIdx = i * sides + sNext;
      // Wound so the face normal comes out along the section's outward
      // direction — see the derivation note in gems.js for the same idea.
      index.push(a, b, c, a, c, dIdx);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals(); // welded, so this smooths — which is wanted
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A prong: a tapered post finished with a bead that curls over the girdle.
 *
 * Built as a lathe rather than a cylinder because the bead is the whole point
 * of it — it is the only part a viewer sees on a set stone, it is what catches
 * the key light as a ring turns, and a flat-topped cylinder reads instantly as
 * a placeholder. Six of these are one InstancedMesh, so the extra profile
 * points cost one geometry, not six.
 *
 * Origin at the base, growing up +Y.
 */
export function prongGeometry({
  height = 1,
  base = 0.15,
  neck = 0.115,
  bead = 0.155,
  radial = 14,
} = {}) {
  const points = [
    new Vector2(0, 0),
    new Vector2(base, 0),
    new Vector2(base * 0.97, height * 0.38),
    new Vector2(neck, height * 0.66),
  ];

  // The bead, as a quarter turn from the neck up to the tip. Started a little
  // below the equator so it swells past the post rather than sitting on it.
  const cy = height - bead;
  for (let i = 0; i <= 6; i++) {
    const a = (-0.36 + (i / 6) * (0.36 + Math.PI / 2));
    points.push(new Vector2(Math.cos(a) * bead, cy + Math.sin(a) * bead));
  }
  points.push(new Vector2(0, height));

  return new LatheGeometry(points, radial);
}

/**
 * The rail a halo or a gallery sits on: a torus of rectangular-ish section,
 * which is just sweepBand with the hole opened up and the section squared off.
 */
export function railGeometry({ inner = 1, width = 0.1, depth = 0.08 } = {}) {
  return sweepBand({
    inner,
    width: () => width,
    depth: () => depth,
    segments: 96,
    sides: 14,
    outerN: 2.6,
    innerN: 2.6,
  });
}
