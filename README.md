# Adriano Jewelry — website

Static site, no build step, no dependencies. The repository root *is* the
deployed site: GitHub Actions uploads it verbatim to GitHub Pages.

Live: <https://chaos-961.github.io/adrianojewelry-website/>

---

## Layout

```
.
├── index.html               Home — the reference implementation of the shell
├── 404.html                 Error page (self-contained, see note below)
├── VERSION                  Single source of truth for the site version
├── site.webmanifest         Install metadata
├── robots.txt / sitemap.xml Crawler directives
├── .nojekyll                Disables Jekyll on Pages
├── assets/
│   ├── css/
│   │   ├── tokens.css       Design decisions — colours, type, space, motion
│   │   ├── base.css         Reset, element defaults, utilities, buttons
│   │   ├── layout.css       Header, navigation, footer, hero
│   │   └── collection.css   The 3D collection section on the home page
│   ├── js/
│   │   ├── site.js          Shell behaviour (progressive enhancement only)
│   │   ├── collection.js    The collection viewer (ES module, lazy)
│   │   └── jewel-shading.js Materials, lighting probes and the display stand
│   ├── models/              16 jewelry pieces as .glb, by category
│   ├── vendor/three/        three.js r170, vendored (see below)
│   └── favicon.svg
├── scripts/
│   ├── serve.js             Local preview that behaves like Pages
│   └── version.js           Version bump + sync tool
└── .github/workflows/
    └── static.yml           Deploy to Pages on push to main
```

### Adding a page

Copy `index.html`, keep the `<head>`, header and footer blocks intact, and
replace `<main>`. Two things to remember:

1. **Use relative asset paths** (`assets/css/base.css`), never root-absolute
   (`/assets/...`). The site is served from `/adrianojewelry-website/` on
   GitHub Pages, so a leading slash points outside it. A page one directory
   deep needs `../assets/...`.
2. **Keep the footer's version marker.** `scripts/version.js` warns about any
   page missing `<span data-site-version>`.

Then add the page to `sitemap.xml`.

---

## The collection viewer

The home page carries a WebGL viewer for sixteen pieces — four rings, four
earrings, four bracelets, four necklaces.

**It is progressive enhancement, not a widget.** The section is authored in
`index.html` as a plain list: every piece's name and description is real markup
that reads and indexes with JavaScript off. `collection.js` upgrades each entry
into a button and reveals the canvas by setting `data-collection-ready`, which
is the only thing `collection.css` keys the stage off. If the module never
runs, WebGL is missing, or a model 404s, the list stays exactly as authored.

**Nothing heavy loads until it is needed.** The initial home page costs about
58 kB. three.js is dynamically imported only when an `IntersectionObserver`
says the section is within 400 px of the viewport, and one model is fetched at
a time on selection, then cached. Rendering stops when the section scrolls out
of view or the tab is hidden.

### Adding or replacing a piece

1. Drop the `.glb` in `assets/models/<category>/`.
2. Add an `<li class="collection__item" data-model="<category>/<file>.glb">` to
   the matching group in `index.html`, with `data-piece-name` and
   `data-piece-note` spans inside. That markup is the source of truth — the
   script reads the file path off the attribute, and the copy is the no-JS
   fallback.

Materials are assigned by name, not authored in the file: a mesh whose glTF
material is called `gold`, `gem` or `mop` gets the corresponding shading from
`jewel-shading.js`. That keeps the files small and lets the whole collection be
re-lit in one place.

### How the pieces are lit

`jewel-shading.js` holds everything that decides how the collection looks —
the two lighting probes, the three materials and the display stand — and is
deliberately free of DOM and loading concerns, so the shading can be built
against an offscreen renderer without booting the section.

Two probes, because metal and stone need opposite things. Polished gold is a
mirror with no shading of its own, so it gets a dark shell with one large soft
key overhead, the way a bench photographer lights it. Stones get the opposite:
a fine grid of small, hard emitters separated by dark gutters, because facets
only sparkle when there is something bright *and* something dark to catch.

The stones are reflective rather than refractive, which is a considered choice.
three.js can do real transmission with dispersion, and it looks worse here:
every piece carries all of its stones as one merged mesh, so pavé a couple of
pixels across refracts noise and renders black. See the comment on
`createMaterials` for the full reasoning.

Each piece is sat on a turned plinth rather than a category-specific holder —
a ring cone or neck bust would need per-model placement, whereas a plinth only
has to meet the underside of the bounding box, which is true of all sixteen.

### Why three.js is vendored

`assets/vendor/three/` holds three.js **r170** (`three.module.js` plus
`GLTFLoader` and its one dependency, `BufferGeometryUtils`), mirroring the
upstream directory layout so the addons' relative imports resolve unmodified.
It is not pulled from a CDN: a shop's home page should not go flat because a
third party is having a bad day, and this keeps the site working offline.

Two things to know if you upgrade it:

- The bare specifier `three` is mapped by an **importmap in `index.html`**,
  which must stay above the module script that uses it.
- GitHub Pages' Jekyll excludes `/vendor` by default. The repo's `.nojekyll`
  disables Jekyll entirely, so this is fine — but do not remove that file.

---

## Versioning

The version shown at the bottom-left of every footer lives in `VERSION`.
Everything else is generated from it, so there is only ever one number to
change.

Each release adds `0.0.1`, and every segment rolls over at `9`:

```
0.0.1 → 0.0.2 → … → 0.0.9 → 0.1.0 → … → 0.9.9 → 1.0.0
```

```bash
node scripts/version.js bump
```

That rewrites `VERSION`, the `SITE_VERSION` constant in `assets/js/site.js`,
and the footer marker in every `.html` file. Other commands:

| Command                              | Effect                                   |
| ------------------------------------ | ---------------------------------------- |
| `node scripts/version.js show`       | Print the current version                |
| `node scripts/version.js bump`       | `+0.0.1`, then rewrite everywhere        |
| `node scripts/version.js set 0.4.0`  | Force a version, then rewrite everywhere |
| `node scripts/version.js sync`       | Rewrite from `VERSION` without bumping   |

The version is baked into the HTML rather than injected at runtime, so it is
still correct with JavaScript disabled. `site.js` re-stamps it on load purely
as a safety net.

### Release flow

```bash
node scripts/version.js bump
git add -A
git commit -m "v$(cat VERSION)"
git push
```

---

## Deployment

`.github/workflows/static.yml` publishes on every push to `main`.

**One-time setup:** repository → *Settings* → *Pages* → **Source: GitHub
Actions**. Without this the workflow runs but nothing goes live.

---

## Design system

Components read *semantic* tokens (`--color-text`, `--color-accent`), never the
raw palette (`--c-ink-800`). That indirection is what makes the dark-mode block
at the bottom of `tokens.css` a ~20-line override instead of a rewrite.

- **Breakpoints** — `36em` / `48em` / `62em` / `75em` / `96em`. `62em` is the
  one that matters: navigation switches from drawer to inline bar there.
- **Type** — fluid `clamp()` scale, no font-size media queries needed.
- **Motion** — every transition is disabled under `prefers-reduced-motion`.
- **Colour scheme** — light by default, dark honoured via
  `prefers-color-scheme`. The footer stays dark in both.
- **Targets** — interactive elements are at least 44×44px.

### JavaScript is optional

`site.js` only enhances. With it blocked: the navigation renders as a plain
wrapped list (the drawer and its toggle button are gated behind an `html.js`
class set inline in `<head>`), the version and copyright year still show, and
every link works.

---

## Notes and known follow-ups

- **`404.html` inlines its own CSS.** GitHub Pages serves it at the *requested*
  URL, so a page at `/collections/rings/vintage` would resolve a relative
  `<link href="assets/…">` against that path and get nothing. Inlining is the
  only way it renders correctly at every depth. Its internal links are written
  root-absolute and a small inline script prefixes the project sub-path on
  `github.io`. If you edit the tokens in `tokens.css`, mirror the change in the
  `<style>` block there.
- **Navigation targets don't exist yet** (`shop/`, `custom-repairs/`, `about/`,
  `contact/`, `privacy/`, `terms/`). They currently land on the 404 page, which
  is exactly what it's there for.
- **One fact to confirm:** the footer states `Mon–Sat, 9:00am – 4:30pm`. The
  hours came from the business listing, not from adrianojewelry.com itself,
  which only ever renders "Open today". Verify the Sunday closure before
  launch — it is also asserted in the `JewelryStore` JSON-LD in `index.html`.
- **Custom domain.** To move to `adrianojewelry.com`: add a `CNAME` file at the
  root containing the bare domain, point DNS at GitHub, then update the
  absolute URLs in `robots.txt`, `sitemap.xml`, and the `canonical`/`og:url`
  tags. The 404 script needs no change — it falls back to `/` automatically off
  `github.io`.
- **Icons.** Only an SVG favicon ships. For installable-PWA status the manifest
  needs a 192px and a 512px PNG.
- **Photography.** `assets/custom/` holds the workshop photos
  (`goldsmith-at-bench.png`, `setting-stones-gold-bangle.png`). They are PNGs
  of photographic content at ~800KB each — convert to JPEG or WebP before
  putting them on a page.

---

## Source content

Copy, structure and contact details were taken from the live GoDaddy site at
<https://adrianojewelry.com>. Slugs were cleaned up in the rebuild; if the old
URLs need to keep working, add redirects for:

| Live site                   | Here              |
| --------------------------- | ----------------- |
| `/shop`                     | `/shop/`          |
| `/custom-design-%26-repairs`| `/custom-repairs/`|
| `/about`                    | `/about/`         |
| `/contact-us`               | `/contact/`       |
| `/privacy-policy`           | `/privacy/`       |
| `/terms-and-conditions`     | `/terms/`         |
