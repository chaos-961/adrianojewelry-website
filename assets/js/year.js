/* Corrects the copyright year, on every page.
 *
 * The markup ships with a literal year so the footer is complete for a reader
 * with scripting off and for a crawler. This only overwrites it when the real
 * year has moved on, which means the DOM is untouched for the whole of the year
 * the site was last built in.
 *
 * Kept as its own 300-byte file rather than folded into main.js because the
 * prose pages load no JavaScript at all otherwise, and they should not have to
 * download GSAP to get a correct footer. */
(function () {
  "use strict";
  var now = String(new Date().getFullYear());
  var nodes = document.querySelectorAll("[data-year]");
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].textContent !== now) nodes[i].textContent = now;
  }
})();
