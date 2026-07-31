/* Adriano Jewelry — shared model geometry toolkit.
 *
 * Every shell a model here needs is the same construction: a rounded
 * rectangle outline swept vertically through a 2D edge profile, plus flat
 * caps cut from the same outline. This file is that toolkit and nothing
 * else; each model under assets/js/models/ composes it into a prop.
 *
 * The profile is a list of { i, y } stations — i is the inset from the
 * nominal wall (0 at the wall, positive pulls inward), y the height. The
 * corner radius tightens as the outline insets and is floored at rMin, so a
 * deep chamfer keeps a drawn corner instead of collapsing to a point.
 * Normals are computed per profile segment and smoothed across stations
 * unless the bend is sharper than the crease threshold (or a station is
 * marked hard), which splits the ring so the shading breaks where the
 * surface does.
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
