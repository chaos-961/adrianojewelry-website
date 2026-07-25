/* ==========================================================================
   jewel-shading.js — the look of the collection viewer.

   Everything here is pure: it takes a THREE namespace and returns objects.
   No DOM, no loading, no module-level state. collection.js owns those and
   imports this for the shading, the lighting probes and the display stand.

   Kept separate because the shading is the part worth iterating on in
   isolation — it can be built against an offscreen renderer without booting
   the section, which is not true of anything that touches the page.

   three.js is passed in rather than imported so this file has no opinion on
   how three is resolved. collection.js loads it through the importmap.
   ========================================================================== */

/* ---- Lighting probes ------------------------------------------------------

   Both probes are tiny scenes of emissive panels baked to a cube map through
   PMREM. Neither is a photograph of a room; each is built for what the
   material it serves needs to show. */

function panelMaker(THREE, scene, quad) {
  return (colour, sx, sy, pos, rot) => {
    const mesh = new THREE.Mesh(
      quad,
      new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide })
    );
    mesh.scale.set(sx, sy, 1);
    mesh.position.fromArray(pos);
    mesh.rotation.fromArray(rot);
    scene.add(mesh);
  };
}

function bake(THREE, pmrem, scene, quad, blur) {
  const tex = pmrem.fromScene(scene, blur).texture;
  scene.traverse((o) => {
    if (o.isMesh) o.material.dispose();
  });
  quad.dispose();
  return tex;
}

/* The gem probe. Facets only sparkle when the surroundings are small bright
   panels separated by darkness — a stone under a single soft dome renders as
   milky white, because every facet reflects the same value.

   The grid is deliberately finer and higher-contrast than the metal probe:
   more, smaller emitters means more distinct points for facets to catch as the
   piece turns, which is the flicker the eye reads as brilliance. */
export function gemEnvironment(THREE, pmrem) {
  const scene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(1, 1);
  const panel = panelMaker(THREE, scene, quad);
  const c = (r, g, b) => new THREE.Color(r, g, b);

  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(60, 60, 60),
      new THREE.MeshBasicMaterial({ color: c(0.012, 0.013, 0.018), side: THREE.BackSide })
    )
  );

  /* Ceiling: a 9x9 grid of hard little emitters with wide dark gutters. The
     sine pattern varies their intensity so the sparkle never falls into an
     obvious repeating rhythm as the piece spins. */
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const v = 2 + 46 * Math.abs(Math.sin(i * 1.7 + j * 2.3));
      panel(c(v, v * 0.965, v * 0.9), 2.1, 2.1, [i * 4.3, 19.5, j * 4.3], [Math.PI / 2, 0, 0]);
    }
  }

  /* Side strips, broken into blocks rather than run as continuous bars, for
     the same reason: continuous highlights smear across facets. */
  for (let k = -3; k <= 3; k++) {
    const v = 1.8 + 14 * Math.abs(Math.cos(k * 1.3));
    panel(c(v, v * 0.97, v * 0.93), 3.2, 5.4, [-19.6, k * 5.2, 2], [0, Math.PI / 2, 0]);
    panel(c(v * 0.66, v * 0.7, v * 0.88), 3.2, 5.4, [19.6, k * 5.2 + 2, -2], [0, -Math.PI / 2, 0]);
  }

  panel(c(3.6, 3.7, 4.2), 30, 14, [0, -19.5, 0], [-Math.PI / 2, 0, 0]);
  panel(c(7.0, 6.6, 5.9), 22, 9, [0, 5, -19.6], [0, 0, 0]);
  panel(c(1.9, 2.0, 2.4), 26, 10, [0, -2, 19.6], [0, Math.PI, 0]);

  return bake(THREE, pmrem, scene, quad, 0.0);
}

/* The metal probe. Polished gold is a mirror with no shading of its own, only
   what it reflects, so a uniformly bright surround renders it as flat pale
   yellow. This is the arrangement a bench photographer uses instead: a dark
   shell, one large soft key overhead, and narrow strips to draw highlights
   along the curves. */
export function studioEnvironment(THREE, pmrem, dark) {
  const scene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(1, 1);
  const panel = panelMaker(THREE, scene, quad);
  const tinted = (v, g, b) => new THREE.Color(v, v * g, v * b);

  const shell = dark ? 0.01 : 0.038;
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(60, 60, 60),
      new THREE.MeshBasicMaterial({
        color: tinted(shell, 0.97, 0.94),
        side: THREE.BackSide,
      })
    )
  );

  panel(tinted(8.6, 0.975, 0.925), 26, 20, [0, 19.5, 1], [Math.PI / 2, 0, 0]);   // key softbox
  panel(tinted(3.8, 0.99, 1.07), 5.5, 26, [-19.4, 3, 3], [0, Math.PI / 2, 0]);   // cool edge
  panel(tinted(2.4, 0.94, 0.82), 5.5, 26, [19.4, -1, -2], [0, -Math.PI / 2, 0]); // warm edge
  panel(tinted(1.7, 0.96, 0.9), 24, 7, [0, 5, -19.4], [0, 0, 0]);                // rim
  panel(tinted(1.2, 0.99, 0.97), 30, 24, [0, -19.4, 0], [-Math.PI / 2, 0, 0]);   // floor bounce
  panel(tinted(0.26, 1.0, 1.02), 26, 18, [0, 0, 19.4], [0, Math.PI, 0]);         // front gobo

  return bake(THREE, pmrem, scene, quad, 0.015);
}

/* ---- Materials ------------------------------------------------------------ */

const linear = (THREE, r, g, b) =>
  new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

/* Reflection, not refraction — and that is a considered choice, not a saving.

   Physically the honest material for a diamond is transmission at ior 2.417
   with dispersion, which is what splits light into the coloured flashes a
   jeweller calls fire. It was tried here and it is worse, for a reason
   specific to these models: each piece carries every one of its stones as a
   single merged mesh, centre stone and bead-set pavé together. three.js
   resolves transmission against a render target of the rest of the scene, and
   a pavé stone is a couple of pixels across, so what it refracts is noise.
   Rendered that way the pavé goes black and the shank turns to a dirty line.

   So the stones are mirrors instead. The half-metal is deliberate and not
   physical: a real diamond is a dielectric whose brightness comes from light
   entering, bouncing off the pavilion and coming back out — i.e. from the
   transmission just turned off. Left as a pure dielectric, the diffuse term
   swamps the facets and the stone renders as a white blob. Metalness trades
   that diffuse for a mirror of the high-frequency gem probe, which is what
   restores the bright/dark facet contrast the eye reads as a cut stone, and
   it holds up at pavé size where transmission does not. */
export function createMaterials(THREE, gemEnv) {
  const gold = new THREE.MeshStandardMaterial({
    color: linear(THREE, 1.0, 0.775, 0.365),
    metalness: 1.0,
    roughness: 0.115,
    envMapIntensity: 1.85,
  });

  const gem = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.78,
    roughness: 0.0,
    ior: 2.417,
    reflectivity: 1.0,
    specularIntensity: 1.0,
    envMap: gemEnv,
    envMapIntensity: 3.2,
  });

  const mop = new THREE.MeshPhysicalMaterial({
    color: linear(THREE, 0.795, 0.79, 0.782),
    metalness: 0.0,
    roughness: 0.13,
    clearcoat: 1.0,
    clearcoatRoughness: 0.035,
    iridescence: 1.0,
    iridescenceIOR: 1.82,
    iridescenceThicknessRange: [140, 860],
    sheen: 0.55,
    sheenColor: new THREE.Color(0xa9c6e6),
    sheenRoughness: 0.42,
    envMapIntensity: 1.5,
  });

  return { gold, gem, mop };
}

/* Materials come off the GLB by name — gold / gem / mop — and are swapped for
   the real shading here, so the files stay small and shader-agnostic. */
export function dressPiece(THREE, root, mats) {
  root.traverse((o) => {
    if (!o.isMesh) return;

    /* The role is read once and remembered. Classifying off material.name and
       then overwriting material in the same pass is only correct the first
       time through — a second dressing would read the name of the material we
       just assigned and quietly call every stone gold. */
    if (!o.userData.jewelRole) {
      const name = ((o.material && o.material.name) || "").toLowerCase();
      o.userData.jewelRole = name.includes("mop")
        ? "mop"
        : name.includes("gem")
        ? "gem"
        : "gold";
    }

    o.material = mats[o.userData.jewelRole];
  });
}

/* ---- Display stand --------------------------------------------------------

   A low turned plinth rather than a category-specific holder. Sixteen pieces
   share this viewer and their models carry no agreed "up" or hanging point, so
   a ring cone or a neck bust would need per-model placement to avoid the piece
   floating beside its own stand. A plinth only has to meet the underside of
   the bounding box, which is true of every piece.

   It also earns its place optically: the stones are transmissive, and without
   something solid underneath them there is nothing in the scene for them to
   refract. */

function shadowTexture(THREE) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(0,0,0,0.62)");
  g.addColorStop(0.45, "rgba(0,0,0,0.28)");
  g.addColorStop(0.78, "rgba(0,0,0,0.06)");
  g.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Profile of the turned plinth, in fractions of its radius and height, read
   from the centre of the top face outwards and down to the base. The two short
   segments near the top are a chamfer: a hard 90° rim catches one blown
   highlight, a chamfered one catches a graded pair, which is what makes it
   look turned rather than extruded. */
const PLINTH_PROFILE = [
  [0.0, 1.0],
  [0.845, 1.0],
  [0.945, 0.9],
  [1.0, 0.74],
  [1.0, 0.26],
  [0.975, 0.09],
  [0.93, 0.0],
  [0.0, 0.0],
];

export function createStand(THREE, gold) {
  const group = new THREE.Group();

  /* Dark, but a long way from a black mirror. A high clearcoat here turns the
     top face into a reflector that competes with the piece standing on it —
     the point of the plinth is to sit under the jewellery and be quiet. */
  const stone = new THREE.MeshPhysicalMaterial({
    color: linear(THREE, 0.05, 0.045, 0.04),
    metalness: 0.0,
    roughness: 0.52,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    sheen: 0.35,
    sheenColor: new THREE.Color(0x6b5b46),
    sheenRoughness: 0.55,
    envMapIntensity: 0.7,
  });

  const plinth = new THREE.Mesh(
    new THREE.LatheGeometry(
      PLINTH_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)),
      96
    ),
    stone
  );
  group.add(plinth);

  /* A hairline of the brand gold inlaid at the chamfer. It is the one place
     the stand is allowed to draw attention, and it ties the stage to the rest
     of the page. */
  const inlay = new THREE.Mesh(
    new THREE.CylinderGeometry(1.002, 1.002, 0.055, 96, 1, true),
    gold
  );
  inlay.position.y = 0.5;
  group.add(inlay);

  /* Contact shadow. A real shadow map would need a light rig and a depth pass
     for one soft ellipse; a gradient sprite sitting just off the top face
     reads the same and costs nothing. depthWrite off so it never bites into
     the piece above it. */
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(THREE),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  group.add(shadow);

  const api = { group: group, fit: fit, radius: 0 };

  /* Sizes the stand to a piece and returns how far it drops below y = 0.
     `footprint` is the piece's half-diagonal in the ground plane, so the base
     stays clear of the piece through a full turn. */
  function fit(footprint, drop) {
    const r = Math.max(footprint * 1.14, 0.0001);
    /* Deep enough to read as a block of stone. Shallower than this and the
       lathe silhouette flattens into a dish, which is what it looked like. */
    const h = r * 0.3;
    api.radius = r;

    plinth.scale.set(r, h, r);
    plinth.position.y = -h;

    /* Sat on the chamfer, which the profile puts at about 0.8 of the height,
       and tucked a hair inside the widest radius so it reads as inlaid rather
       than as a band clipped around the outside. */
    inlay.scale.set(r * 0.99, h, r * 0.99);
    inlay.position.y = -h * 0.2;

    /* Nudged above the top face rather than sat on it, or the two coplanar
       surfaces fight and the shadow tears as the stand turns. */
    shadow.scale.set(r * 1.55, r * 1.55, 1);
    shadow.position.y = 0.0016 * r + (drop || 0);

    return h;
  }

  return api;
}
