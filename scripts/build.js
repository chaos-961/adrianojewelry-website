#!/usr/bin/env node
/* Stamps the shared chrome and the version into every page.
 *
 *   node scripts/build.js         rebuild every page from partials/ + VERSION
 *   node scripts/build.js bump    increment VERSION first, then rebuild
 *   node scripts/build.js --check exit 1 if any page is out of date (no writes)
 *
 * The site is plain static HTML on GitHub Pages, so the chrome is stamped in
 * at author time rather than injected by a script in the browser: the shipped
 * pages stay complete for crawlers, for a reader with JavaScript off, and for
 * the first paint. The cost is remembering to run this after editing a
 * partial — which is what --check is for.
 *
 * Each page marks the regions it delegates:
 *
 *     <!-- @partial top -->   ...generated...   <!-- @end top -->
 *
 * Everything between the markers is replaced wholesale, so never hand-edit it.
 * The markers themselves are the contract; a page missing one is reported.
 *
 * URLs are extensionless: every page except the home page and 404 lives at
 * <slug>/index.html, so it is served at /<slug>/ with no .html anywhere. A
 * partial writes links as {{root}}<slug>/ and this fills {{root}} in with the
 * hops back up to the site root for the page being stamped — relative, so the
 * same markup works on a custom domain and on a github.io project page, which
 * is served from /<repo>/ rather than /.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PARTIALS = path.join(ROOT, "partials");
const VERSION_FILE = path.join(ROOT, "VERSION");

/* Pages served for a miss at any path depth cannot use relative hrefs — a link
 * to "privacy-policy/" from /shop/gone/ resolves to /shop/gone/privacy-policy/.
 * These pages get root-absolute hrefs plus the data-root-link marker that their
 * inline script rewrites for a github.io project page. */
const DEPTH_AGNOSTIC = new Set(["404.html"]);

/* Not pages, and not worth walking. */
const SKIP_DIRS = new Set([
  ".git",
  ".github",
  ".claude",
  "assets",
  "node_modules",
  "partials",
  "scripts",
]);

const read = (p) => fs.readFileSync(p, "utf8");

/** Every page: *.html at the root, plus <slug>/index.html one level down. */
function findPages() {
  const pages = [];
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      pages.push(entry.name);
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      const nested = `${entry.name}/index.html`;
      if (fs.existsSync(path.join(ROOT, nested))) pages.push(nested);
    }
  }
  return pages.sort();
}

/** "" for a root page, "../" for one directory down, and so on. */
const rootPrefix = (page) => "../".repeat(page.split("/").length - 1);

/** The extensionless URL a page answers to, relative to the site root. */
const selfHref = (page) =>
  page.includes("/") ? `${page.slice(0, page.indexOf("/"))}/` : "";

/* --- version -------------------------------------------------------------
 * Every segment rolls over at 9: 0.0.9 -> 0.1.0, 0.9.9 -> 1.0.0. */
function bumpVersion(current) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`VERSION is not a three-part number: "${current}"`);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] < 9) {
      parts[i]++;
      return parts.join(".");
    }
    parts[i] = 0;
  }
  // Every segment was 9 — 9.9.9 rolls to 10.0.0 rather than back to 0.0.0.
  return `10.0.0`;
}

/* --- stamping ------------------------------------------------------------ */

/** Re-indents a partial so the generated block lines up with its markers. */
function indent(block, pad) {
  return block
    .replace(/\s+$/, "")
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

/** Points a relative page href at the site root, for depth-agnostic pages. */
function rootRelative(html) {
  return html.replace(
    /href="([a-z0-9-]+\/)"/g,
    (_m, slug) => `href="/${slug}" data-root-link="${slug}"`
  );
}

/** Marks the link that points at the page currently being built. */
function markCurrent(html, href) {
  if (!href) return html;
  const needle = `href="${href}"`;
  return html.includes(needle)
    ? html.replace(needle, `${needle} aria-current="page"`)
    : html;
}

function stamp(page, source, partials, version) {
  const warnings = [];
  const depthAgnostic = DEPTH_AGNOSTIC.has(page);
  // A depth-agnostic page cannot use relative links at all, so its {{root}} is
  // empty and rootRelative() rewrites the results to absolute afterwards.
  const root = depthAgnostic ? "" : rootPrefix(page);
  const self = depthAgnostic ? null : `${root}${selfHref(page)}`;
  let out = source;

  for (const [name, body] of Object.entries(partials)) {
    const marker = new RegExp(
      `([ \\t]*)<!-- @partial ${name} -->[\\s\\S]*?<!-- @end ${name} -->`
    );
    if (!marker.test(out)) {
      warnings.push(`${page}: no "${name}" region`);
      continue;
    }
    out = out.replace(marker, (_match, pad) => {
      let block = body
        .replace(/\{\{version\}\}/g, version)
        .replace(/\{\{root\}\}/g, root);
      if (depthAgnostic) block = rootRelative(block);
      else block = markCurrent(block, self);
      return (
        `${pad}<!-- @partial ${name} -->\n` +
        `${indent(block, pad)}\n` +
        `${pad}<!-- @end ${name} -->`
      );
    });
  }

  // A {{token}} that survives means a partial used one the build doesn't know.
  const leftover = out.match(/\{\{[a-z]+\}\}/g);
  if (leftover) {
    warnings.push(`${page}: unresolved ${[...new Set(leftover)].join(", ")}`);
  }

  return { out, warnings };
}

/* --- run ----------------------------------------------------------------- */

function main() {
  const mode = process.argv[2];
  const check = mode === "--check";

  let version = read(VERSION_FILE).trim();
  if (mode === "bump") {
    version = bumpVersion(version);
    fs.writeFileSync(VERSION_FILE, `${version}\n`);
    console.log(`VERSION -> ${version}`);
  }

  const partials = Object.fromEntries(
    fs
      .readdirSync(PARTIALS)
      .filter((f) => f.endsWith(".html"))
      .map((f) => [path.basename(f, ".html"), read(path.join(PARTIALS, f))])
  );

  const pages = findPages();
  const warnings = [];
  const stale = [];
  let written = 0;

  for (const page of pages) {
    const file = path.join(ROOT, page);
    const source = read(file);
    const { out, warnings: w } = stamp(page, source, partials, version);
    warnings.push(...w);
    if (out === source) continue;
    if (check) stale.push(page);
    else {
      fs.writeFileSync(file, out);
      written++;
    }
  }

  for (const w of warnings) console.warn(`  warning: ${w}`);

  if (check) {
    if (stale.length) {
      console.error(
        `Out of date: ${stale.join(", ")}\nRun: node scripts/build.js`
      );
      process.exit(1);
    }
    console.log(`${pages.length} pages up to date at v${version}.`);
    return;
  }

  console.log(
    `Stamped ${Object.keys(partials).length} partials at v${version} — ` +
      `${written} of ${pages.length} pages changed.`
  );
}

main();
