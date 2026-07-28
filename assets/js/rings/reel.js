/* The direction.
 *
 * This file holds the choreography and nothing else — no WebGL, no DOM, just
 * the arithmetic that turns "how far has this ring scrolled" into where it
 * stands, how big it is and which way it is facing. It is separate from
 * stage.js so that the shot can be re-cut without going anywhere near the
 * renderer, and so that all of it can be read in one page.
 *
 * THE SHAPE OF IT. Each ring gets a full screen-height of scrolling to itself,
 * and inside that it does three things: it rises into the frame, it holds and
 * turns, and it lifts out of the top as the next one rises in behind it. The
 * transitions overlap deliberately — for a moment there are two rings on
 * screen, one leaving and one arriving, which is what makes it read as one
 * continuous take rather than as four slides.
 *
 * WHY IT IS SLOW. A ring turns about 190° over a whole screen of scrolling.
 * That is roughly a fifth of the speed a scroll-linked animation usually runs
 * at, and it is the point: the entire argument of the piece is that these are
 * objects worth looking at, and a thing that whips past is a thing you were not
 * meant to look at. The easing carries the same idea — everything enters on a
 * long decelerating tail and leaves on an accelerating one, so a ring settles
 * into the frame and is then snatched out of it.
 *
 * UNITS. Positions are in fractions of the visible frame: 1.0 on Y is one
 * frame-height, so ±0.9 is comfortably off screen. The stage multiplies by
 * whatever that is in world units at the current viewport size, which is what
 * keeps the same cut working on a 320px phone and a 4K monitor.
 */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Decelerating: fast at first, long tail. Everything ARRIVES on this. */
const outCubic = (x) => 1 - (1 - x) ** 3;
/** Accelerating, its mirror. Everything LEAVES on this. */
const inCubic = (x) => x * x * x;
/** Symmetric, for anything that has to start and finish at rest. */
const smooth = (x) => x * x * (3 - 2 * x);

/* The three beats of an act, as fractions of its own length. The hold is more
   than half of it — a ring spends longer standing still in the middle of the
   frame than it spends arriving and leaving put together. */
const RISE = 0.26;
const FALL = 0.74;

/* AN ACT IS LONGER THAN ITS SCROLL, and this is what makes the four read as one
   continuous take. Each ring gets one screen of scrolling, but it starts
   climbing a sixth of a screen BEFORE that scroll begins and is still leaving a
   sixth of a screen after it ends. Without the overlap the arithmetic is exact
   and the result is wrong: ring three finishes leaving at precisely the instant
   ring four starts arriving, both of them off the edge of the frame, and for a
   moment the screen is empty. With it, one ring is always on its way out over
   the top while the next is on its way up from below. */
const LEAD = 0.16;
const TAIL = 0.16;

/** How far above the frame's centre a ring sits, leaving the caption its room. */
const LIFT = 0.14;

/* THE SWEEP, and its limits are the reason it is not simply a turntable.
 *
 * A ring is a disc. Turn one through a full revolution and twice in that
 * revolution it is edge-on: a bright vertical line about four pixels across,
 * with the stone that the caption beside it is currently describing pointing
 * straight at the wall. In motion that is a flash and it is quite beautiful. In
 * a scroll-linked animation it is a RESTING STATE — the reader stops where they
 * stop, and they are entitled to stop there.
 *
 * So the ring is never allowed to reach it. Each act sweeps from about 43°
 * short of square-on to about 65° past it: enough travel that the light rakes
 * right across the shank and every stone gets its turn under the key, and never
 * so far that the ring closes up. The lean below does the rest of the work,
 * tipping the top of the ring toward the viewer over the same stretch, so the
 * reveal happens on two axes rather than one. */
const START = -0.85;
const TURN = 1.75;
/** Lean at the start of an act and at the end of it. It tips back as it turns,
    so the top of the ring — the pavé, the halo, the baguettes — comes into view
    exactly while the caption is naming it. */
const TILT_IN = 0.1;
const TILT_OUT = 0.44;

/**
 * One ring's state at scroll position u.
 *
 * @param {number} u  0 as the act begins, 1 as it ends. Outside that the ring
 *                    is off screen and the caller should not draw it at all.
 * @param {number} phase  a per-ring offset so no two are ever square on at once
 * @returns {{visible:boolean, x:number, y:number, z:number, scale:number,
 *            spin:number, tilt:number, reveal:number}}
 */
export function act(u, phase) {
  // The act's own clock, which runs from before its scroll starts to after it
  // ends — see LEAD and TAIL above.
  const w = (u + LEAD) / (1 + LEAD + TAIL);
  if (w <= 0 || w >= 1) {
    return { visible: false, x: 0, y: 0, z: 0, scale: 0, spin: 0, tilt: 0, reveal: 0 };
  }

  const rise = outCubic(clamp01(w / RISE));
  const fall = inCubic(clamp01((w - FALL) / (1 - FALL)));

  return {
    visible: true,
    x: 0,
    // Up from below the frame, held, then lifted out of the top.
    y: LIFT + (rise - 1) * 0.95 + fall * 1.05,
    // Arrives from further away as well as from below, so the entrance has
    // some depth to it rather than being a slide.
    z: (rise - 1) * 0.55,
    // Grows into the frame and is pulled slightly toward the viewer on the way
    // out, which reads as passing overhead rather than shrinking away.
    scale: (0.84 + 0.16 * rise) * (1 + 0.13 * fall),
    spin: START + phase + w * TURN,
    tilt: TILT_IN + (TILT_OUT - TILT_IN) * smooth(clamp01((w - 0.04) / 0.72)),
    // The caption's opacity: in behind the ring, out a little ahead of it, so
    // the type is never the thing arriving or the thing lingering.
    reveal: clamp01((w - 0.06) / 0.14) * (1 - clamp01((w - 0.7) / 0.16)),
  };
}

/* --- The finale ----------------------------------------------------------
 * All four come back at once and settle into a row, and then — only then — the
 * way to get in touch appears. The order matters: the button arrives after the
 * work does, not beside it. */

/**
 * Where ring i sits in the closing arrangement, in frame fractions.
 *
 * Sat deliberately high — the closing line and the button come in underneath,
 * and on a narrow screen where the four stack two-by-two there is not much room
 * for both. The last row has to clear the text at 66% of the frame with the
 * page scrolled all the way down, which is what the drop below is set against.
 */
export function place(i, cols, unit) {
  const rows = 4 / cols;
  const col = i % cols;
  const row = Math.floor(i / cols);
  /* The gap is measured in RINGS, not in fractions of the frame, and that is
     the only version of this that survives a portrait phone. A fixed fraction
     was fine at four across on a desktop and put the two-by-two arrangement's
     neighbours through each other: the frame is half as wide there, so the same
     fraction is half the distance, while the rings are not half the size. */
  const spanX = unit * 1.12;
  const gapY = rows > 1 ? 0.3 : 0;
  return {
    x: (col - (cols - 1) / 2) * spanX,
    y: ((rows - 1) / 2 - row) * gapY + (rows > 1 ? 0.1 : -0.05),
  };
}

/**
 * @param {number} v  0 as the finale begins, 1 at the foot of the page
 * @param {number} i  which ring, 0-3 — they arrive one after another
 * @param {number} cols  4 across on a wide frame, 2 by 2 on a narrow one
 * @param {number} unit  a ring's own width, as a fraction of half the frame
 */
export function finale(v, i, cols, unit) {
  /* A head start and a stagger. The head start is what closes the seam: the
     first ring is already climbing while the last act's ring is still on its
     way out of the top, so the frame is never empty between the two. The
     stagger is why they arrive one after another rather than as a block —
     four objects moving in perfect unison read as one object.

     The offset is tuned against the handover in stage.js: at the moment the
     last ring finishes its act, its own arrival here is still almost zero, so
     it swaps from just above the frame to just below it and nothing is seen to
     jump. Change one and the other has to move with it. */
  const arrive = outCubic(clamp01((v + 0.14 - i * 0.1) / 0.5));
  const scale = (cols === 4 ? 0.46 : 0.42) * (0.7 + 0.3 * arrive);
  const spot = place(i, cols, unit * (cols === 4 ? 0.46 : 0.42));
  return {
    visible: arrive > 0.002,
    x: spot.x * arrive,
    y: spot.y * arrive + (1 - arrive) * -0.95,
    z: (arrive - 1) * 0.7,
    scale,
    // A slow drift rather than a turn, and inside the same limits an act keeps
    // to — this is the shot the page ends on, and any of the four could be
    // sitting edge-on in it when the scrolling stops.
    spin: -0.5 + i * 0.17 + v * 0.55,
    tilt: 0.36,
    reveal: 0,
  };
}

/** The closing line and the button, held back until the row has assembled. */
export const finaleReveal = (v) => clamp01((v - 0.3) / 0.24);
