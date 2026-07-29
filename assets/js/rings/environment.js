/* The studio.
 *
 * Almost none of what makes metal look like metal comes from lights. A polished
 * shank is a mirror: what you see on it is the room, bent around a curve. Point
 * a directional light at it and you get one white dot on a grey tube. Put it in
 * a room with a big soft source overhead and two bright cards at the sides, and
 * the same geometry suddenly reads as platinum, because now there is something
 * for it to reflect.
 *
 * So this file builds a room — a jeweller's light tent, more or less — out of
 * nine flat cards, renders it once into a prefiltered cube map, and throws the
 * room away. Every metal and every stone on the page is then lit by that one
 * texture. It is by far the cheapest way to get this look:
 *
 *   - no HDRI to download. A studio environment ships as a 1-4MB .hdr file in
 *     most three.js work; this one is about forty lines of code and costs one
 *     render at startup.
 *   - the cards carry values well above 1.0, which an image file clipped to
 *     8 bits per channel could not. That headroom is the sparkle: a facet
 *     catching the small hard card returns a value of twenty-something, blows
 *     through the tone curve and reads as a flash rather than a grey patch.
 *   - the key is overhead, on purpose, because the page above the canvas opens
 *     with a shaft of light. The lighting in the render and the lighting in the
 *     CSS are the same lamp.
 */

import {
  Scene,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  MeshBasicMaterial,
  BackSide,
  DoubleSide,
  LinearSRGBColorSpace,
  PMREMGenerator,
} from "../vendor/three.module.min.js";

/* [w, h, x, y, z, rotX, rotY, intensity]
   Positions are in a 12-unit room; the rings occupy about one unit at the
   centre of it, so these are all comfortably "far away and large". */
const BROAD = [
  /* THE BROAD LIGHT — what the metal reflects.
     A shank is a mirror bent through 360°, so what it needs is large sources:
     big soft rectangles that wrap around it and leave a long unbroken highlight
     down the curve. Anything small reads on a band as a dot. */

  // The key: a wide softbox directly overhead, and the reason the tops of all
  // four rings are the brightest part of the row.
  [9, 9, 0, 5.2, 0, Math.PI / 2, 0, 2],
  // The strip inside it. Narrower and much brighter, so the top of each band
  // carries a hard line inside the soft wash.
  [3.6, 0.8, 0, 4.6, 0.3, Math.PI / 2, 0, 15],
  // Side cards, deliberately unequal — a symmetric pair kills the form.
  [1.1, 5.5, -4.4, 0.4, 0, 0, Math.PI / 2, 6.5],
  [0.8, 5, 4.4, 0.2, 0.6, 0, -Math.PI / 2, 3.6],
  // Kicker behind, which is what separates a dark shank from a dark page.
  [5, 2.2, 0, 0.8, -4.6, 0, 0, 3],
  // A dim card in front, off to one side. Keeps the near faces of the metal
  // off black without flattening them.
  [6.5, 4.5, -1.2, 0.2, 4.6, 0, Math.PI, 1.1],
  // Floor bounce, and a second lower one to open up the underside of the
  // shanks. Weak on purpose: the point of the set is that the light comes down.
  [8, 8, 0, -4.3, 0, -Math.PI / 2, 0, 0.5],
  [3.2, 2.4, 0, -2.6, 3.4, -0.9, 0, 0.85],
];

/* THE HARD LIGHT — what the STONES need, which is the opposite thing.
 *
 * A facet is a flat mirror a millimetre across; it does not reflect a source so
 * much as aim at it. Point it at a softbox and it returns a mild grey and the
 * stone looks like frosted glass. What makes a diamond scintillate is being
 * surrounded by small intense sources, so that as it turns, facet after facet
 * swings past one, clips to white, and lets go — the flicker IS the look. These
 * eight are scattered at different heights and angles for exactly that: never
 * two of them found at once, and never a gap long enough for the stone to go
 * dead. The values are far past 1 because they are meant to blow through the
 * tone curve when caught and be invisible when not.
 *
 * THE COLOURS ARE THE FIRE, and they are the one deliberate lie in this file.
 * What a diamond actually does is disperse: its index runs from 2.407 at the
 * red end to 2.451 at the violet, so a ray leaves the stone fanned into a
 * spectrum and the flash you see is coloured. Nothing in a rasteriser splits a
 * ray. But the visible RESULT of dispersion — this facet throwing amber, the
 * one beside it throwing cyan, the pair of them swapping as the stone turns —
 * is exactly what you get by making the sources themselves different colours.
 * The tint is only applied in the tent; the metals' studio stays neutral,
 * because a gold band reflecting a green lamp just looks like a mistake. */
const HARD = [
  [0.85, 0.85, -0.9, 4.3, -1.2, Math.PI / 2, 0, 34, [1, 0.99, 0.96]],
  [0.6, 0.6, 1.9, 4.1, 1.1, Math.PI / 2, 0, 46, [0.52, 0.76, 1]],
  [0.5, 0.5, -2.3, 3.4, 1.8, Math.PI / 2 - 0.5, 0.4, 40, [1, 0.74, 0.42]],
  [0.45, 0.45, 2.6, 2.2, -2.2, 0.5, -0.9, 30, [0.6, 1, 0.68]],
  [0.4, 1.6, -3.4, 1.4, 2.4, 0, 0.9, 22, [1, 0.58, 0.85]],
  [0.4, 1.4, 3.3, 1.1, 2.6, 0, -0.95, 18, [0.98, 0.95, 1]],
  [0.55, 0.55, 0.4, -1.6, 3.6, -0.7, 0, 12, [1, 0.86, 0.6]],
  [0.5, 0.5, -1.7, -1.2, -3.2, 0.6, 2.6, 16, [0.62, 0.88, 1]],

  /* And three MEDIUM ones, which exist for step cuts. A brilliant's facets
     are small enough that a source the size of a postage stamp fills one; an
     emerald cut's table is a single flat plane the size of the whole stone, and
     a small card reflected in it is a dot on a sheet of grey. These are large
     enough to fill a step facet.

     Dimmed by half for the landing film, which shows no step cut: at the
     hero's magnification a brilliant's crown facets are themselves large
     enough to catch these cards whole, and at the old intensities they laid
     a milky veil across the stone — the watery look. If the trilogy ever
     returns to a page, these are the numbers to raise again (7 / 5.5 / 4.5). */
  [2.2, 2.2, -1.6, 3.6, 2.3, Math.PI / 2 - 0.7, 0.5, 3.2, [1, 0.97, 0.93]],
  [2.6, 1.8, 2.3, 2.4, 2.7, 0.6, -0.7, 2.5, [0.9, 0.95, 1]],
  [2, 2.6, -3, 0.6, -2.2, 0, 1.3, 2, [1, 0.93, 0.88]],

  /* THE TABLE LAMP, and the position of this one is not taste, it is solved.
     The rings turn about their own vertical axis, so a centre stone's table
     normal never moves: it points up and 20° toward the viewer for the whole
     revolution, and it therefore reflects one fixed direction — 40° above the
     horizon, directly behind the ring — from the first frame to the last. Every
     other facet sweeps the room as the ring turns and finds something sooner or
     later; the table finds whatever is in that one spot, forever. So this card
     is put in that spot. Move the tilt in stage.js and this has to move with
     it: reflect the ring's up vector about the view direction and it is
     wherever that lands. */
  [4.5, 3.2, 0, 3.2, -3.8, -0.7, 0, 4, [1, 0.98, 0.95]],
];

/* TWO ROOMS, because metal and diamond want opposite ones and there is no
   single set that flatters both.
 *
 * Metal is a mirror of its surroundings, so what makes a shank look expensive
 * is a DARK room with a few big bright sources in it: the darkness is what
 * gives the band its deep unlit flank, and the contrast between that and the
 * highlight running along the top is the whole reading of "polished". Raise the
 * ambient and a platinum band turns to pewter.
 *
 * A diamond is the reverse. It is not showing you the room, it is showing you
 * the room reflected off two dozen little mirrors pointing in two dozen
 * directions, so in a dark room half of them find nothing and the stone comes
 * out half black — which is exactly what the first version of this looked like.
 * A bench sets stones in a light tent for precisely this reason: bright from
 * nearly every angle, so every facet has something, with hard sources on top
 * for the flashes.
 *
 * So the cards are shared and the FLOOR is not. Two prefiltered maps, built
 * once at startup, assigned per material — the metals take scene.environment,
 * the two gem materials carry their own envMap. */
const ROOMS = {
  metal: { floor: 0.035, broad: 1, hard: 1, tint: false },
  // The tent is NOT simply the studio turned up — it is very nearly the studio
  // turned INSIDE OUT. Its big soft boxes are pulled right down, because a
  // softbox covers a large solid angle and a facet aimed at one returns a flat
  // grey wash; turn them up and the stone comes out a sugar cube, which is
  // exactly how the first attempt at this looked. Its small hard sources are
  // pushed up threefold, because those are what a facet is for. The floor stays
  // low so the facets that find nothing go properly dark: the black between the
  // flashes is half of what makes a diamond read as one.
  //
  // Re-graded for the landing film, where one stone fills a good part of the
  // frame: the floor DOWN and the hard cards UP from the reel's 0.09 / 2.6.
  // Both moves buy the same thing — contrast. A diamond at this scale is not
  // brighter than its neighbours, it is darker between its flashes.
  gem: { floor: 0.065, broad: 0.26, hard: 3.1, tint: true },
};

/**
 * Renders one of the studios into a prefiltered environment map.
 * The caller owns the returned texture and must dispose it.
 */
export function studioEnvironment(renderer, { size = 256, room = "metal" } = {}) {
  // A name from ROOMS, or a literal { floor, broad, hard } — the second form is
  // how the two above were arrived at.
  const setup = typeof room === "string" ? ROOMS[room] : room;
  const scene = new Scene();
  const disposables = [];

  const roomGeometry = new BoxGeometry(12, 12, 12);
  const roomMaterial = new MeshBasicMaterial({ side: BackSide });
  roomMaterial.color.setScalar(setup.floor);
  scene.add(new Mesh(roomGeometry, roomMaterial));
  disposables.push(roomGeometry, roomMaterial);

  const plane = new PlaneGeometry(1, 1);
  disposables.push(plane);

  const cards = [
    ...BROAD.map((c) => [c, setup.broad]),
    ...HARD.map((c) => [c, setup.hard]),
  ];

  for (const [[w, h, x, y, z, rx, ry, base, tint], gain] of cards) {
    const intensity = base * gain;
    // DoubleSide so a card still lights the scene if it is ever moved past the
    // subject; at sixteen cards rendered once, the saving from culling is nil
    // and the class of bug it removes is not.
    const material = new MeshBasicMaterial({ side: DoubleSide });
    // Straight past 1.0. Colour is not clamped on the way to a half-float
    // target, and this is where the dynamic range comes from.
    if (tint && setup.tint) {
      material.color.setRGB(
        tint[0] * intensity,
        tint[1] * intensity,
        tint[2] * intensity,
        LinearSRGBColorSpace
      );
    } else {
      material.color.setScalar(intensity);
    }
    const card = new Mesh(plane, material);
    card.position.set(x, y, z);
    card.rotation.set(rx, ry, 0);
    card.scale.set(w, h, 1);
    scene.add(card);
    disposables.push(material);
  }

  const pmrem = new PMREMGenerator(renderer);
  // Barely any blur. It was 0.03, which softened the cards nicely and took the
  // edge off every one of the small hard sources with them — and those are the
  // whole reason the stones flash. Roughness does the softening where softening
  // is wanted: a shank at roughness 0.15 samples a blurred mip of this anyway,
  // and a facet at roughness 0 samples the sharpest.
  const target = pmrem.fromScene(scene, 0.012, 0.1, 40, { size });

  pmrem.dispose();
  for (const d of disposables) d.dispose();

  return target.texture;
}
