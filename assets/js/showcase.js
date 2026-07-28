/* Boot for the ring showcase.
 *
 * This is the only script the page loads for it, and it is deliberately tiny.
 * three.js and everything built on it is ~190KB over the wire and is pulled in
 * by a dynamic import() that does not run until the showcase is near the
 * viewport — so the library is never on the critical path for first paint, and
 * a visitor who never scrolls to it never downloads it.
 *
 * Everything it can refuse to do, it refuses:
 *   - no WebGL2, no import. The cells keep the drawn marks that are in the
 *     markup already and the page reads as intended.
 *   - reduced motion is passed through to the stage, which then draws one still
 *     frame instead of running a loop.
 *   - a failed import is caught and left alone. A CDN hiccup or a blocked
 *     script costs the page nothing but the render.
 */

const root = document.querySelector("[data-rings]");

if (root) {
  const canvas = root.querySelector("canvas");
  const slots = [...root.querySelectorAll("[data-ring]")];

  // three needs WebGL2, and asking is far cheaper than importing 190KB to find
  // out. The context is thrown away immediately; it exists only as the answer.
  const supported = (() => {
    if (!window.WebGL2RenderingContext) return false;
    try {
      const probe = document.createElement("canvas").getContext("webgl2");
      probe?.getExtension("WEBGL_lose_context")?.loseContext();
      return !!probe;
    } catch {
      return false;
    }
  })();

  if (supported && canvas && slots.length) {
    const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finale = root.querySelector("[data-finale]");

    const load = () => {
      import("./rings/stage.js")
        .then(({ createStage }) => {
          /* THE CLASS GOES ON FIRST, and the order is not incidental: is-reel
             is what turns the section from a row of four cells into a screen of
             scrolling per ring, and the stage measures those cells on its very
             first frame. Start it against the old layout and every act's
             progress is computed from a box that is about to change height. */
          if (motion) root.classList.add("is-reel");
          createStage({ canvas, slots, motion, finale });
          // Fades the canvas up and the drawn marks out, so the swap from the
          // static state to the live one is a dissolve rather than a jump.
          root.classList.add("is-live");
        })
        .catch(() => {
          // Left as it is: the marks in the markup are a complete fallback.
          root.classList.remove("is-reel");
        });
    };

    // Near, not in: 400px of warning is enough to have the first frame drawn by
    // the time the section is actually looked at.
    const near = new IntersectionObserver(
      ([entry], self) => {
        if (!entry.isIntersecting) return;
        self.disconnect();
        load();
      },
      { rootMargin: "400px" }
    );
    near.observe(root);
  }
}
