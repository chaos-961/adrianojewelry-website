/* Flat-facet geometry builder.
 *
 * A cut stone is not a smooth surface. Every one of a brilliant's fifty-seven
 * facets is a plane, and what makes a diamond read as a diamond rather than as
 * a bead of glass is that adjacent facets have *different* normals with a hard
 * crease between them: each one catches the light on its own and lets go of it
 * all at once as the stone turns. Smooth-shaded geometry averages that crease
 * away and the stone dies.
 *
 * So the gems here are built the way a cutter builds them — facet by facet —
 * and the geometry is deliberately NON-INDEXED. Every triangle owns its three
 * vertices outright, which means computeVertexNormals() has no shared vertices
 * to average across and hands back exactly one normal per face. That is the
 * whole trick: unwelded vertices are what buy the flat shading, and they cost
 * nothing here because a whole stone is only ~130 triangles.
 *
 * The metal is the opposite case and is built elsewhere — a polished band wants
 * its normals averaged, so bands are indexed and welded.
 */

import { BufferGeometry, BufferAttribute } from "../vendor/three.module.min.js";

/** A vertex is a plain [x, y, z]; no Vector3 allocation on a hot path. */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/* Below this, three points are collinear enough that the triangle they span has
   no meaningful normal. Dropping them is not an optimisation — a zero-area face
   normalises to NaN, and one NaN in the position buffer collapses the whole
   bounding sphere and the mesh vanishes. The keel line of a step cut and the
   culet of a brilliant both converge hard enough to produce them. */
const MIN_AREA = 1e-12;

export class Facets {
  constructor() {
    this.pos = [];
  }

  /** One flat triangle. Winding is counter-clockwise seen from the front. */
  tri(a, b, c) {
    if (len(cross(sub(b, a), sub(c, a))) < MIN_AREA) return this;
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    return this;
  }

  /* A facet is planar by construction here — the gem proportions are solved so
     that the four corners of a kite really do share a plane — so fanning from
     the first corner is exact, not an approximation. */
  poly(points) {
    for (let i = 1; i < points.length - 1; i++) {
      this.tri(points[0], points[i], points[i + 1]);
    }
    return this;
  }

  quad(a, b, c, d) {
    return this.poly([a, b, c, d]);
  }

  /* Walls between two closed rings of matching length, top ring first.
     Wound top-outer-first so the wall faces away from the axis: every closed
     outline in this file runs +Z toward +X, which is the direction that makes
     a cap's normal come out pointing up, and this is the ordering that agrees
     with it. Get it backwards and the stone renders inside-out — with
     transmission on, that reads as a stone that has gone strangely flat rather
     than as an obvious error, which is why it is written down here. */
  band(top, bottom) {
    const n = top.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad(top[i], bottom[i], bottom[j], top[j]);
    }
    return this;
  }

  /** Ring down to a single apex — a culet, or the point of a marquise. */
  cone(ring, apex) {
    const n = ring.length;
    for (let i = 0; i < n; i++) this.tri(ring[i], apex, ring[(i + 1) % n]);
    return this;
  }

  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(this.pos), 3)
    );
    // Unwelded, so this yields one normal per face rather than a smoothed
    // average — see the note at the top of the file.
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/* --- Step cuts -----------------------------------------------------------
 * An emerald cut, a baguette and an asscher are all the same construction: one
 * closed outline, repeated at a series of heights and scales, with flat walls
 * lofted between each pair. Each pair of rings is one row of step facets. */

/**
 * @param {Array<{ y:number, points:number[][] }>} rings  top to bottom
 * @param {object} o
 * @param {boolean} o.capTop     close the top ring — the table facet
 * @param {boolean} o.capBottom  close the last ring — the keel facet
 *
 * Both caps are on by default because a transmissive material shades from a
 * thickness, and an open shell has no inside to be thick: light would enter the
 * table and find nothing to leave through.
 */
export function loftRings(rings, { capTop = true, capBottom = true } = {}) {
  const f = new Facets();
  if (capTop) f.poly(rings[0].points);
  for (let i = 0; i < rings.length - 1; i++) {
    f.band(rings[i].points, rings[i + 1].points);
  }
  // Reversed, so the bottom cap faces down rather than back up into the stone.
  if (capBottom) f.poly([...rings[rings.length - 1].points].reverse());
  return f;
}

/** Scales a closed outline about its own centre, at a given height. */
export function ringAt(outline, scale, y, squashX = 1) {
  return {
    y,
    points: outline.map((p) => [p[0] * scale * squashX, y, p[1] * scale]),
  };
}
