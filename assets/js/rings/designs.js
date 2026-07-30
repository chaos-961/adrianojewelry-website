/* The four rings.
 *
 * SCALE. One world unit is the inner radius of the shank — a US size 7, which
 * is 8.65mm across the hole. Every dimension below was converted from a real
 * millimetre figure at that rate, which is why they look like odd decimals: a
 * 2.3mm band is 0.266, a 1.5ct round brilliant is 7.4mm across and so 0.428 in
 * radius, a 1.3mm pavé stone is 0.075. Working in real proportions is most of
 * what separates a ring that reads as jewelry from one that reads as a torus
 * with a cone on it — the relationship between the band's width and the stone's
 * spread is the thing the eye actually checks.
 *
 * DRAW CALLS. A halo ring has fifty-odd stones and as many beads on it, and
 * every one of them is the same geometry at a different size and angle. So the
 * repeated parts are gathered into InstancedMesh: one ring is a band, one
 * instanced mesh of brilliants, one of prongs, one of beads and a rail —
 * around five calls whatever the stone count. Four rings therefore cost about
 * twenty, and adding stones to a design costs nothing but a matrix.
 */

import {
  Group,
  Object3D,
  InstancedMesh,
  Mesh,
  SphereGeometry,
  Vector3,
  Quaternion,
  Matrix4,
  Box3,
} from "../vendor/three.module.min.js";
import { roundBrilliant, emeraldCut, taperedBaguette } from "./gems.js";
import { sweepBand, prongGeometry, railGeometry } from "./metal.js";

const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);

/* Cached: all four rings share one brilliant, sized per instance. Building it
   once also means one upload to the GPU instead of four. */
let brilliantGeometry = null;
const brilliant = () => (brilliantGeometry ??= roundBrilliant());

/* --- placement helpers --------------------------------------------------- */

/** Collects transforms, then bakes them into a single InstancedMesh. */
class Instances {
  constructor(geometry) {
    this.geometry = geometry;
    this.list = [];
    this.scratch = new Object3D();
  }

  add(position, quaternion, scale) {
    this.list.push({ position, quaternion, scale });
    return this;
  }

  mesh(material, renderOrder = 0) {
    if (!this.list.length) return null;
    const m = new InstancedMesh(this.geometry, material, this.list.length);
    const o = this.scratch;
    this.list.forEach((t, i) => {
      o.position.copy(t.position);
      o.quaternion.copy(t.quaternion);
      o.scale.setScalar(t.scale);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    // These never move once placed, so let three skip the per-frame check.
    m.frustumCulled = false;
    m.renderOrder = renderOrder;
    return m;
  }
}

/**
 * Adds a set of stones as the two passes described in materials.js — the
 * pavilion seen from inside, then the crown added over it. Every stone on all
 * four rings goes through here, so the recipe lives in exactly one place.
 */
function addStones(group, instances, mat) {
  group.add(instances.mesh(mat.gemInside, 1), instances.mesh(mat.gemSurface, 2));
}

/** Outward normal of the shank at t, with t = 0 at the top of the ring. */
function outward(t) {
  const theta = t * TAU;
  return new Vector3(Math.sin(theta), Math.cos(theta), 0);
}

/** Rotation that stands a gem or a prong up along a given direction. */
function alignTo(direction) {
  return new Quaternion().setFromUnitVectors(UP, direction);
}

/* Full orientation, for a stone that has a length as well as an up: `up` is
   where the table points, `along` is where the stone's own +Z runs. A round
   brilliant does not care and takes alignTo; a baguette very much does. */
const _basis = new Matrix4();
const _x = new Vector3();
function orient(up, along) {
  _x.crossVectors(up, along);
  _basis.makeBasis(_x, up, along);
  return new Quaternion().setFromRotationMatrix(_basis);
}

/** Direction of travel around the shank at t — the band's own tangent. */
function tangent(t) {
  const theta = t * TAU;
  return new Vector3(Math.cos(theta), -Math.sin(theta), 0);
}

/**
 * Seats a stone on the curved outside of a shank: table facing straight out,
 * girdle sunk by a fraction of its own radius so the metal closes over the
 * edge the way a bead setting does.
 *
 * The sink is small on purpose. Set it deep enough for the girdle to disappear
 * and the crown goes with it: seen along the shank — which is how the shoulders
 * of a ring are seen for most of a turn — a stone whose table is flush with the
 * metal is inside the silhouette and simply is not there. Pavé reads because
 * the crowns stand proud of the band between the beads.
 */
function seat(t, radius, stoneRadius, sink = 0.12) {
  const n = outward(t);
  return {
    position: n.clone().multiplyScalar(radius - stoneRadius * sink),
    quaternion: alignTo(n),
  };
}

/* --- the designs ---------------------------------------------------------
 * Each returns a Group centred on its own bounding box, so the stage can drop
 * it into a cell without knowing anything about what is in it. */

/**
 * THE SOLITAIRE — one round brilliant, six prongs, platinum.
 *
 * The whole design is an argument about height: the shank narrows and thickens
 * as it climbs so the eye is led up it, the basket flares from a narrow waist
 * out to the girdle, and the culet clears the top of the band rather than
 * sitting in it. That last one is a real constraint, not a stylistic choice —
 * a brilliant's pavilion is 43% of its spread deep, and on a stone this size
 * that is 0.37 of a unit hanging below the girdle.
 */
function solitaire(mat, { stone = 0.428, metal = "platinum", bare = false } = {}) {
  // 0.428 is a 1.5ct round; film.js asks for 0.494 — a 2ct — because the
  // hero shows one ring alone at half the frame and the classic proportion
  // reads under-stoned at that scale. Both are real stones on a size 7.
  //
  // `metal` picks the alloy for the whole mounting; `bare` skips the stone —
  // the craft act builds this ring live and supplies its own diamond, flown
  // in from the hero, so the mounting must exist without one. The parts are
  // NAMED (band / head-*) so the film can dress the wax and the cast onto
  // the same geometry, and "seat-marker" is an empty at the girdle position,
  // the exact point the flown-in stone must land on.
  const m = mat[metal] || mat.platinum;
  const g = new Group();
  const inner = 1;
  const depth = (t) => 0.185 - 0.045 * (1 - Math.cos(t * TAU)) * 0.5;
  const width = (t) => 0.2 + 0.085 * (1 - Math.cos(t * TAU)) * 0.5;

  const bandMesh = new Mesh(sweepBand({ inner, width, depth }), m);
  bandMesh.name = "band";
  g.add(bandMesh);

  const bandTop = inner + depth(0);
  const culet = 0.4312 * 2 * stone; // pavilion depth, 43.1% of the spread
  const girdleY = bandTop + culet + 0.008;

  if (!bare) {
    const stones = new Instances(brilliant());
    stones.add(new Vector3(0, girdleY, 0), new Quaternion(), stone);
    addStones(g, stones, mat);
  }

  // The seat, as a point the film can find after the group is recentred and
  // wrapped: an empty contributes nothing to the bounding box, so asking for
  // its world position later answers "where must the girdle land" exactly.
  const marker = new Group();
  marker.name = "seat-marker";
  marker.position.set(0, girdleY, 0);
  g.add(marker);

  // Six prongs, springing from the top of the shank and flaring out to the
  // girdle. Each is placed by its two ends: scale is the length between them,
  // and the rotation is whatever stands the lathe's axis up along it.
  const prongs = new Instances(
    prongGeometry({ height: 1, base: 0.16, neck: 0.112, bead: 0.17 })
  );
  // A real head is a basket: a narrow ring soldered to the shank, six legs
  // climbing and flaring out of it, and a second ring near the top tying them
  // together under the girdle. Modelling it that way is not detail for its own
  // sake — it is the only arrangement in which the legs have somewhere to
  // begin. Six claws springing straight off a 2mm shank cannot all reach it;
  // four of them would end in mid-air a millimetre above the metal, which is
  // exactly what the eye reads as "this was never made".
  const baseR = stone * 0.52;
  const tipR = stone * 0.95;
  const tipY = girdleY + 0.05;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + TAU / 12;
    const from = new Vector3(
      Math.sin(a) * baseR,
      bandTop - 0.055,
      Math.cos(a) * baseR
    );
    const to = new Vector3(Math.sin(a) * tipR, tipY, Math.cos(a) * tipR);
    const axis = to.clone().sub(from);
    prongs.add(from, alignTo(axis.clone().normalize()), axis.length());
  }
  const prongMesh = prongs.mesh(m);
  prongMesh.name = "head-prongs";
  g.add(prongMesh);

  // The seat ring, sunk into the top of the shank — this is the joint.
  const seatRing = new Mesh(
    railGeometry({ inner: stone * 0.4, width: 0.075, depth: 0.05 }),
    m
  );
  seatRing.name = "head-seat";
  seatRing.rotation.x = Math.PI / 2; // built standing up; a gallery lies flat
  seatRing.position.y = bandTop - 0.022;
  g.add(seatRing);

  // The gallery: the rail that ties the six claws together under the stone.
  const rail = new Mesh(
    railGeometry({ inner: stone * 0.72, width: 0.065, depth: 0.042 }),
    m
  );
  rail.name = "head-rail";
  rail.rotation.x = Math.PI / 2;
  rail.position.y = girdleY - 0.145;
  g.add(rail);

  return g;
}

/**
 * THE HALO — a brilliant ringed by sixteen more, pavé down both shoulders,
 * 18k yellow gold.
 *
 * A halo is a size trick: the centre stone here is barely half the carat of
 * the solitaire's, and the ring of melee around it reads as one much larger
 * spread. The pavé is the other half of the argument — set flush into the
 * shoulders so the metal reads as continuous, with a bead of gold raised
 * between each pair to hold them.
 */
function halo(mat) {
  const g = new Group();
  const inner = 1;
  const centre = 0.3; // ~0.65ct
  const melee = 0.078;
  const pave = 0.062;
  const depth = (t) => 0.175 - 0.02 * (1 - Math.cos(t * TAU)) * 0.5;
  const width = (t) => 0.235 + 0.045 * (1 - Math.cos(t * TAU)) * 0.5;

  g.add(new Mesh(sweepBand({ inner, width, depth }), mat.yellowGold));

  const bandTop = inner + depth(0);
  const girdleY = bandTop + 0.4312 * 2 * centre + 0.075;
  const stones = new Instances(brilliant());
  const bead = new SphereGeometry(1, 10, 7);
  // Two bead sets because the ring is two metals — the halo's beads belong to
  // the white head, the shoulders' belong to the yellow shank. Same geometry,
  // so this is one more draw call and not one more piece of geometry.
  const haloBeads = new Instances(bead);
  const paveBeads = new Instances(bead);

  stones.add(new Vector3(0, girdleY, 0), new Quaternion(), centre);

  // The halo sits a touch below the centre's girdle and leans very slightly
  // outward, which is what makes the ring of them catch the light a beat after
  // the centre stone rather than at the same moment.
  const haloR = centre + melee + 0.028;
  const haloCount = 16;
  const haloY = girdleY - 0.055;
  for (let i = 0; i < haloCount; i++) {
    const a = (i / haloCount) * TAU;
    const dir = new Vector3(Math.sin(a) * 0.17, 1, Math.cos(a) * 0.17).normalize();
    stones.add(
      new Vector3(Math.sin(a) * haloR, haloY, Math.cos(a) * haloR),
      alignTo(dir),
      melee
    );
    // A bead in each gap between neighbours, raised at the outer rim.
    const b = a + TAU / haloCount / 2;
    const bR = haloR + melee * 0.55;
    haloBeads.add(
      new Vector3(Math.sin(b) * bR, haloY - 0.014, Math.cos(b) * bR),
      new Quaternion(),
      0.031
    );
  }

  const rail = new Mesh(
    railGeometry({ inner: haloR - melee * 0.9, width: melee * 2.5, depth: 0.055 }),
    mat.whiteGold
  );
  rail.rotation.x = Math.PI / 2;
  rail.position.y = haloY - 0.075;
  g.add(rail);

  /* THE HEAD IS WHITE, THE SHANK IS YELLOW, and that is a jeweller's answer to
     a real problem rather than a decorative one. What a transmissive stone
     shows you is largely what is behind it, and what is behind this one is its
     own basket. In yellow gold the whole centre stone picked up the metal and
     came out the colour of champagne — visibly a browner stone than the sixteen
     white ones ringing it. Trade practice for exactly this reason is to build
     the head in white metal under a yellow shank, and doing it here fixes the
     render for the same reason it fixes the ring. */
  const collet = new Mesh(
    railGeometry({ inner: centre * 0.66, width: 0.07, depth: 0.05 }),
    mat.whiteGold
  );
  collet.rotation.x = Math.PI / 2;
  collet.position.y = bandTop + 0.13;
  g.add(collet);

  // Four claws holding the centre, tucked between halo stones. They start at
  // the top of the shank, not under the stone — a claw that begins in mid-air
  // is the single tell that gives away a ring nobody could actually make.
  const prongs = new Instances(
    prongGeometry({ height: 1, base: 0.19, neck: 0.14, bead: 0.19 })
  );
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + TAU / 8;
    const from = new Vector3(
      Math.sin(a) * centre * 0.66,
      bandTop - 0.02,
      Math.cos(a) * centre * 0.66
    );
    const to = new Vector3(
      Math.sin(a) * centre * 0.93,
      girdleY + 0.045,
      Math.cos(a) * centre * 0.93
    );
    const axis = to.clone().sub(from);
    prongs.add(from, alignTo(axis.clone().normalize()), axis.length());
  }

  // Pavé: eight stones down each shoulder, flush in the top of the band, with
  // a bead raised on each side of every stone.
  const step = 0.0205;
  for (let k = 0; k < 8; k++) {
    for (const side of [1, -1]) {
      const t = ((0.062 + k * step) * side + 1) % 1;
      const r = inner + depth(t);
      const s = seat(t, r, pave);
      stones.add(s.position, s.quaternion, pave);
      const n = outward(t);
      for (const edge of [1, -1]) {
        paveBeads.add(
          n.clone().multiplyScalar(r - 0.012).setZ(edge * (pave + 0.026)),
          new Quaternion(),
          0.026
        );
      }
    }
  }

  g.add(
    haloBeads.mesh(mat.whiteGold),
    paveBeads.mesh(mat.yellowGold),
    prongs.mesh(mat.whiteGold)
  );
  addStones(g, stones, mat);
  return g;
}

/**
 * THE ETERNITY — twenty-six shared-prong brilliants all the way round, rose
 * gold.
 *
 * The one design here with no top and no bottom, which is the point of it. The
 * stone count is not chosen, it is solved: at 2.4mm each they can be spaced no
 * further apart than they are wide, so the circumference decides how many fit,
 * and a bead is raised in each gap to hold the two stones either side of it —
 * one prong doing two jobs, which is what "shared" means.
 */
function eternity(mat) {
  const g = new Group();
  const inner = 1;
  const bandDepth = 0.17;
  const bandWidth = 0.315;
  const melee = 0.145; // 2.5mm

  g.add(
    new Mesh(
      sweepBand({
        inner,
        width: () => bandWidth,
        depth: () => bandDepth,
        outerN: 2.6,
      }),
      mat.roseGold
    )
  );

  const surface = inner + bandDepth;
  const seatR = surface - melee * 0.12;
  // As many as will fit without overlapping, measured on the chord between
  // neighbouring centres rather than on the arc — the arc would lie.
  const count = Math.floor(Math.PI / Math.asin((melee * 1.03) / seatR));

  const stones = new Instances(brilliant());
  const beads = new Instances(new SphereGeometry(1, 10, 7));

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const s = seat(t, surface, melee);
    stones.add(s.position, s.quaternion, melee);

    // Two beads in every gap, one at each edge of the band.
    const b = (i + 0.5) / count;
    const n = outward(b);
    for (const edge of [1, -1]) {
      beads.add(
        n.clone().multiplyScalar(surface - 0.018).setZ(edge * 0.104),
        new Quaternion(),
        0.036
      );
    }
  }

  g.add(beads.mesh(mat.roseGold));
  addStones(g, stones, mat);
  return g;
}

/**
 * THE TRILOGY — an emerald cut between two tapered baguettes, white gold.
 *
 * The odd one out, and deliberately so: three step-cut stones among all those
 * brilliants. A step cut has almost no fire — it trades the brilliant's
 * scintillation for long flat flashes off a few big planes — so as the row
 * turns, this ring goes quiet while the other three are still sparkling, and
 * then throws one broad sheet of light all at once.
 *
 * The centre's length runs along the finger, which is how an emerald cut is
 * set, and the baguettes taper toward it so the three read as one line.
 */
function trilogy(mat) {
  const g = new Group();
  const inner = 1;
  const depth = (t) => 0.185 - 0.03 * (1 - Math.cos(t * TAU)) * 0.5;
  // Widest at the top and narrowing toward the bottom, which is the reverse of
  // the other three. The extra width IS the channel: the baguettes are set into
  // the shoulders and the metal left either side of them is the wall that holds
  // them, so no separate part has to be modelled to do it.
  const width = (t) => 0.3 - 0.075 * (1 - Math.cos(t * TAU)) * 0.5;

  g.add(new Mesh(sweepBand({ inner, width, depth }), mat.whiteGold));

  const bandTop = inner + depth(0);
  const cut = { ratio: 1.4, corner: 0.17 };
  const half = 0.276; // 4.8mm across, so 6.7mm long
  const girdleY = bandTop + 0.92 * half + 0.03;

  const centre = new Instances(emeraldCut(cut));
  centre.add(new Vector3(0, girdleY, 0), new Quaternion(), half);
  addStones(g, centre, mat);

  /* The baguettes are SET INTO THE SHOULDERS, not hung off the sides of the
     centre stone. It is the difference between a ring and four parts near each
     other: a side stone follows the curve of the shank it sits on, so each one
     is placed by the band's own outward normal and tangent at the point it
     lands, tilted with the shoulder and turned so its taper points up the ring
     at the centre stone. Its pavilion ends up buried in the metal, which is
     precisely what a channel setting is. */
  const sideScale = 0.132;
  const sides = new Instances(taperedBaguette({ ratio: 1.7 }));
  const seatT = 0.092;
  for (const side of [1, -1]) {
    const t = (seatT * side + 1) % 1;
    const n = outward(t);
    // Toward the top of the ring, so the narrow end faces the centre stone.
    const along = tangent(t).multiplyScalar(-side);
    sides.add(
      // Barely sunk. A baguette has a shallow crown and no fire to fall back
      // on; drop it into the channel and it stops being a stone and becomes a
      // scratch on the shoulder.
      n.clone().multiplyScalar(inner + depth(t) - sideScale * 0.04),
      orient(n, along),
      sideScale
    );
  }
  addStones(g, sides, mat);

  // Four claws at the corners of the centre stone, standing off the shank.
  const prongs = new Instances(
    prongGeometry({ height: 1, base: 0.17, neck: 0.12, bead: 0.18 })
  );
  const cx = half * 0.84;
  const cz = half * cut.ratio * 0.84;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const from = new Vector3(sx * cx * 0.78, bandTop - 0.03, sz * cz * 0.62);
      const to = new Vector3(sx * cx, girdleY + 0.045, sz * cz);
      const axis = to.clone().sub(from);
      prongs.add(from, alignTo(axis.clone().normalize()), axis.length());
    }
  }
  g.add(prongs.mesh(mat.whiteGold));

  // A bead at each end of both baguettes: what actually stops a channel-set
  // stone sliding along its channel.
  const beads = new Instances(new SphereGeometry(1, 10, 7));
  for (const side of [1, -1]) {
    for (const end of [1, -1]) {
      const t = ((seatT + end * 0.052) * side + 1) % 1;
      const n = outward(t);
      beads.add(
        n.clone().multiplyScalar(inner + depth(t) - 0.012),
        new Quaternion(),
        0.036
      );
    }
  }
  g.add(beads.mesh(mat.whiteGold));

  return g;
}

/* --- assembly ------------------------------------------------------------ */

export const DESIGNS = [
  // build(materials, options?) — only the solitaire reads options today.
  { id: "solitaire", build: solitaire },
  { id: "halo", build: halo },
  { id: "eternity", build: eternity },
  { id: "trilogy", build: trilogy },
];

/**
 * Builds all four and normalises them into unit boxes.
 *
 * Each group is recentred on its own bounding box, so it sits in the middle of
 * whatever cell it is given. But all four are divided by ONE shared scale — the
 * largest dimension of the four — rather than each by its own. That is the
 * whole point: these are four size-7 rings, so their shanks must come out the
 * same size on screen, and the solitaire is allowed to stand taller than the
 * eternity band because in life it does. Normalising each separately would fit
 * every ring to its cell and quietly tell the viewer that a plain band is as
 * big as a ring with a stone standing off it.
 */
export function buildRings(materials) {
  const box = new Box3();
  const size = new Vector3();
  const centre = new Vector3();

  const built = DESIGNS.map(({ id, build }) => {
    const inner = build(materials);
    box.setFromObject(inner);
    box.getSize(size);
    box.getCenter(centre);
    inner.position.sub(centre);
    return { id, inner, extent: Math.max(size.x, size.y, size.z) };
  });

  const shared = 1 / Math.max(...built.map((b) => b.extent));

  return built.map(({ id, inner, extent }) => {
    // Wrapped rather than scaled in place, so the spin applied by the stage
    // turns the ring about its own centre and not about wherever the shank
    // happened to be modelled.
    const wrapper = new Group();
    wrapper.scale.setScalar(shared);
    wrapper.add(inner);

    const holder = new Group();
    holder.name = id;
    // How much of its unit box this design actually fills, so the stage can
    // frame a short ring as generously as a tall one without changing its size.
    holder.userData.extent = extent * shared;
    holder.add(wrapper);
    return holder;
  });
}
