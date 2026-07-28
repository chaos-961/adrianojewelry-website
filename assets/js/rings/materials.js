/* The materials.
 *
 * COLOUR. The metal tints below are written as linear RGB, not as hex, and that
 * is not fussiness. A hex literal is interpreted as sRGB and converted, and the
 * conversion pushes gold's green channel from 0.80 down to about 0.60 — the
 * difference between eighteen carat and a traffic cone. The numbers used here
 * are the measured normal-incidence reflectances of the real alloys, which is
 * what a metal's base colour means in a physically based renderer: for a metal,
 * `color` is not a paint, it is the fraction of red, green and blue the surface
 * hands back.
 *
 * THE STONES ARE TWO PASSES OVER ONE GEOMETRY, and this is the important part
 * of the file.
 *
 * The obvious way to render a diamond is to switch on `transmission` and let
 * the renderer refract. It is also the wrong way, and it is worth writing down
 * why, because the result looked plausible until you looked at it: three's
 * transmission is a SCREEN-SPACE approximation. It takes the scene already
 * drawn behind the object, bends the lookup by one refraction at the front
 * surface, and blurs by thickness. A stone has fifty-seven facets and light
 * inside it bounces off several of them before it leaves — none of which
 * happens here, because there is no inside. What you get instead is one smooth
 * displaced image of the background swimming under the crown. It reads as a
 * bubble trapped in the stone, because that is more or less what it is.
 *
 * So: no transmission at all. Instead the same faceted geometry is drawn twice.
 *
 *   1. THE INSIDE, drawn with side: BackSide. This is the pavilion seen from
 *      within — the eight mains and sixteen lower halves, facing back at the
 *      viewer, each one a mirror catching the studio at its own angle. This is
 *      where a real stone's structure comes from, and it is why the middle of a
 *      brilliant is a mosaic of hard-edged flashes rather than a smooth pool.
 *      Opaque, so the stone has a solid silhouette.
 *
 *   2. THE OUTSIDE, drawn additively on top with side: FrontSide. Table, bezels
 *      and stars, adding their own reflections to the inside ones. Additive is
 *      right, not a cheat: light returned from within a stone and light glancing
 *      off its crown reach the eye together, and adding them is what makes a
 *      facet clip to white as it swings past the key.
 *
 * Both are black-bodied — `color: 0x000000` — so there is no diffuse term at
 * all and everything on screen is reflection. That is what diamond is. And the
 * fire comes from `iridescence`, standing in for dispersion: it splits the
 * Fresnel response by wavelength across a facet, which puts the same coloured
 * flashes on the same edges that a real stone's 0.044 dispersion would.
 *
 * It is also, incidentally, several times cheaper: transmission makes the
 * renderer draw the entire opaque scene a second time into an offscreen buffer,
 * every frame. Two extra instanced draws cost nothing by comparison.
 */

import {
  MeshPhysicalMaterial,
  Color,
  LinearSRGBColorSpace,
  FrontSide,
  BackSide,
  AdditiveBlending,
} from "../vendor/three.module.min.js";

const linear = (r, g, b) => new Color().setRGB(r, g, b, LinearSRGBColorSpace);

function metal(rgb, roughness) {
  return new MeshPhysicalMaterial({
    color: linear(...rgb),
    metalness: 1,
    roughness,
    // Pushed past 1: the studio is a small room and a shank curves through a
    // full 360°, so a good half of every band is reflecting the dark part of
    // it. Lifting the whole reflection is what stops the underside of a ring
    // going to black against a black page.
    envMapIntensity: 1.3,
  });
}

/* Diamond's refractive index. In a physically based material this is what sets
   the Fresnel term: F0 = ((n-1)/(n+1))² = 0.172, so a diamond hands back 17% of
   the light striking its face head-on — four times what glass does — climbing
   to everything at a grazing angle. That ratio is the entire look. */
const IOR = 2.417;

/**
 * @param {"high"|"medium"|"low"} tier
 * @param {import("../vendor/three.module.min.js").Texture} gemEnv
 *   The light-tent map. Assigned to the two gem materials only — the metals
 *   take the scene's own darker studio. See the note at the top of
 *   environment.js for why the two cannot be the same room.
 */
export function createMaterials(tier, gemEnv) {
  const metals = {
    // Platinum is a shade warm and, being the softer metal, holds a slightly
    // satin polish rather than a glassy one. Held a little above its true
    // reflectance so it does not read as grey next to the golds.
    platinum: metal([0.76, 0.74, 0.72], 0.15),
    // Rhodium plated, which is why it is brighter and harder than the platinum
    // it is usually mistaken for.
    whiteGold: metal([0.86, 0.86, 0.87], 0.09),
    // 18k yellow: pure gold's (1.0, 0.766, 0.336) let up by the alloy.
    yellowGold: metal([1.0, 0.795, 0.42], 0.16),
    roseGold: metal([0.98, 0.72, 0.6], 0.17),
  };

  const fire = tier === "low" ? 0.3 : 0.62;

  /* THE INSIDE IS A MIRROR, and that is physics rather than a shortcut. Light
     inside a diamond meeting a pavilion facet from within strikes it beyond the
     critical angle — 24.4° for an index of 2.417, which is why the pavilion is
     cut at 40.75° — and is reflected in its entirety. Not 17%: all of it. Total
     internal reflection is why a brilliant returns light out of its table
     instead of leaking it out of its back, and it is why the correct material
     for these inward-facing facets is metalness 1. Left as a dielectric they
     hand back a sixth of what they receive and the middle of every stone goes
     to charcoal. */
  const gemInside = new MeshPhysicalMaterial({
    // A whisper of blue, which is what a colourless stone's returned light
    // actually carries, and enough to stop it reading as chrome.
    color: linear(0.87, 0.91, 0.99),
    metalness: 1,
    roughness: 0.015,
    side: BackSide,
    envMap: gemEnv,
    envMapIntensity: 1.25,
    iridescence: fire,
    iridescenceIOR: 2.2,
    // Wide enough that neighbouring facets land on different parts of the
    // spectrum, which is what makes the fire move as the stone turns rather
    // than sit on it like a decal.
    iridescenceThicknessRange: [90, 560],
  });

  const gemSurface = new MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0,
    ior: IOR,
    specularIntensity: 1,
    side: FrontSide,
    envMap: gemEnv,
    envMapIntensity: 1.5,
    iridescence: fire * 0.6,
    iridescenceIOR: 2.1,
    iridescenceThicknessRange: [120, 480],
    transparent: true,
    blending: AdditiveBlending,
    // Additive over a stone that has already written depth — it must not write
    // again, or the crown would occlude its own girdle.
    depthWrite: false,
  });

  return { ...metals, gemInside, gemSurface };
}

export function disposeMaterials(materials) {
  for (const m of Object.values(materials)) m.dispose();
}
