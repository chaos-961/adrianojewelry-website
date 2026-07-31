/* Adriano Jewelry — the ring box model.
 *
 * The store's black lidded LED ring box, complete in this one module: swept
 * shells for base and lid, velvet cushion with the empty ring slot, the lamp
 * in the lid with its spot, spill, lens bloom and a faint drawn beam, and
 * the Adriano marque — black marble under gold horses, crown, diamond and
 * wordmark — painted onto a canvas and inlaid flush in the lid's plateau.
 *
 * The stage (home.js) owns the renderer, camera, studio and ground; a model
 * module owns one prop. The contract a model exports:
 *
 *   createRingBox({ renderer }) -> {
 *     root,                  a Group to add to the scene
 *     update({ open, lit }), applies eased state each frame (0..1 each)
 *     framing(open),         { cy, cr } bounding sphere for camera fit
 *   }
 *
 * drawMarque() is exported separately so the stage's ?flat=1 debug view can
 * inspect the artwork without standing the scene up.
 */

import * as THREE from "../vendor/three.module.min.js";
import { sweep, quarterIn, capGeometry } from "./geometry.js";

/* ------------------------------------------------------------------ marque
 * Painted once, synchronously — system serifs and canvas paths only, so the
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

/* The rearing horse, facing right, assembled in a 100x140 box (y down) the
 * way a heraldic silhouette actually holds together: overlapping masses — a
 * capsule of a torso, an ellipse of a haunch, tapered strokes for neck,
 * legs, tail and mane — painted gold into an offscreen sprite and stamped
 * onto the marble once, so the drop shadow wraps the union rather than
 * every part shadowing its neighbours. */
let horseSprite = null;

function buildHorseSprite(s) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(100 * s);
  c.height = Math.ceil(140 * s);
  const x = c.getContext("2d");
  x.scale(s, s);
  const gold = goldGradient(x, 6, 140);
  x.fillStyle = gold;
  x.strokeStyle = gold;
  x.lineCap = "round";
  x.lineJoin = "round";

  // A smoothed thick polyline — every limb segment is one of these.
  const stroke = (pts, w) => {
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      x.quadraticCurveTo(
        pts[i][0], pts[i][1],
        (pts[i][0] + pts[i + 1][0]) / 2,
        (pts[i][1] + pts[i + 1][1]) / 2
      );
    }
    const l = pts[pts.length - 1];
    x.lineTo(l[0], l[1]);
    x.stroke();
  };
  const ell = (cx, cy, rx, ry, rot) => {
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
    x.fill();
  };
  // A leaf: two quadratic edges from base to tip. Mane locks, tail waves.
  const leaf = (bx, by, cx1, cy1, tx1, ty1, cx2, cy2, wb) => {
    x.beginPath();
    x.moveTo(bx, by - wb / 2);
    x.quadraticCurveTo(cx1, cy1, tx1, ty1);
    x.quadraticCurveTo(cx2, cy2, bx, by + wb / 2);
    x.closePath();
    x.fill();
  };
  // A hoof: a small wedge, toe slanting forward-down. Solid fill — under
  // the hoof's rotation the shared gradient would sample from the wrong
  // height and flash pale, and real hooves read darker than the coat.
  const hoof = (hx, hy, ang, len, hgt, tone) => {
    x.save();
    x.translate(hx, hy);
    x.rotate(ang);
    x.fillStyle = tone;
    x.beginPath();
    x.moveTo(-len * 0.5, -hgt * 0.5);
    x.lineTo(len * 0.42, -hgt * 0.5);
    x.lineTo(len * 0.62, hgt * 0.34);
    x.quadraticCurveTo(len * 0.5, hgt * 0.52, len * 0.2, hgt * 0.5);
    x.lineTo(-len * 0.5, hgt * 0.5);
    x.closePath();
    x.fill();
    x.restore();
    x.fillStyle = gold;
  };

  // Far hind leg first, so the near masses sit over it.
  stroke([[49.5, 86], [56.5, 97], [59.8, 107]], 8.5);
  stroke([[59.8, 107], [60.8, 119], [60.2, 131.5]], 4.1);
  hoof(61, 134.8, 0.16, 5.6, 4.6, "#6e430f");

  // Tail: a full falling S with two wave tips.
  stroke([[44.5, 73], [36.5, 81], [32.8, 94], [34.3, 108], [32.3, 120]], 9.2);
  leaf(33, 117, 30.2, 126, 31.8, 134.5, 36.4, 124, 7);
  leaf(35, 107, 40, 116, 39.4, 128, 33.2, 115, 6);

  // Hindquarters, torso, chest — the masses that make it read as muscle.
  ell(46.5, 81, 10.4, 13, -0.14);
  stroke([[46.5, 73], [49.8, 63], [52.8, 56]], 21);
  ell(53.4, 55, 10.2, 9.4, 0.2);

  // Near hind leg: gaskin into hock, cannon to the ground.
  stroke([[47, 86], [51.5, 97], [53.7, 106.5]], 9.4);
  stroke([[53.7, 106.5], [54.1, 117], [53.3, 131.5]], 4.3);
  hoof(54, 134.9, 0.12, 5.8, 4.8, "#77490f");

  // Neck, arched into the poll.
  stroke([[50.5, 48], [55, 37], [59.8, 24], [61.2, 20.5]], 17.5);
  stroke([[57, 31], [61, 23], [62.4, 20]], 12);

  // Head: skull, jaw, tapering muzzle, two ears.
  ell(62.4, 20.6, 5.3, 4.7, 0.5);
  ell(63.2, 24.8, 4.4, 3.9, 0.35);
  stroke([[62.5, 20.8], [67, 23], [70.4, 25]], 7.6);
  stroke([[68.5, 23.8], [73.8, 26.4]], 5);
  leaf(61, 15.5, 61.4, 11.3, 62.5, 8.4, 64.3, 12.4, 4.8);
  leaf(64.5, 15.8, 65.7, 11.8, 67.4, 9.2, 68.2, 13.3, 4.4);

  // Mane: four locks flowing back off the crest.
  leaf(58.5, 21, 51, 16, 43, 17, 52, 23, 7.5);
  leaf(54.5, 28, 46, 24.5, 39.8, 27, 47.5, 31.5, 8);
  leaf(52, 35, 44, 33.5, 39, 37.5, 46, 39.5, 8);
  leaf(50, 42.5, 43.5, 43, 40, 48.5, 45.5, 47.5, 7.5);

  // Forelegs: the upper one folded high, the lower reaching further down,
  // held apart so each reads as its own bent leg, each ending in a wedge
  // of a hoof.
  stroke([[53.5, 50.5], [60.5, 46.8], [66.5, 45.6]], 5.8);
  stroke([[66.5, 45.6], [70, 50.6], [71.4, 55.6]], 4.2);
  hoof(72.3, 57.8, 0.95, 5.2, 4.2, "#9c661d");
  stroke([[53.5, 60.5], [60.5, 61], [65.2, 63]], 5.8);
  stroke([[65.2, 63], [68, 69.5], [69.2, 75]], 4.1);
  hoof(70, 77.2, 0.9, 5.2, 4.2, "#95601a");

  return c;
}

function drawHorse(ctx, tx, ty, s, mirror) {
  if (!horseSprite) horseSprite = buildHorseSprite(s);
  ctx.save();
  ctx.translate(tx, ty);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(horseSprite, 0, 0);
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

export function drawMarque() {
  const c = document.createElement("canvas");
  c.width = MARQUE_W;
  c.height = MARQUE_H;
  const ctx = c.getContext("2d");
  const rand = rng(20260731);

  drawMarble(ctx, rand);

  // A breath of gold light behind the centre pieces, as the print has.
  const glow = ctx.createRadialGradient(1024, 620, 60, 1024, 620, 780);
  glow.addColorStop(0, "rgba(212,168,74,0.10)");
  glow.addColorStop(1, "rgba(212,168,74,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, MARQUE_W, MARQUE_H);

  /* Every gold element is painted into one art layer first, so the emblem
   * can be finished as a set: a thin light-gold contour is laid under the
   * whole union (the layer's own silhouette, dilated), and a single drop
   * shadow wraps everything once. That is what keeps it reading as one
   * drawn mark rather than parts floating on marble. */
  const art = document.createElement("canvas");
  art.width = MARQUE_W;
  art.height = MARQUE_H;
  const a = art.getContext("2d");

  drawHorse(a, 160, 344, 6.5, false);
  drawHorse(a, MARQUE_W - 160, 344, 6.5, true);
  drawCrown(a, 1024, 452, 1.28);
  drawDiamond(a, 1024, 498, 0.94);

  // Wordmark. System serifs only — Palatino where the platform has it, an
  // honest serif where it does not — so nothing ever waits on a font.
  const face =
    '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, "Times New Roman", serif';
  const word = (text, size, baseline, spacing) => {
    a.save();
    a.translate(MARQUE_W / 2, baseline);
    try {
      a.letterSpacing = spacing + "px";
    } catch (e) {
      /* older engines: tracking is a nicety */
    }
    a.font = `italic 700 ${size}px ${face}`;
    a.textAlign = "center";
    a.fillStyle = goldGradient(a, -size * 0.74, size * 0.22);
    a.fillText(text, 0, 0);
    a.strokeStyle = "rgba(46,26,4,0.4)";
    a.lineWidth = 1.4;
    a.strokeText(text, 0, 0);
    a.restore();
  };
  word("Adriano", 225, 1440, 6);
  word("Jewelry", 128, 1602, 10);

  // The contour: the art layer stamped in a ring of offsets, then recoloured.
  const outline = document.createElement("canvas");
  outline.width = MARQUE_W;
  outline.height = MARQUE_H;
  const o = outline.getContext("2d");
  const OW = 4;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    o.drawImage(art, Math.cos(ang) * OW, Math.sin(ang) * OW);
  }
  o.globalCompositeOperation = "source-in";
  o.fillStyle = "#e9c46a";
  o.fillRect(0, 0, MARQUE_W, MARQUE_H);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 9;
  ctx.drawImage(outline, 0, 0);
  ctx.restore();
  ctx.drawImage(art, 0, 0);

  return c;
}

/* ------------------------------------------------------------------- model */

export function createRingBox({ renderer, debug }) {
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
  const REC_W = 4.8; // lid recess
  const REC_D = 4.0;
  const REC_R = 0.5;
  const OPEN_ANGLE = -1.72; // ~98.5 deg past closed

  const satin = new THREE.MeshPhysicalMaterial({
    color: 0x121214,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.42,
    specularIntensity: 0.9,
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
  const marqueTex = new THREE.CanvasTexture(drawMarque());
  marqueTex.colorSpace = THREE.SRGBColorSpace;
  marqueTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const marque = new THREE.MeshPhysicalMaterial({
    map: marqueTex,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    specularIntensity: 1,
  });
  marque.envMapIntensity = 1.35;
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
          { i: 0, y: 0.55 },
          { i: 0, y: BASE_H },
        ], { flip: true }),
        satin,
        { receive: true }
      )
    );
    const floor = mesh(capGeometry(CAV_W, CAV_D, CAV_R, true), velvet, {
      receive: true,
    });
    floor.position.y = 0.55;
    root.add(floor);
    const under = mesh(capGeometry(W - 0.4, D - 0.4, R - 0.2, false), satin);
    under.position.y = 0.001;
    root.add(under);
  }

  // Cushion: two velvet pads, the empty ring slot between them.
  {
    const padW = 4.62;
    const padD = 1.82;
    // The ring's seat: wide enough to read as a place, still snug enough
    // that a band would be held. Nothing stands in it — the box ships empty.
    const slit = 0.24;
    const profile = [];
    profile.push({ i: 0, y: 0.55 });
    profile.push({ i: 0, y: 1.6 });
    quarterIn(profile, 0, 1.6, 0.34, 1.94, 5);
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
      cap.position.set(0, 1.94, pad.position.z);
      root.add(cap);
    }
  }

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

    // The marque, inlaid flush in the plateau.
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
          { i: 0, y: 0.5 },
        ], { flip: true }),
        satin,
        { receive: true }
      )
    );
    const ceiling = mesh(capGeometry(REC_W, REC_D, REC_R, false), velvet, {
      receive: true,
    });
    ceiling.position.y = 0.5;
    lid.add(ceiling);

    // Lamp housing on the recess ceiling, out by the free edge, lens in its
    // face. This is the box the photograph shows: the light lives in the lid
    // and looks down at where the ring would stand.
    const housingProfile = [];
    quarterIn(housingProfile, 0.05, 0, 0, 0.05, 2);
    housingProfile.push({ i: 0, y: 0.2 });
    const housing = mesh(
      sweep(1.15, 0.62, 0.2, housingProfile, { rMin: 0.06, cSeg: 6, sSeg: 2 }),
      satin
    );
    housing.rotation.x = Math.PI;
    housing.position.set(0, 0.5, 1.45);
    lid.add(housing);
    const housingFace = mesh(capGeometry(1.15, 0.62, 0.2, false), satin);
    housingFace.position.set(0, 0.3, 1.45);
    lid.add(housingFace);
    lensMesh = mesh(capGeometry(0.58, 0.3, 0.13, false), lens);
    lensMesh.position.set(0, 0.295, 1.45);
    lid.add(lensMesh);
  }

  // The lamp: a spot from the lens down to the empty slot, a point for the
  // spill inside the lid, a sprite for the bloom on the lens, a faint cone
  // for the air the beam crosses.
  const ledTarget = new THREE.Object3D();
  ledTarget.position.set(0, 1.9, 0.35);
  root.add(ledTarget);

  const led = new THREE.SpotLight(0xf7fbff, 0, 12, 0.45, 0.7, 1.3);
  led.position.set(0, 0.24, 1.45);
  led.target = ledTarget;
  led.castShadow = dbg.ledshadow !== "0";
  led.shadow.mapSize.set(1024, 1024);
  led.shadow.camera.near = 0.1;
  led.shadow.camera.far = 10;
  led.shadow.bias = -0.0004;
  led.shadow.normalBias = 0.015;
  lid.add(led);

  const ledSpill = new THREE.PointLight(0xf7fbff, 0, 3, 2);
  ledSpill.position.set(0, 0.18, 1.42);
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
    glowSprite.scale.setScalar(1.05);
    glowSprite.position.set(0, 0.24, 1.42);
    lid.add(glowSprite);
  }

  /* The lamp's reach beyond the box: shafts bursting up out of the open
   * mouth, a glow line breathing through the seam when the lid only cracks,
   * and a pool of spill on the floor around the box. All of it is the box's
   * own light — the room has none of its own — so every opacity below is
   * driven from update() by how open and how lit the box is. */
  const rayTex = (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d");
    const v = g.createLinearGradient(0, 256, 0, 0);
    v.addColorStop(0, "rgba(240,246,255,0.9)");
    v.addColorStop(0.35, "rgba(240,246,255,0.38)");
    v.addColorStop(1, "rgba(240,246,255,0)");
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, "rgba(0,0,0,0)");
    h.addColorStop(0.3, "rgba(0,0,0,1)");
    h.addColorStop(0.7, "rgba(0,0,0,1)");
    h.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
    return new THREE.CanvasTexture(c);
  })();

  const burstMeshes = [];
  {
    const mouth = new THREE.Vector3(0, 2.65, 0.2);
    // tilt forward (deg), tilt sideways (deg), length, width, opacity
    const shafts = [
      [14, 0, 6.5, 1.7, 0.11],
      [34, 6, 5.2, 1.1, 0.085],
      [8, -26, 5.6, 0.9, 0.075],
      [10, 28, 5.6, 0.9, 0.075],
      [52, -8, 4.2, 1.3, 0.06],
      [2, 2, 7.2, 2.4, 0.05],
    ];
    const D2R = Math.PI / 180;
    for (const [fwd, side2, len, w, o] of shafts) {
      const dir = new THREE.Vector3(
        Math.sin(side2 * D2R),
        Math.cos(fwd * D2R) * Math.cos(side2 * D2R),
        Math.sin(fwd * D2R)
      ).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );
      for (const roll of [0, Math.PI * 0.45]) {
        const mat = new THREE.MeshBasicMaterial({
          map: rayTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        });
        mat.userData.base = o;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
        m.quaternion.copy(quat);
        m.rotateY(roll);
        m.position.copy(mouth).addScaledVector(dir, len / 2);
        m.visible = false;
        root.add(m);
        burstMeshes.push(m);
      }
    }
  }

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

    /** Applies eased state: open and lit both run 0..1 (springs may
     * overshoot slightly; everything here tolerates it). */
    update({ open, lit }) {
      lidPivot.rotation.x = OPEN_ANGLE * open;

      const openFade = THREE.MathUtils.smoothstep(open, 0.45, 0.85);
      led.intensity = 900 * lit * (parseFloat(dbg.ledx) || 1);
      ledSpill.intensity = 2.6 * lit;
      lens.emissiveIntensity = 5 * lit;
      glowSprite.material.opacity =
        0.85 * lit * THREE.MathUtils.smoothstep(open, 0.2, 0.5);

      // The lamp's reach: shafts and floor pool swell as the mouth opens;
      // the seam line glows only in the sliver between cracked and open.
      const burstFade = lit * THREE.MathUtils.smoothstep(open, 0.5, 0.92);
      for (const m of burstMeshes) {
        m.material.opacity = m.material.userData.base * burstFade;
        m.visible = burstFade > 0.01;
      }
      const crack =
        lit *
        THREE.MathUtils.smoothstep(open, 0.006, 0.05) *
        (1 - THREE.MathUtils.smoothstep(open, 0.18, 0.42));
      seamGlow.material.opacity = 0.7 * crack;
      seamGlow.visible = crack > 0.01;
      const poolFade = lit * THREE.MathUtils.smoothstep(open, 0.4, 0.9);
      floorPool.material.opacity = 0.75 * poolFade;
      floorPool.visible = poolFade > 0.01;

      const beamA = 0.2 * lit * openFade;
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
     * around the standing lid, blended by the eased open value. */
    framing(open) {
      return { cy: 2.0 + 1.6 * open, cr: 3.6 + 1.45 * open };
    },
  };
}
