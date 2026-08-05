/* Adriano Jewelry: the ring box model.
 *
 * The store's black lidded LED ring box, complete in this one module: swept
 * shells for base and lid, velvet cushion with the ring slot cut between its
 * pads, the lamp in the lid with its spot, spill, lens bloom and a faint
 * drawn beam, and the Adriano branding painted onto canvases: a black marble
 * inlay flush in the lid's plateau, the crown-and-diamond crest printed on
 * the front of the lid, the wordmark on the front of the base.
 *
 * The one thing it does not build itself is the ring standing in that slot.
 * That is its own prop in its own module, solitaire-ring.js, and this file
 * only seats it; the box is the case, and a case holds whatever the bench
 * puts in it.
 *
 * The stage (home.js) owns the renderer, camera, studio and ground; a model
 * module owns one prop. The contract a model exports:
 *
 *   createRingBox({ renderer, ring }) -> {
 *     root,                  a Group to add to the scene
 *     metrics,               seat and shell numbers, for a stage that
 *                            places the pieces itself
 *     update({ open, lit }), applies eased state each frame (0..1 each)
 *     framing(open),         { cy, cr } bounding sphere for camera fit
 *   }
 *
 * `ring` is optional: pass a solitaire handle and the box computes the seat
 * for that ring without taking it, so a caller who needs the pieces to part
 * ways mid-shot can keep every prop at the top of its own scene. Left out,
 * the box builds and seats its own ring, as it always has.
 *
 * drawArtwork() is exported separately so the stage's ?flat=1 debug view can
 * inspect all three paintings without standing the scene up.
 */

import * as THREE from "../vendor/three.module.min.js";
import { sweep, quarterIn, capGeometry } from "./geometry.js";
import { createSolitaireRing } from "./solitaire-ring.js";

/* ------------------------------------------------------------------ marque
 * Painted once, synchronously: system serifs and canvas paths only, so the
 * first rendered frame already carries the finished artwork. */

// Deterministic RNG (mulberry32). The marble must not re-vein per visit.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MARQUE_W = 2048;
const MARQUE_H = 1680; // plateau aspect: 4.48 x 3.68

function goldGradient(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0.0, "#f9eec6");
  g.addColorStop(0.16, "#f3da8e");
  g.addColorStop(0.36, "#e5bc5d");
  g.addColorStop(0.55, "#cd973c");
  g.addColorStop(0.74, "#a86f22");
  g.addColorStop(0.9, "#8d5817");
  g.addColorStop(1.0, "#7c4b12");
  return g;
}

/* Fill a path with the gold treatment: the vertical foil gradient and a dark
 * inner edge. Shadow and the emblem outline are applied once to the whole
 * gold layer in drawMarque, not per piece. */
function goldPath(ctx, path, y0, y1) {
  ctx.save();
  ctx.fillStyle = goldGradient(ctx, y0, y1);
  ctx.fill(path);
  ctx.strokeStyle = "rgba(46,26,4,0.5)";
  ctx.lineWidth = 1.6;
  ctx.stroke(path);
  ctx.restore();
}

function crownPath() {
  const p = new Path2D();
  // Band, arched so its underside dips with the circlet.
  p.moveTo(-150, -12);
  p.quadraticCurveTo(0, 2, 150, -12);
  p.lineTo(150, -50);
  p.quadraticCurveTo(0, -36, -150, -50);
  p.closePath();
  // Five points, concave sided, the centre one tallest.
  const spike = (bx, apexX, apexY, halfW) => {
    p.moveTo(bx - halfW, -46);
    p.bezierCurveTo(
      bx - halfW * 0.4,
      -46 + (apexY + 46) * 0.45,
      apexX - halfW * 0.18,
      apexY + 26,
      apexX,
      apexY
    );
    p.bezierCurveTo(
      apexX + halfW * 0.18,
      apexY + 26,
      bx + halfW * 0.4,
      -46 + (apexY + 46) * 0.45,
      bx + halfW, -46
    );
    p.closePath();
  };
  spike(0, 0, -170, 26);
  spike(-72, -78, -138, 22);
  spike(72, 78, -138, 22);
  spike(-126, -138, -104, 18);
  spike(126, 138, -104, 18);
  // Pearls on every point.
  const pearl = (x, y, r) => {
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, Math.PI * 2);
  };
  pearl(0, -182, 13);
  pearl(-78, -150, 11);
  pearl(78, -150, 11);
  pearl(-138, -115, 10);
  pearl(138, -115, 10);
  return p;
}

function drawCrown(ctx, tx, ty, s) {
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(s, s);
  goldPath(ctx, crownPath(), -195, 2);
  ctx.restore();
}

/* Brilliant-cut diamond, front on: gold stone, facets engraved in dark
 * strokes, hatched the way the marque prints it. */
function drawDiamond(ctx, tx, ty, s) {
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(s, s);
  const outline = new Path2D(
    "M -115 0 L 115 0 L 220 118 L 0 300 L -220 118 Z"
  );
  goldPath(ctx, outline, 0, 300);
  ctx.save();
  ctx.clip(outline);
  // Engraved hatching, horizontal, denser than the facet lines but lighter.
  ctx.strokeStyle = "rgba(40,22,4,0.34)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let y = 12; y < 300; y += 15) {
    ctx.moveTo(-230, y);
    ctx.lineTo(230, y);
  }
  ctx.stroke();
  ctx.restore();
  // Facets.
  ctx.strokeStyle = "rgba(34,19,3,0.85)";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.stroke(outline);
  ctx.beginPath();
  ctx.moveTo(-220, 118);
  ctx.lineTo(220, 118); // girdle
  ctx.moveTo(-115, 0);
  ctx.lineTo(-73, 118); // crown facets
  ctx.moveTo(115, 0);
  ctx.lineTo(73, 118);
  ctx.moveTo(-115, 0);
  ctx.lineTo(-220, 118);
  ctx.moveTo(115, 0);
  ctx.lineTo(220, 118);
  ctx.moveTo(-73, 118);
  ctx.lineTo(0, 300); // pavilion
  ctx.moveTo(73, 118);
  ctx.lineTo(0, 300);
  ctx.stroke();
  ctx.restore();
}

function drawMarble(ctx, rand) {
  ctx.fillStyle = "#07080a";
  ctx.fillRect(0, 0, MARQUE_W, MARQUE_H);

  // Broad tonal drift so the slab is not one flat value.
  for (let i = 0; i < 4; i++) {
    const x = rand() * MARQUE_W;
    const y = rand() * MARQUE_H;
    const r = 500 + rand() * 600;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(26,29,35,0.55)");
    g.addColorStop(1, "rgba(26,29,35,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, MARQUE_W, MARQUE_H);
  }

  // Veins: short wandering steps smoothed through their midpoints, a wide
  // blurred pass for the mineral cloud and a faint sharp pass on top of it.
  const vein = (x0, y0, angle, steps, alpha, width) => {
    const pts = [[x0, y0]];
    let a = angle;
    let x = x0;
    let y = y0;
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 1.15;
      // Pulled back toward its heading so it wanders without doubling back.
      a = a * 0.84 + angle * 0.16;
      const len = 24 + rand() * 36;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      pts.push([x, y]);
    }
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(
          pts[i][0], pts[i][1],
          (pts[i][0] + pts[i + 1][0]) / 2,
          (pts[i][1] + pts[i + 1][1]) / 2
        );
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.strokeStyle = `rgba(206,214,226,${alpha * 0.16})`;
    ctx.lineWidth = width * 7;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(206,214,226,0.45)";
    ctx.shadowBlur = 28;
    trace();
    ctx.restore();
    // Mineral cloud dabs along the vein.
    for (let i = 0; i < pts.length; i += 4) {
      const g = ctx.createRadialGradient(
        pts[i][0], pts[i][1], 0, pts[i][0], pts[i][1], 60 + rand() * 130
      );
      g.addColorStop(0, `rgba(200,208,220,${0.018 + rand() * 0.02})`);
      g.addColorStop(1, "rgba(200,208,220,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, MARQUE_W, MARQUE_H);
    }
    ctx.save();
    ctx.strokeStyle = `rgba(226,231,240,${alpha * 0.4})`;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(226,231,240,0.55)";
    ctx.shadowBlur = 9;
    trace();
    ctx.restore();
    return pts;
  };

  for (let i = 0; i < 5; i++) {
    const fromLeft = rand() > 0.5;
    const pts = vein(
      fromLeft ? -60 : MARQUE_W + 60,
      rand() * MARQUE_H,
      fromLeft ? (rand() - 0.5) * 0.8 : Math.PI - (rand() - 0.5) * 0.8,
      30 + Math.floor(rand() * 16),
      0.2 + rand() * 0.18,
      1.1 + rand() * 1.3
    );
    // Branches off a few of the vein's own joints.
    for (let b = 0; b < 2; b++) {
      const at = pts[2 + Math.floor(rand() * (pts.length - 3))];
      vein(at[0], at[1], rand() * Math.PI * 2, 8 + Math.floor(rand() * 6),
        0.1 + rand() * 0.08, 0.8);
    }
  }
  for (let i = 0; i < 9; i++) {
    vein(rand() * MARQUE_W, rand() * MARQUE_H, rand() * Math.PI * 2,
      6 + Math.floor(rand() * 8), 0.05 + rand() * 0.07, 0.7);
  }

  // Mineral speckle, then the corners pressed down.
  for (let i = 0; i < 700; i++) {
    const l = rand();
    ctx.fillStyle =
      l > 0.5
        ? `rgba(220,226,234,${0.015 + rand() * 0.035})`
        : `rgba(0,0,0,${0.04 + rand() * 0.05})`;
    ctx.fillRect(rand() * MARQUE_W, rand() * MARQUE_H, 1.6, 1.6);
  }
  const vg = ctx.createRadialGradient(
    MARQUE_W / 2, MARQUE_H / 2, MARQUE_H * 0.35,
    MARQUE_W / 2, MARQUE_H / 2, MARQUE_H * 0.95
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, MARQUE_W, MARQUE_H);
}

/** The plateau inlay: marble and nothing else. The gold used to be printed
 * here too, and on a lid seen this close to edge-on it was never once
 * legible; it has gone to the two faces that actually turn toward a reader,
 * and the slab is left to do what a slab does. */
export function drawPlateau() {
  const c = document.createElement("canvas");
  c.width = MARQUE_W;
  c.height = MARQUE_H;
  drawMarble(c.getContext("2d"), rng(20260731));
  return c;
}

/* Finish a set of gold pieces as ONE drawn mark, on a transparent ground:
 * a thin light contour laid under the whole union (the painted layer's own
 * silhouette, dilated by stamping it round a ring of offsets) and a single
 * drop shadow wrapping everything once. Per piece, both of those would have
 * each part outlining and shadowing its neighbours, which is what parts
 * floating on a card look like rather than one struck emblem.
 *
 * `weight` scales the contour and the shadow with the canvas, since both are
 * in pixels and each mark is authored at whatever resolution its face needs. */
function goldSet(w, h, weight, paint) {
  const art = document.createElement("canvas");
  art.width = w;
  art.height = h;
  paint(art.getContext("2d"));

  const outline = document.createElement("canvas");
  outline.width = w;
  outline.height = h;
  const o = outline.getContext("2d");
  const OW = 4 * weight;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    o.drawImage(art, Math.cos(ang) * OW, Math.sin(ang) * OW);
  }
  o.globalCompositeOperation = "source-in";
  o.fillStyle = "#e9c46a";
  o.fillRect(0, 0, w, h);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 16 * weight;
  ctx.shadowOffsetY = 9 * weight;
  ctx.drawImage(outline, 0, 0);
  ctx.restore();
  ctx.drawImage(art, 0, 0);
  return c;
}

/* The crest, worn on the lid's front: the crown over the stone it crowns.
 * Sized so the pair just fills the canvas with room for the contour, because
 * the decal is fitted to the lid by ARC LENGTH and any slack here would come
 * off the mark rather than off the box. */
const CREST_W = 912;
const CREST_H = 1240;

export function drawCrest() {
  return goldSet(CREST_W, CREST_H, 2, (a) => {
    drawCrown(a, CREST_W / 2, 541, 2.56);
    drawDiamond(a, CREST_W / 2, 633, 1.88);
  });
}

/* The name, worn on the base's front. */
const WORD_W = 1400;
const WORD_H = 620;

const FACE =
  '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, "Times New Roman", serif';

/* One line of the wordmark, FITTED to a width rather than set at a size.
 * System serifs only, so nothing ever waits on a font, but that means the
 * face is Palatino on one machine and Georgia on the next and Georgia sets a
 * good deal wider: at a fixed size the name overhangs the box here and swims
 * in it there. Two passes converge, because the tracking is a fraction of a
 * size the first measurement does not know yet. */
function word(ctx, text, targetW, baseline, track) {
  ctx.save();
  ctx.textAlign = "center";
  let size = (targetW / Math.max(text.length, 1)) * 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.font = `italic 700 ${size}px ${FACE}`;
    try {
      ctx.letterSpacing = size * track + "px";
    } catch (e) {
      /* older engines: tracking is a nicety */
    }
    const m = ctx.measureText(text).width;
    if (m > 1) size *= targetW / m;
  }
  ctx.translate(WORD_W / 2, baseline);
  ctx.fillStyle = goldGradient(ctx, -size * 0.74, size * 0.22);
  ctx.fillText(text, 0, 0);
  ctx.strokeStyle = "rgba(46,26,4,0.4)";
  ctx.lineWidth = Math.max(1, size * 0.0062);
  ctx.strokeText(text, 0, 0);
  ctx.restore();
}

export function drawWordmark() {
  return goldSet(WORD_W, WORD_H, 1.6, (a) => {
    word(a, "Adriano", 1128, 312, 0.028);
    word(a, "Jewelry", 636, 492, 0.078);
  });
}

/** ?flat=1: the three paintings on one sheet, at the sizes they take on the
 * box, for checking the artwork without standing the scene up. The box wears
 * them on three different faces; this is a proof, not a layout. */
export function drawArtwork() {
  const c = document.createElement("canvas");
  c.width = MARQUE_W;
  c.height = MARQUE_H;
  const ctx = c.getContext("2d");
  ctx.drawImage(drawPlateau(), 0, 0);
  // World heights, as set on the shells below, scaled to the plateau's own
  // 3.68cm of canvas so the two marks are shown at their true relative size.
  const k = MARQUE_H / 3.68;
  const put = (art, worldH, cy) => {
    const h = worldH * k;
    const w = (h * art.width) / art.height;
    ctx.drawImage(art, (MARQUE_W - w) / 2, cy - h / 2, w, h);
  };
  put(drawCrest(), CREST_ARC, MARQUE_H * 0.3);
  put(drawWordmark(), WORD_ARC, MARQUE_H * 0.72);
  return c;
}

/* ------------------------------------------------------------------ decals
 * How the two marks are WORN: where each one starts up the front wall of its
 * own shell, and how far it runs measured along that wall. Arc length rather
 * than height, because the lid's front is not a wall but a pillow, and a mark
 * laid on by height would squash toward the top of it. */
const CREST_AT = 0.4; // lid-local, above the seam
const CREST_ARC = 1.26;
const WORD_AT = 0.58; // base-local, above the foot
const WORD_ARC = 1.55;

/** A decal lying ON a swept shell's front wall: the shell's own profile,
 * resampled by arc length through the window the mark occupies, extruded
 * across x and lifted a hair along the surface normal. Flat where the wall is
 * flat and curved where it pillows, so the mark wraps the lid the way a foil
 * stamp does instead of floating over it on a card.
 *
 * The window's width is DERIVED from the art's own aspect, so nothing here
 * can stretch a mark; ask for a taller one and it gets wider by itself.
 * Front only: within +-(w/2 - r) the outline's front edge is dead straight,
 * so two columns describe it exactly. */
function frontDecal(profile, d, at, arc, aspect, lift) {
  // Walk the profile as a polyline, measuring as we go. Linear steps between
  // stations lie exactly on the mesh, since the mesh is flat between rings.
  const pts = [[profile[0].i, profile[0].y]];
  const len = [0];
  for (let j = 0; j < profile.length - 1; j++) {
    const a = profile[j];
    const b = profile[j + 1];
    const l = Math.hypot(b.i - a.i, b.y - a.y);
    if (l < 1e-9) continue; // stations meeting at a crease
    pts.push([b.i, b.y]);
    len.push(len[len.length - 1] + l);
  }
  // Where the mark starts, in arc.
  let s0 = 0;
  for (let k = 1; k < pts.length; k++) {
    if (pts[k][1] >= at) {
      const t = (at - pts[k - 1][1]) / (pts[k][1] - pts[k - 1][1] || 1);
      s0 = len[k - 1] + (len[k] - len[k - 1]) * t;
      break;
    }
  }
  const at_ = (s) => {
    let k = 1;
    while (k < pts.length - 1 && len[k] < s) k++;
    const t = (s - len[k - 1]) / (len[k] - len[k - 1] || 1);
    const a = pts[k - 1];
    const b = pts[k];
    const di = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(di, dy) || 1;
    // The shell's own outward normal where the outline faces +z.
    return {
      i: a[0] + di * t,
      y: a[1] + dy * t,
      ny: di / l,
      nz: dy / l,
    };
  };

  const halfW = (arc * aspect) / 2;
  const ROWS = 16;
  const COLS = 2;
  const pos = [];
  const nor = [];
  const uv = [];
  for (let r = 0; r <= ROWS; r++) {
    const f = r / ROWS;
    const p = at_(s0 + arc * f);
    for (let c = 0; c <= COLS; c++) {
      const g = c / COLS;
      pos.push(
        -halfW + 2 * halfW * g,
        p.y + p.ny * lift,
        d / 2 - p.i + p.nz * lift
      );
      nor.push(0, p.ny, p.nz);
      uv.push(g, f);
    }
  }
  const idx = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = r * (COLS + 1) + c;
      const b = a + 1;
      const u = a + COLS + 1;
      idx.push(a, b, u, b, u + 1, u);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------- model */

export function createRingBox({ renderer, debug, ring: givenRing }) {
  const dbg = debug || {};
  /* Dimensions, in centimetres of an imagined bench. One place, so the box
   * can be resized like a real product spec. */
  const W = 6.0; // outer width (x)
  const D = 5.2; // outer depth (z)
  const R = 0.78; // outer corner radius
  const BASE_H = 2.5;
  const LID_H = 1.9;
  const PLATEAU_IN = 0.76; // lid top chamfer inset
  const CAV_W = 4.95; // base cavity
  const CAV_D = 4.15;
  const CAV_R = 0.55;
  const CAV_Y = 0.55; // its velvet floor, and the bottom of the ring slot
  const REC_W = 4.8; // lid recess
  const REC_D = 4.0;
  const REC_R = 0.5;
  /* How deep the lid is hollowed out, and so how high the ceiling stands over
   * the base's rim when the box is shut. This is the number the stone lives
   * under: it is what the seat below spends, and a box sold with a two-carat
   * solitaire in it is hollowed for one. Everything in the lid (the lamp
   * housing, its face, the lens, the light itself) hangs off this. */
  const REC_H = 0.62;
  const PAD_TOP = 1.94; // the cushion's crown, where the ring stands out of
  const OPEN_ANGLE = -1.72; // ~98.5 deg past closed

  const satin = new THREE.MeshPhysicalMaterial({
    color: 0x121214,
    roughness: 0.44,
    metalness: 0,
    ior: 1.62,
    specularIntensity: 1,
  });
  const velvet = new THREE.MeshPhysicalMaterial({
    color: 0x0c0c0e,
    roughness: 1,
    metalness: 0,
    sheen: 1,
    sheenColor: 0x36363c,
    sheenRoughness: 0.62,
    specularIntensity: 0.12,
  });
  const liner = new THREE.MeshPhysicalMaterial({
    color: 0x0c0c0e,
    roughness: 1,
    metalness: 0,
    specularIntensity: 0.12,
  });
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const marqueTex = new THREE.CanvasTexture(drawPlateau());
  marqueTex.colorSpace = THREE.SRGBColorSpace;
  marqueTex.anisotropy = aniso;
  const marque = new THREE.MeshPhysicalMaterial({
    map: marqueTex,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    specularIntensity: 1,
  });
  marque.envMapIntensity = 1.35;
  /* The two gold marks. Transparent, because each is a mark on a ground
   * rather than a panel: the satin has to come through everywhere the gold
   * is not. depthWrite off and a breath of polygon offset keep them out of
   * the shell's own depth without a lip, since they are printed on it rather
   * than stuck to it. Same finish as the plateau, so all three read as one
   * process on one box. */
  const goldDecal = (art) => {
    const tex = new THREE.CanvasTexture(art);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    const m = new THREE.MeshPhysicalMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.75,
      clearcoatRoughness: 0.28,
      specularIntensity: 1,
    });
    m.envMapIntensity = 1.35;
    return m;
  };
  const lens = new THREE.MeshStandardMaterial({
    color: 0xd8dde3,
    roughness: 0.35,
    emissive: 0xffffff,
    emissiveIntensity: 0,
  });

  const root = new THREE.Group();

  const mesh = (geo, mat, opts) => {
    const m = new THREE.Mesh(geo, mat);
    if (opts && opts.cast) m.castShadow = true;
    if (opts && opts.receive) m.receiveShadow = true;
    return m;
  };

  // Base shell.
  {
    const profile = [];
    quarterIn(profile, 0.2, 0, 0, 0.2, 4);
    profile.push({ i: 0, y: 2.38 });
    quarterIn(profile, 0, 2.38, 0.12, BASE_H, 4);
    root.add(
      mesh(sweep(W, D, R, profile), satin, { cast: true, receive: true })
    );
    // The name, printed across the front wall.
    root.add(
      mesh(
        frontDecal(profile, D, WORD_AT, WORD_ARC, WORD_W / WORD_H, 0.004),
        goldDecal(drawWordmark()),
        { receive: true }
      )
    );
    // Rim, cavity walls, velvet floor, underside.
    const rim = mesh(
      capGeometry(W - 0.24, D - 0.24, R - 0.12, true, {
        w: CAV_W,
        d: CAV_D,
        r: CAV_R,
      }),
      satin,
      { receive: true }
    );
    rim.position.y = BASE_H;
    root.add(rim);
    root.add(
      mesh(
        sweep(CAV_W, CAV_D, CAV_R, [
          { i: 0, y: CAV_Y },
          { i: 0, y: BASE_H },
        ], { flip: true }),
        satin,
        { receive: true }
      )
    );
    const floor = mesh(capGeometry(CAV_W, CAV_D, CAV_R, true), liner, {
      receive: true,
    });
    floor.position.y = CAV_Y;
    root.add(floor);
    const under = mesh(capGeometry(W - 0.4, D - 0.4, R - 0.2, false), satin);
    under.position.y = 0.001;
    root.add(under);
  }

  // Cushion: two velvet pads with the ring slot between them.
  {
    const padW = 4.62;
    const padD = 1.82;
    // The ring's seat. The solitaire's widest section is 2.36mm across and
    // this gap is 2.4mm, so the band drops in and is gripped, the same fit
    // the real cushion is die-cut for.
    const slit = 0.24;
    const profile = [];
    profile.push({ i: 0, y: CAV_Y });
    profile.push({ i: 0, y: 1.6 });
    quarterIn(profile, 0, 1.6, 0.34, PAD_TOP, 5);
    for (const dz of [-1, 1]) {
      const pad = mesh(
        sweep(padW, padD, 0.3, profile, { rMin: 0.1, cSeg: 8 }),
        velvet,
        { cast: true, receive: true }
      );
      pad.position.z = dz * (slit / 2 + padD / 2);
      root.add(pad);
      const cap = mesh(
        capGeometry(padW - 0.68, padD - 0.68, 0.12, true),
        velvet,
        { receive: true }
      );
      cap.position.set(0, PAD_TOP, pad.position.z);
      root.add(cap);
    }
  }

  /* The ring, stood in that slot. Its height is arithmetic rather than
   * taste, and it is pinned between two hard facts: the band hangs
   * metrics.drop below the finger's centre and cannot go through the velvet
   * floor, and the piece stands metrics.rise above it (the table of the
   * stone, since v0.2.5) and cannot go up through the closed lid's ceiling.
   * Take whichever seat is lower, so neither a resized ring nor a resized box
   * can put metal or stone through plastic. As drawn the ring rests in the
   * slot and the table clears the shut lid by 1.5mm. */
  /* A caller may hand in a ring it intends to keep for itself. The scroll
   * stage does: pieces that part ways mid-journey have to live at the top of
   * the scene rather than inside each other, so the box only does the seat
   * arithmetic for the guest and the caller places it there. Without a guest
   * the box builds and keeps its own ring, exactly as before. */
  const ownsRing = !givenRing;
  const ring = givenRing || createSolitaireRing({ renderer });
  const seat = (() => {
    const NAP = 0.035; // the velvet's own pile, under the band
    const HEADROOM = 0.12; // what the piece keeps clear of the shut lid
    const y = Math.min(
      CAV_Y + ring.metrics.drop + NAP,
      BASE_H + REC_H - HEADROOM - ring.metrics.rise
    );
    if (ownsRing) {
      ring.root.position.y = y;
      root.add(ring.root);
    }
    return y;
  })();
  // Where the stone's girdle stands once it is lifted right out of the box.
  const STONE_UP = seat + ring.metrics.stone.girdleY + ring.metrics.stone.lift;

  // Lid, hinged along the back rim.
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, BASE_H, -(D / 2 - 0.1));
  root.add(lidPivot);
  const lid = new THREE.Group();
  lid.position.z = D / 2 - 0.1;
  lidPivot.add(lid);
  let lensMesh;
  {
    const profile = [];
    quarterIn(profile, 0.1, 0, 0, 0.1, 3);
    profile.push({ i: 0, y: 0.72 });
    // The plateau chamfer: a near-straight climb with a breath of pillow.
    const P0 = [0, 0.72];
    const P1 = [0.16, 1.34];
    const P2 = [0.62, 1.78];
    for (let s = 1; s <= 6; s++) {
      const t = s / 6;
      const u = 1 - t;
      profile.push({
        i: u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0],
        y: u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1],
      });
    }
    quarterIn(profile, 0.62, 1.78, PLATEAU_IN, LID_H, 3);
    lid.add(mesh(sweep(W, D, R, profile), satin, { cast: true, receive: true }));
    // The crest, printed over the pillow the lid's front is.
    lid.add(
      mesh(
        frontDecal(profile, D, CREST_AT, CREST_ARC, CREST_W / CREST_H, 0.004),
        goldDecal(drawCrest()),
        { receive: true }
      )
    );

    // The plateau inlay.
    const plate = mesh(
      capGeometry(W - 2 * PLATEAU_IN, D - 2 * PLATEAU_IN, 0.3, true),
      marque
    );
    plate.position.y = LID_H;
    lid.add(plate);

    // Underside: rim ring, recess walls, recess ceiling.
    const ring = mesh(
      capGeometry(W - 0.2, D - 0.2, R - 0.1, false, {
        w: REC_W,
        d: REC_D,
        r: REC_R,
      }),
      satin
    );
    ring.position.y = 0.002;
    lid.add(ring);
    lid.add(
      mesh(
        sweep(REC_W, REC_D, REC_R, [
          { i: 0, y: 0 },
          { i: 0, y: REC_H },
        ], { flip: true }),
        satin,
        { receive: true }
      )
    );
    const ceiling = mesh(capGeometry(REC_W, REC_D, REC_R, false), liner, {
      receive: true,
    });
    ceiling.position.y = REC_H;
    lid.add(ceiling);

    // Lamp housing on the recess ceiling, out by the free edge, lens in its
    // face. This is the box the photograph shows: the light lives in the lid
    // and looks down at the ring.
    const housingProfile = [];
    quarterIn(housingProfile, 0.05, 0, 0, 0.05, 2);
    housingProfile.push({ i: 0, y: 0.2 });
    const housing = mesh(
      sweep(1.15, 0.62, 0.2, housingProfile, { rMin: 0.06, cSeg: 6, sSeg: 2 }),
      satin
    );
    housing.rotation.x = Math.PI;
    housing.position.set(0, REC_H, 1.45);
    lid.add(housing);
    const housingFace = mesh(capGeometry(1.15, 0.62, 0.2, false), satin);
    housingFace.position.set(0, REC_H - 0.2, 1.45);
    lid.add(housingFace);
    lensMesh = mesh(capGeometry(0.58, 0.3, 0.13, false), lens);
    lensMesh.position.set(0, REC_H - 0.205, 1.45);
    lid.add(lensMesh);
  }

  // The lamp: a spot from the lens down onto the ring in the slot, a point
  // for the spill inside the lid, a sprite for the bloom on the lens, a
  // faint cone for the air the beam crosses.
  const ledTarget = new THREE.Object3D();
  ledTarget.position.set(0, 1.9, 0.35);
  root.add(ledTarget);

  const led = new THREE.SpotLight(0xf7fbff, 0, 12, 0.45, 0.7, 1.3);
  led.position.set(0, REC_H - 0.26, 1.45);
  led.target = ledTarget;
  /* Declared once and left alone. Whether a light casts is part of three's
   * program cache key, so flipping it as the lamp comes up is a full
   * recompile of every material on the stage inside one frame, measured at
   * three seconds, which is long enough to eat the entire lid-opening beat
   * and make the lamp look as though it only arrives with the ring. The
   * per-light `shadow.autoUpdate` below saves the same raster without the
   * program ever changing. */
  led.castShadow = dbg.ledshadow !== "0";
  led.shadow.autoUpdate = false;
  led.shadow.mapSize.set(1024, 1024);
  led.shadow.camera.near = 0.1;
  led.shadow.camera.far = 10;
  led.shadow.bias = -0.0004;
  led.shadow.normalBias = 0.015;
  lid.add(led);

  /* THE SPILL IS WHAT MAKES THE LAMP VISIBLE, and until v0.4.0 it did not
   * reach far enough to be seen at all.
   *
   * The lamp itself is at the lid's FREE edge, which is the one place on the
   * box that a standing lid puts out of the shot: past 98.5 degrees the free
   * edge has swung behind the hinge and above the rim, so the lens and its
   * bloom end up at the far top of a recess the camera is looking into
   * almost edge-on. Everything downstream was working; there was simply
   * nothing in frame that was ON. The reader read the beat that says "It
   * opens with its own light" against a lid whose inside was solid black,
   * and reported, correctly, that the light only ever turns up later, when
   * the rising ring finally carries some of it into view.
   *
   * So the evidence moves to where the camera IS looking, which is the inside
   * of the lid: a point at nine, reaching six units instead of three, which
   * is the recess's own diagonal. The recess ceiling and walls then carry the
   * lamp's falloff across the whole of that black rectangle, and a lit
   * interior is what a lit box looks like from the front. */
  const ledSpill = new THREE.PointLight(0xf7fbff, 0, 6, 2);
  ledSpill.position.set(0, REC_H - 0.32, 1.42);
  lid.add(ledSpill);

  let glowSprite;
  {
    const g = document.createElement("canvas");
    g.width = g.height = 128;
    const gc = g.getContext("2d");
    const gg = gc.createRadialGradient(64, 64, 2, 64, 64, 62);
    gg.addColorStop(0, "rgba(255,255,255,0.9)");
    gg.addColorStop(0.35, "rgba(240,246,255,0.28)");
    gg.addColorStop(1, "rgba(240,246,255,0)");
    gc.fillStyle = gg;
    gc.fillRect(0, 0, 128, 128);
    glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(g),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    /* BIG ENOUGH TO REACH DOWN INTO THE SHOT. The lamp sits at the lid's free
     * edge and the opening chapter frames the BOX, so once the lid is
     * standing the lamp itself is above the top of the viewport: measured at
     * p 0.20, the brightest pixel anywhere in the top quarter of the frame was
     * 12 of 255, and it was the beam, not the lamp. A bloom a sixth of the
     * box across cannot be seen from outside the frame. At two and a half
     * units it spills down over the lid's inner wall the way a real one does,
     * which is the only part of it the reader was ever going to see. */
    glowSprite.scale.setScalar(2.5);
    glowSprite.position.set(0, REC_H - 0.26, 1.42);
    lid.add(glowSprite);
  }

  /* The lamp's reach beyond the box: a glow line breathing through the seam
   * when the lid only cracks, and a pool of spill on the floor around the
   * box. Only light the lamp itself would actually throw: no drawn shafts
   * in the air (tried in v0.2.3, removed on request). Every opacity below
   * is driven from update() by how open and how lit the box is. */
  let seamGlow;
  {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d");
    const h = g.createLinearGradient(0, 0, 256, 0);
    h.addColorStop(0, "rgba(240,246,255,0)");
    h.addColorStop(0.25, "rgba(240,246,255,0.85)");
    h.addColorStop(0.75, "rgba(240,246,255,0.85)");
    h.addColorStop(1, "rgba(240,246,255,0)");
    g.fillStyle = h;
    g.fillRect(0, 0, 256, 64);
    const v = g.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.5, "rgba(0,0,0,1)");
    v.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = v;
    g.fillRect(0, 0, 256, 64);
    seamGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.9, 0.55),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      })
    );
    seamGlow.position.set(0, BASE_H + 0.06, D / 2 + 0.04);
    seamGlow.visible = false;
    root.add(seamGlow);
  }

  let floorPool;
  {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const r = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    r.addColorStop(0, "rgba(238,244,255,0.5)");
    r.addColorStop(0.5, "rgba(238,244,255,0.16)");
    r.addColorStop(1, "rgba(238,244,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
    floorPool = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    floorPool.rotation.x = -Math.PI / 2;
    floorPool.position.set(0, 0.006, 0.9);
    floorPool.visible = false;
    root.add(floorPool);
  }

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.7, 1, 40, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uO: { value: 0 } },
      vertexShader:
        "varying float vT; varying vec3 vN; varying vec3 vV;" +
        "void main(){ vT = uv.y;" +
        " vN = normalMatrix * normal;" +
        " vec4 mv = modelViewMatrix * vec4(position, 1.0);" +
        " vV = -mv.xyz; gl_Position = projectionMatrix * mv; }",
      fragmentShader:
        "varying float vT; varying vec3 vN; varying vec3 vV; uniform float uO;" +
        "void main(){" +
        " float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);" +
        " float a = uO * rim * mix(0.12, 1.0, vT);" +
        " gl_FragColor = vec4(vec3(0.82, 0.88, 1.0) * a, a); }",
    })
  );
  beam.visible = false;
  root.add(beam);

  const lensWorld = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  return {
    root,

    /** The box's own numbers, for a stage that seats the pieces itself:
     * where a guest ring's origin sits, where a fully lifted stone's girdle
     * stands, the crown of the velvet the seated piece throws its light onto,
     * and the shell's outer dimensions for composing a shot. baseH doubles as
     * the height of the lid seam, since the lid parts exactly on the rim. */
    metrics: {
      seatY: seat,
      stoneUpY: STONE_UP,
      cushionY: PAD_TOP,
      width: W,
      depth: D,
      baseH: BASE_H,
      lidH: LID_H,
      openAngle: OPEN_ANGLE,
    },

    /** Applies eased state: open, lit and lift all run 0..1 (springs may
     * overshoot slightly; everything here tolerates it). */
    update(state) {
      const { open, lit } = state;
      lidPivot.rotation.x = OPEN_ANGLE * open;
      /* The ring is lit by this box and nothing else: hand it the lamp. It
       * also gets told how much of it can be seen at all, because a stone
       * shut in a black box must not throw its flare out through the lid.
       * A guest ring is the caller's to drive, with these same numbers. */
      if (ownsRing) {
        ring.update({
          lit,
          lift: state.lift || 0,
          spin: state.spin || 0,
          eye: state.eye,
          reveal: THREE.MathUtils.smoothstep(open, 0.02, 0.3),
        });
      }

      /* EVERY ONE OF THESE USED TO WAIT FOR A LID THAT WAS MOSTLY OPEN, and
       * that is the second half of the reader's report (v0.4.0). The lamp
       * holds at full from the first frame (v0.3.7) but nothing that SHOWS it
       * did: the bloom waited for the lid to be a fifth open, the shaft for
       * nearly a half, the pool on the floor for two fifths. A lamp whose
       * every visible sign arrives late is a lamp that arrives late, whatever
       * its intensity says, and the beat it plays under is the one that
       * promises a box with a light in it.
       *
       * They now come up with the crack, in the same breath as the seam glow
       * that is already there, and hold. The gate cannot go to zero: the shut
       * box has to stay shut, and a bloom drawn on the outside of a closed lid
       * would be a lamp shining through wood. */
      const openFade = THREE.MathUtils.smoothstep(open, 0.02, 0.2);
      led.intensity = 900 * lit * (parseFloat(dbg.ledx) || 1);
      // An unlit lamp must not bill for a shadow pass: three renders a
      // light's map regardless of intensity. Redrawing it is what the map
      // costs, so that is what stands down: on the frames the lamp is dark,
      // and on the frames nothing has moved since the last one. A stale map
      // under an intensity of zero contributes exactly nothing.
      led.shadow.needsUpdate =
        state.moved !== false && lit > 0.004 && dbg.ledshadow !== "0";
      ledSpill.intensity = 9 * lit * openFade;
      lens.emissiveIntensity = 5 * lit;
      glowSprite.material.opacity = 0.85 * lit * openFade;

      // The lamp's reach: the floor pool swells as the mouth opens; the
      // seam line glows only in the sliver between cracked and open.
      const crack =
        lit *
        THREE.MathUtils.smoothstep(open, 0.006, 0.05) *
        (1 - THREE.MathUtils.smoothstep(open, 0.18, 0.42));
      seamGlow.material.opacity = 0.7 * crack;
      seamGlow.visible = crack > 0.01;
      const poolFade = lit * openFade;
      floorPool.material.opacity = 0.75 * poolFade;
      floorPool.visible = poolFade > 0.01;

      const beamA = 0.5 * lit * openFade;
      beam.visible = beamA > 0.004;
      if (beam.visible) {
        beam.material.uniforms.uO.value = beamA;
        lensMesh.getWorldPosition(lensWorld);
        ledTarget.getWorldPosition(targetWorld);
        beamDir.subVectors(lensWorld, targetWorld);
        const len = beamDir.length() - 0.3;
        beam.scale.set(1, len, 1);
        beam.position.copy(targetWorld).addScaledVector(beamDir, 0.5);
        beam.quaternion.setFromUnitVectors(UP, beamDir.normalize());
      }
    },

    /** Bounding sphere for the camera: tight around the closed box, loose
     * around the standing lid, and then all the way in onto the stone once
     * it is lifted out. A box is a product shot, a lifted stone is not. */
    framing(state) {
      const open = state.open;
      const box = { cy: 2.0 + 1.6 * open, cr: 3.6 + 1.45 * open };
      const lift = state.lift || 0;
      if (lift < 0.002) return box;
      const k = THREE.MathUtils.smoothstep(lift, 0.02, 1);
      const s = ring.framing({ lift: 1 });
      return {
        cy: THREE.MathUtils.lerp(box.cy, STONE_UP, k),
        cr: THREE.MathUtils.lerp(box.cr, s.cr, k),
      };
    },
  };
}
