/* Adriano Jewelry: shared model geometry toolkit.
 *
 * Two constructions cover every part the props here are made of, and this
 * file is those two and nothing else; each model under assets/js/models/
 * composes them into a prop.
 *
 * sweep() is the case: a rounded rectangle outline swept vertically through
 * a 2D edge profile, plus flat caps cut from the same outline. The profile
 * is a list of { i, y } stations: i is the inset from the nominal wall (0
 * at the wall, positive pulls inward), y the height. The corner radius
 * tightens as the outline insets and is floored at rMin, so a deep chamfer
 * keeps a drawn corner instead of collapsing to a point. Normals are
 * computed per profile segment and smoothed across stations unless the bend
 * is sharper than the crease threshold (or a station is marked hard), which
 * splits the ring so the shading breaks where the surface does.
 *
 * tube() is the metal: a wire of elliptical section swept along a path in
 * space, which is what a band, a claw, a bezel or a link all are.
 */

import * as THREE from "../vendor/three.module.min.js";

export function outlineAt(w, d, r, inset, rMin, cSeg, sSeg) {
  const hw = w / 2 - inset;
  const hd = d / 2 - inset;
  const rr = Math.min(Math.max(r - inset, rMin), hw - 0.02, hd - 0.02);
  const cx = hw - rr;
  const cz = hd - rr;
  const centers = [
    [cx, cz],
    [-cx, cz],
    [-cx, -cz],
    [cx, -cz],
  ];
  const pts = [];
  const nrm = [];
  for (let k = 0; k < 4; k++) {
    const a0 = (k * Math.PI) / 2;
    for (let s = 0; s < cSeg; s++) {
      const a = a0 + ((Math.PI / 2) * s) / cSeg;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pts.push([centers[k][0] + rr * ca, centers[k][1] + rr * sa]);
      nrm.push([ca, sa]);
    }
    const a1 = a0 + Math.PI / 2;
    const from = [
      centers[k][0] + rr * Math.cos(a1),
      centers[k][1] + rr * Math.sin(a1),
    ];
    const next = centers[(k + 1) % 4];
    const to = [next[0] + rr * Math.cos(a1), next[1] + rr * Math.sin(a1)];
    for (let s = 0; s < sSeg; s++) {
      const t = s / sSeg;
      pts.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ]);
      nrm.push([Math.cos(a1), Math.sin(a1)]);
    }
  }
  return { pts, nrm };
}

export function sweep(w, d, r, profile, opts) {
  const o = Object.assign(
    { rMin: 0.3, flip: false, cSeg: 10, sSeg: 4, crease: 0.72 },
    opts
  );
  // Per-segment 2D normals in (outline-normal, up) space.
  const segN = [];
  for (let j = 0; j < profile.length - 1; j++) {
    const di = profile[j + 1].i - profile[j].i;
    const dy = profile[j + 1].y - profile[j].y;
    const l = Math.hypot(di, dy) || 1;
    segN.push([dy / l, di / l]);
  }
  // Stations become rings; a crease or a hard flag splits the ring in two.
  const rings = [];
  for (let j = 0; j < profile.length; j++) {
    const p = profile[j];
    const prev = segN[j - 1];
    const next = segN[j];
    if (!prev) rings.push({ i: p.i, y: p.y, n: next });
    else if (!next) rings.push({ i: p.i, y: p.y, n: prev });
    else {
      const dot = prev[0] * next[0] + prev[1] * next[1];
      if (p.hard || dot < o.crease) {
        rings.push({ i: p.i, y: p.y, n: prev });
        rings.push({ i: p.i, y: p.y, n: next });
      } else {
        const nx = prev[0] + next[0];
        const ny = prev[1] + next[1];
        const l = Math.hypot(nx, ny) || 1;
        rings.push({ i: p.i, y: p.y, n: [nx / l, ny / l] });
      }
    }
  }

  const N = 4 * (o.cSeg + o.sSeg);
  const pos = [];
  const nor = [];
  const uv = [];
  for (let j = 0; j < rings.length; j++) {
    const ring = rings[j];
    const out = outlineAt(w, d, r, ring.i, o.rMin, o.cSeg, o.sSeg);
    for (let i = 0; i < N; i++) {
      const p = out.pts[i];
      const m = out.nrm[i];
      pos.push(p[0], ring.y, p[1]);
      const f = o.flip ? -1 : 1;
      nor.push(m[0] * ring.n[0] * f, ring.n[1] * f, m[1] * ring.n[0] * f);
      uv.push(i / N, j / (rings.length - 1));
    }
  }
  const idx = [];
  for (let j = 0; j < rings.length - 1; j++) {
    // Skip degenerate bands between the two halves of a split ring.
    if (rings[j].y === rings[j + 1].y && rings[j].i === rings[j + 1].i)
      continue;
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const a = j * N + i;
      const b = j * N + i2;
      const c = (j + 1) * N + i;
      const e = (j + 1) * N + i2;
      if (o.flip) idx.push(a, b, c, b, e, c);
      else idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Appends a quarter-ellipse roundover from (i0,y0) to (i1,y1). */
export function quarterIn(profile, i0, y0, i1, y1, steps) {
  for (let s = 0; s <= steps; s++) {
    const t = (Math.PI / 2) * (s / steps);
    profile.push({
      i: i1 + (i0 - i1) * Math.cos(t),
      y: y0 + (y1 - y0) * Math.sin(t),
    });
  }
}

export function rrectPath(w, d, r, PathCtor) {
  const p = new (PathCtor || THREE.Shape)();
  const hw = w / 2;
  const hd = d / 2;
  p.moveTo(-hw + r, -hd);
  p.lineTo(hw - r, -hd);
  p.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  p.lineTo(hw, hd - r);
  p.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  p.lineTo(-hw + r, hd);
  p.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(-hw, -hd + r);
  p.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  p.closePath();
  return p;
}

/** A flat rounded-rect cap, facing up or down, with an optional hole and
 * uvs normalised to the cap's own bounds (v=1 at -z, the hinge side). */
export function capGeometry(w, d, r, faceUp, holeSpec) {
  const shape = rrectPath(w, d, r, THREE.Shape);
  if (holeSpec) {
    shape.holes.push(rrectPath(holeSpec.w, holeSpec.d, holeSpec.r, THREE.Path));
  }
  const g = new THREE.ShapeGeometry(shape, 16);
  g.rotateX(faceUp ? -Math.PI / 2 : Math.PI / 2);
  const uvA = g.attributes.uv;
  const posA = g.attributes.position;
  for (let i = 0; i < uvA.count; i++) {
    uvA.setXY(i, (posA.getX(i) + w / 2) / w, (-posA.getZ(i) + d / 2) / d);
  }
  return g;
}

/* ------------------------------------------------------------------- wire */

const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const v3unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-12 ? [0, 0, 0] : [v[0] / l, v[1] / l, v[2] / l];
};

/** A wire: an elliptical section swept along a path through space.
 *
 * Each station is { p: [x, y, z], ru, rv }: ru the half-size across the
 * section's first axis, rv across the second, rv defaulting to ru for round
 * wire. The section's axes are taken from the tangent and the `up` hint
 * rather than parallel-transported along the path, so a station is oriented
 * by nothing but itself: there is no twist to accumulate and a closed loop
 * closes on itself exactly.
 *
 * Normals are analytic and carry the taper term (how fast the section is
 * closing per unit of path), which is what lets a radius run down to nothing
 * and read as a dome instead of a bevelled cylinder: how every claw here
 * ends. opts: { seg, closed, cap, up }.
 */
export function tube(path, opts) {
  const o = Object.assign(
    { seg: 18, closed: false, cap: true, up: [0, 0, 1] },
    opts
  );
  const n = path.length;
  const SEG = o.seg;
  const RU = path.map((s) => s.ru);
  const RV = path.map((s) => (s.rv === undefined ? s.ru : s.rv));
  const pos = [];
  const nor = [];
  const idx = [];

  for (let j = 0; j < n; j++) {
    const jp = o.closed ? (j - 1 + n) % n : Math.max(j - 1, 0);
    const jn = o.closed ? (j + 1) % n : Math.min(j + 1, n - 1);
    const span = v3sub(path[jn].p, path[jp].p);
    const t = v3unit(span);
    // The hint only has to be off the tangent; two fallbacks cover a path
    // that happens to run along it.
    let a1 = v3cross(t, o.up);
    if (Math.hypot(a1[0], a1[1], a1[2]) < 1e-5) a1 = v3cross(t, [1, 0, 0]);
    if (Math.hypot(a1[0], a1[1], a1[2]) < 1e-5) a1 = v3cross(t, [0, 1, 0]);
    a1 = v3unit(a1);
    const a2 = v3cross(a1, t);
    const ru = RU[j];
    const rv = RV[j];
    const ds = Math.hypot(span[0], span[1], span[2]) || 1;
    const dru = (RU[jn] - RU[jp]) / ds;
    const drv = (RV[jn] - RV[jp]) / ds;
    const c = path[j].p;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pos.push(
        c[0] + a1[0] * ru * ca + a2[0] * rv * sa,
        c[1] + a1[1] * ru * ca + a2[1] * rv * sa,
        c[2] + a1[2] * ru * ca + a2[2] * rv * sa
      );
      // Ellipse normal (axes swapped, as an ellipse's normal is), tilted
      // along the path by however fast the section is closing.
      const e = v3unit([
        a1[0] * rv * ca + a2[0] * ru * sa,
        a1[1] * rv * ca + a2[1] * ru * sa,
        a1[2] * rv * ca + a2[2] * ru * sa,
      ]);
      const k = dru * ca * ca + drv * sa * sa;
      const nv = v3unit([
        e[0] - t[0] * k,
        e[1] - t[1] * k,
        e[2] - t[2] * k,
      ]);
      nor.push(nv[0], nv[1], nv[2]);
    }
  }

  const bands = o.closed ? n : n - 1;
  for (let j = 0; j < bands; j++) {
    const j2 = (j + 1) % n;
    for (let i = 0; i < SEG; i++) {
      const i2 = (i + 1) % SEG;
      const a = j * SEG + i;
      const b = j * SEG + i2;
      const c = j2 * SEG + i;
      const e = j2 * SEG + i2;
      idx.push(a, c, b, b, c, e);
    }
  }

  if (!o.closed && o.cap) {
    for (const end of [0, n - 1]) {
      const first = end === 0;
      const t = v3unit(
        first
          ? v3sub(path[1].p, path[0].p)
          : v3sub(path[n - 1].p, path[n - 2].p)
      );
      const sgn = first ? -1 : 1;
      const ci = pos.length / 3;
      pos.push(path[end].p[0], path[end].p[1], path[end].p[2]);
      nor.push(t[0] * sgn, t[1] * sgn, t[2] * sgn);
      for (let i = 0; i < SEG; i++) {
        const a = end * SEG + i;
        const b = end * SEG + ((i + 1) % SEG);
        if (first) idx.push(ci, a, b);
        else idx.push(ci, b, a);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
