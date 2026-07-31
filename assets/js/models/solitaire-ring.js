/* Adriano Jewelry — the four-claw solitaire.
 *
 * The ring in the reference photograph, built from it and standing without
 * its stone: a tapered white-gold shank that thickens and widens as it
 * climbs, and four straight claws standing off the top of it, open, holding
 * nothing. The absence is the brief — this is the setting, and the setting
 * is the piece the bench makes; the stone is the customer's.
 *
 * Empty is not the same as vague. The head is solved from the brilliant it
 * is cut for, and reports it in metrics.stone, so a diamond dropped in here
 * later lands where a set stone lands rather than being fitted by eye.
 *
 * Every part of it is one wire: an elliptical section swept along a path by
 * geometry.js's tube(). The shank is a closed loop whose section grows
 * toward the top; a claw is a straight run from a root buried in that shank
 * to a domed tip. There is no basket, gallery or bezel in this design and
 * nothing is soldered on.
 *
 * Sizes are the centimetres of the same imagined bench the box is drawn on:
 * a size-6 finger, a 6.5mm stone.
 *
 * The stage contract, as every model here:
 *
 *   createSolitaireRing({ renderer, standing }) -> {
 *     root,        a Group with the finger's centre at its origin
 *     metrics,     what a box needs to seat one, and what a stone needs to
 *                  be set in it (see below)
 *     update(),    nothing about a ring moves; here so the stage can drive
 *                  it like any other prop
 *     framing(),   { cy, cr } bounding sphere for camera fit
 *   }
 *
 * The renderer is only for pre-filtering the light tent this model carries
 * with it; without one it falls back on whatever room it is standing in.
 * `standing` lifts it to rest on the ground, which is what it wants when it
 * is the whole shot rather than something inside a box. ring-box.js stands
 * one of these in the cushion's slot.
 */

import * as THREE from "../vendor/three.module.min.js";
import { tube } from "./geometry.js";

/* The spec. One place, so the ring can be resized like a real order. */
const RI = 0.79; // inner radius: a size 6
const BT0 = 0.125; // shank thickness, radial, at the base
const BT1 = 0.148; // ...and at the shoulders, where it carries the head
const BW0 = 0.176; // shank width, along the finger, at the base
const BW1 = 0.222; // ...and at the shoulders
const FLARE = 0.78; // radians either side of the top the flare is spread over

/* The stone this head is cut for.
 *
 * Nothing here draws a diamond — the ring is deliberately without one — but
 * the head is not guessed around an empty space either. Every dimension of
 * it is solved from the stone it is waiting for, so the day one is dropped
 * in it sits where a stone sits: girdle bearing on all four claws at once,
 * culet clear of the shank underneath, and the crown standing proud of the
 * tips. An empty setting that is honestly a setting.
 *
 * The girdle plane is not a taste decision. A brilliant's pavilion runs
 * 43% of its diameter below the girdle, and that point cannot be inside the
 * top of the band, which is what fixes how tall this head has to stand. */
const STONE_D = 0.65; // a 6.5mm round brilliant — about a carat
const STONE_R = STONE_D / 2;
const PAVILION = 0.43 * STONE_D; // culet below the girdle, on a standard cut
const CROWN_H = 0.162 * STONE_D; // girdle up to the table, likewise
const TABLE_R = 0.55 * STONE_R;
const SHANK_TOP = RI + BT1;
const GIRDLE_Y = SHANK_TOP + PAVILION + 0.042; // culet clears by 0.42mm

/* A claw, written for the +x/+z quarter and mirrored into the other three.
 * It is a straight post with a nail turned over at the top, which is the
 * whole of what a claw is:
 *
 *   the post — dead straight, from a root buried in the very top of the
 *   shank out to the girdle. All four are rooted in the same place, close
 *   enough together to cast as one junction, and the pair of them on any
 *   side is the V this ring is known by. How far each leans is solved
 *   rather than chosen: enough that its inner face — not its centreline,
 *   and reckoned across the lean — comes to rest exactly on the girdle
 *   circle at the girdle plane. That is the ledge a stone bears on.
 *
 *   the nail — the last millimetre, turned in over where the crown would
 *   be and laid along it half way up to the table. Without it a claw is a
 *   spike and holds nothing; with it, the four of them close over a stone
 *   and the setting is a setting. It is empty here, so all four nails stand
 *   over air.
 */
const ROOT_H = 0.1; // the root's distance from the ring's axis
const ROOT_Y = 0.845; // ...and its height, inside the shank's own wall
const KNEE_Y = GIRDLE_Y + 0.005; // the post runs a hair past the girdle
const NAIL_Y = GIRDLE_Y + 0.5 * CROWN_H; // and the nail lies here on the crown
const NAIL_LAY = 0.042; // ...standing off it by its own half-thickness
const NAIL_H = STONE_R - (STONE_R - TABLE_R) * 0.5 + NAIL_LAY;
const NAIL_LEAD = 0.045; // how far the post carries straight into the turn
const POST_STEPS = 20;
const NAIL_STEPS = 10;

/* Half-thickness up the claw: heavy where it leaves the shank, drawn fine
 * at the top, the way a claw is filed. The last of it flattens a little —
 * ru is the way round the girdle, rv straight out from the stone — because
 * even an unset claw is dressed to a face before it ever meets one. */
const TAPER = [
  [0.0, 0.075],
  [0.25, 0.061],
  [0.55, 0.05],
  [0.8, 0.042],
  [1.0, 0.036],
];
const FLAT_FROM = 0.74; // where the dressing starts
const FLAT_U = 1.14; // ...and how far it is spread and pressed
const FLAT_V = 0.89;

const TIP_R = TAPER[TAPER.length - 1][1];

/* The post's lean, solved so that its inner face lands on the girdle circle.
 * Four turns of the loop is three more than it needs — the lean and the face
 * it puts against the stone settle on each other immediately. The station
 * the girdle falls on is known up front, so the claw's thickness there is
 * too, which is what makes this solvable rather than fitted by eye. */
const LEAN = (() => {
  const onPost = (GIRDLE_Y - ROOT_Y) / (KNEE_Y - ROOT_Y);
  const rv = taperAt((onPost * POST_STEPS) / (POST_STEPS + NAIL_STEPS)).rv;
  let lean = 0.6;
  for (let i = 0; i < 4; i++) {
    const bearing = STONE_R + rv / Math.cos(lean);
    lean = Math.atan((bearing - ROOT_H) / (GIRDLE_Y - ROOT_Y));
  }
  return lean;
})();
const KNEE_H = ROOT_H + Math.tan(LEAN) * (KNEE_Y - ROOT_Y);

/* The claw's whole profile in (distance from the axis, height): the straight
 * post, then a quadratic turn whose handle carries the post's own direction
 * on for a moment before it comes over — a bend, not a corner. Built once
 * and mirrored into four. */
const CLAW = (() => {
  const pts = [];
  for (let i = 0; i <= POST_STEPS; i++) {
    const t = i / POST_STEPS;
    pts.push([ROOT_H + (KNEE_H - ROOT_H) * t, ROOT_Y + (KNEE_Y - ROOT_Y) * t]);
  }
  const cx = KNEE_H + Math.sin(LEAN) * NAIL_LEAD;
  const cy = KNEE_Y + Math.cos(LEAN) * NAIL_LEAD;
  for (let i = 1; i <= NAIL_STEPS; i++) {
    const t = i / NAIL_STEPS;
    const u = 1 - t;
    pts.push([
      u * u * KNEE_H + 2 * u * t * cx + t * t * NAIL_H,
      u * u * KNEE_Y + 2 * u * t * cy + t * t * NAIL_Y,
    ]);
  }
  return pts;
})();

function taperAt(t) {
  let r = TIP_R;
  for (let i = 1; i < TAPER.length; i++) {
    if (t <= TAPER[i][0] || i === TAPER.length - 1) {
      const k = Math.min(
        Math.max((t - TAPER[i - 1][0]) / (TAPER[i][0] - TAPER[i - 1][0]), 0),
        1
      );
      r = TAPER[i - 1][1] + (TAPER[i][1] - TAPER[i - 1][1]) * k;
      break;
    }
  }
  const f = Math.min(Math.max((t - FLAT_FROM) / (1 - FLAT_FROM), 0), 1);
  const s = f * f * (3 - 2 * f);
  return { ru: r * (1 + (FLAT_U - 1) * s), rv: r * (1 + (FLAT_V - 1) * s) };
}

/* The claw's tip: the last tangent carried on through a quarter turn with
 * the radius falling away as its cosine, so the wire closes in a ball
 * instead of a cut-off stub. tube() reads the shrinking radius into its
 * normals, which is what makes the ball shade like one. */
function domeEnd(path, steps) {
  const b = path[path.length - 1];
  const a = path[path.length - 2];
  const d = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const reachBy = Math.min(b.ru, b.rv);
  for (let s = 1; s <= steps; s++) {
    const k = (Math.PI / 2) * (s / steps);
    const reach = (reachBy * Math.sin(k)) / l;
    path.push({
      p: [
        b.p[0] + d[0] * reach,
        b.p[1] + d[1] * reach,
        b.p[2] + d[2] * reach,
      ],
      ru: Math.max(b.ru * Math.cos(k), 0.0006),
      rv: Math.max(b.rv * Math.cos(k), 0.0006),
    });
  }
}

/* The light tent.
 *
 * A polished metal has no diffuse worth the name: all a viewer sees in it is
 * whatever is standing around it, reflected. The room this ring lives in is
 * a black box in a dark studio, and a mirror in a dark room is a black
 * mirror — which is why the trade never photographs jewelry in the room it
 * is sold in. It puts a lit tent around the piece.
 *
 * So the ring carries one: a sphere painted with the bands a real tent has —
 * a bright ceiling, the dark line where it meets the wall, a broad soft
 * side, and a floor that falls away — pre-filtered once into this model's
 * own environment map. Every curve of the band then rakes those bands across
 * itself as it turns, which is the whole of what makes metal read as
 * polished silver rather than grey paint. It is the piece's light, not the
 * room's, so it comes with the piece wherever the piece is put.
 */
function lightTent(renderer) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 512;
  const g = c.getContext("2d");
  /* The edges matter more than the levels. A soft ramp reflects as a wash
   * and the band turns to chalk; it is the hard line between a panel and the
   * black beside it, drawn across a curve, that the eye reads as polish. So
   * every change of band here happens inside a percent or two. */
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0.0, "#ffffff"); // ceiling panel, straight overhead
  grd.addColorStop(0.19, "#ffffff");
  grd.addColorStop(0.205, "#171717"); // its edge
  grd.addColorStop(0.26, "#101010");
  grd.addColorStop(0.275, "#f2f2f2"); // the tall side panel
  grd.addColorStop(0.44, "#c8c8c8");
  grd.addColorStop(0.49, "#7d7d7d");
  grd.addColorStop(0.505, "#060606"); // the horizon
  grd.addColorStop(0.6, "#060606");
  grd.addColorStop(0.615, "#6a6a6a"); // bounce up off the table
  grd.addColorStop(0.74, "#303030");
  grd.addColorStop(1.0, "#060606");
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 512);
  const tex = new THREE.CanvasTexture(c);
  const tent = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 32),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
  );
  // Above one, because a tent is brighter than the paper it stands on.
  shell.material.color.setScalar(2.2);
  tent.add(shell);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(tent, 0.015).texture;
  pmrem.dispose();
  return env;
}

export function createSolitaireRing(opts) {
  const o = opts || {};
  // Stood on the ground rather than hung on its own centre: what a prop
  // wants when it is the whole shot, what a box does not.
  const standing = !!o.standing;

  /* Rhodium-plated white gold, bench-polished: metal through and through,
   * and tight enough to mirror the tent's bands crisply rather than smear
   * them into grey. */
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xf6f7f8,
    metalness: 1,
    roughness: 0.075,
  });
  if (o.renderer) metal.envMap = lightTent(o.renderer);

  /* How much of that tent is switched on. A piece standing in the open is
   * always under the studio; a piece lying in a box is under whatever the
   * box gives it, and when the lamp in the lid is off, a mirror in a shut
   * black room has almost nothing to show. Without this the ring goes on
   * blazing in a dark box and the lamp stops meaning anything. */
  const TENT_LIT = 1.15;
  const TENT_DARK = 0.17;
  metal.envMapIntensity = TENT_LIT;

  const root = new THREE.Group();
  if (standing) root.position.y = RI + BT0;
  const add = (geo) => {
    const m = new THREE.Mesh(geo, metal);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  };

  // The shank. One closed loop, section growing toward the top: a real
  // tapered band is thin where it sits under the finger and heaviest where
  // it has to hold something up.
  {
    const smooth = (t) => t * t * (3 - 2 * t);
    const path = [];
    const N = 144;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2; // 0 at the top of the ring
      const off = Math.min(a, Math.PI * 2 - a); // angular distance from it
      const s = smooth(1 - Math.min(off / FLARE, 1));
      const bt = BT0 + (BT1 - BT0) * s;
      const rm = RI + bt / 2; // the hole stays a cylinder; it grows outward
      path.push({
        p: [Math.sin(a) * rm, Math.cos(a) * rm, 0],
        ru: bt / 2,
        rv: (BW0 + (BW1 - BW0) * s) / 2,
      });
    }
    add(tube(path, { closed: true, seg: 30 }));
  }

  // The four claws, each the same profile swung onto its own corner.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const path = [];
      for (let i = 0; i < CLAW.length; i++) {
        const r = taperAt(i / (CLAW.length - 1));
        const h = CLAW[i][0] / Math.SQRT2;
        path.push({ p: [h * sx, CLAW[i][1], h * sz], ru: r.ru, rv: r.rv });
      }
      domeEnd(path, 6);
      // The hint only has to stay off the tangent, and a claw climbs: any
      // horizontal will do, so take the one square to the claw's own corner.
      add(tube(path, { seg: 18, up: [sx, 0, sz] }));
    }
  }

  return {
    root,

    /** What a box needs to seat one: how far the shank hangs below the
     * finger's centre, how far the claws stand above it, and how wide a slot
     * the band has to pass through. `stone` is the other half of it — the
     * brilliant this head was solved for, and the plane its girdle sits on,
     * so whatever sets one later does not have to measure the claws to find
     * out where it goes. */
    metrics: {
      drop: RI + BT0,
      rise: NAIL_Y + TIP_R,
      width: BW1,
      stone: { diameter: STONE_D, girdleY: GIRDLE_Y },
    },

    /** Nothing on a ring moves; only the light on it does. */
    update(state) {
      const lit =
        standing || !state || typeof state.lit !== "number" ? 1 : state.lit;
      metal.envMapIntensity = TENT_DARK + (TENT_LIT - TENT_DARK) * lit;
    },

    framing() {
      return { cy: (standing ? RI + BT0 : 0) + 0.11, cr: 1.22 };
    },
  };
}
