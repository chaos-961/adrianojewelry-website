/* Boot for the landing film's jewels — the rendered solitaire in the hero and
 * the two bands in the fitting.
 *
 * Deliberately tiny, and everything it can refuse to do, it refuses:
 *
 *   - no html.motion, no film. Reduced motion keeps the photographed hero and
 *     the still page, exactly as home.css promises it.
 *   - no WebGL2, no import: asking costs a throwaway context, importing costs
 *     ~190KB. The photo hero and the drawn circles are a complete page.
 *   - a reader who has asked their connection for less data is taken at their
 *     word — the render is an enrichment, never a charge.
 *   - the library is pulled in by a dynamic import() only after the page has
 *     loaded (or two idle seconds, whichever lands first), so nothing here is
 *     ever on the critical path for first paint or LCP.
 *
 * html.film3d is added ONLY once the stage is standing, and it is what flips
 * the hero from the photograph to the lamp — so the swap is one class, made
 * after the first frame is already drawn, and a failure at any point before
 * it leaves the page exactly as it was. */

(function () {
  "use strict";

  var doc = document.documentElement;
  if (!doc.classList.contains("motion")) return;
  if (navigator.connection && navigator.connection.saveData) return;

  var canvas = document.querySelector(".film-canvas");
  var hero = document.querySelector(".film-hero");
  var fitting = document.querySelector(".vow-rings");
  var lamp = document.querySelector(".film-hero__lamp");
  if (!canvas || !hero || !fitting || !lamp) return;

  var supported = (function () {
    if (!window.WebGL2RenderingContext) return false;
    try {
      var probe = document.createElement("canvas").getContext("webgl2");
      if (probe) {
        var lose = probe.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
      return !!probe;
    } catch (e) {
      return false;
    }
  })();
  if (!supported) return;

  function load() {
    import("./rings/film.js")
      .then(function (mod) {
        var film = mod.createFilm({
          canvas: canvas,
          hero: hero,
          fitting: fitting,
          lamp: lamp,
        });
        if (!film) return;
        doc.classList.add("film3d");
        /* If the GPU is ever torn down for good — a driver reset that never
           restores — fall back to the photograph rather than holding a black
           rectangle over the hero. */
        canvas.addEventListener("webglcontextlost", function () {
          window.setTimeout(function () {
            if (canvas.classList.contains("is-parked")) return;
            try {
              var gl = canvas.getContext("webgl2");
              if (!gl || gl.isContextLost()) doc.classList.remove("film3d");
            } catch (e) {
              doc.classList.remove("film3d");
            }
          }, 4000);
        });
      })
      .catch(function () {
        /* Left as it is: the photographed hero is a complete page. */
      });
  }

  function schedule() {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(load, { timeout: 2000 });
    } else {
      window.setTimeout(load, 350);
    }
  }

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();
