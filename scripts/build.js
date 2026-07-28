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
 * A page opts in to the regions it wants, which is how one page can take a
 * different variant of the same slot — the contact page declares top-return
 * (a way back) where every other page declares top (a way to contact). What is
 * checked is that each page fills every slot in REQUIRED with one variant, so
 * a page cannot silently ship with no footer or no header.
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

/* Every page must fill each of these slots with exactly one of the variants
   listed. Catches a page that lost its footer, or a marker typo that would
   otherwise just leave the region empty. */
const REQUIRED = [
  { slot: "header", variants: ["top", "top-return", "top-home"] },
  { slot: "footer", variants: ["footer"] },
];

/* Image slots that are waiting on a photograph nobody has taken yet.
 *
 * This business has no jewelry photography — the live site carries three
 * images in total and not one of them is a piece of its own work. Rather than
 * ship a generated stand-in, every such slot renders as a labelled greybox
 * carrying the shot it needs. Counting them here is what stops them becoming
 * permanent: they are reported on every build and by --check, so the number is
 * in front of whoever deploys, every time.
 *
 * Deliberately a report and not a failure. Failing the build would take a live
 * business's site down over missing art direction, which is a worse outcome
 * than a visible placeholder. Pass --strict to turn the report into an error
 * once the photography actually lands. */
const PLACEHOLDER_RE = /data-placeholder="([^"]*)"/g;

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

  // The page decides which regions it has; the build fills what it declares.
  const declared = [...source.matchAll(/<!-- @partial ([a-z][a-z0-9-]*) -->/g)]
    .map((m) => m[1]);

  for (const { slot, variants } of REQUIRED) {
    const filled = variants.filter((v) => declared.includes(v));
    if (filled.length === 0) {
      warnings.push(`${page}: no ${slot} region (expected one of ${variants.join(", ")})`);
    } else if (filled.length > 1) {
      warnings.push(`${page}: ${filled.length} ${slot} regions (${filled.join(", ")})`);
    }
  }

  for (const name of declared) {
    const body = partials[name];
    if (body === undefined) {
      warnings.push(`${page}: declares "${name}", but partials/${name}.html does not exist`);
      continue;
    }
    const marker = new RegExp(
      `([ \\t]*)<!-- @partial ${name} -->[\\s\\S]*?<!-- @end ${name} -->`
    );
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
  const strict = process.argv.includes("--strict");

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
  const pending = [];
  let written = 0;

  for (const page of pages) {
    const file = path.join(ROOT, page);
    const source = read(file);
    const { out, warnings: w } = stamp(page, source, partials, version);
    warnings.push(...w);
    for (const m of out.matchAll(PLACEHOLDER_RE)) {
      pending.push({ page, shot: m[1] });
    }
    if (out === source) continue;
    if (check) stale.push(page);
    else {
      fs.writeFileSync(file, out);
      written++;
    }
  }

  for (const w of warnings) console.warn(`  warning: ${w}`);

  if (pending.length) {
    console.warn(
      `\n  ${pending.length} image slot${pending.length === 1 ? "" : "s"} still ` +
        `awaiting real photography:`
    );
    for (const { page, shot } of pending) {
      console.warn(`    ${page.padEnd(22)} ${shot}`);
    }
    console.warn(
      `  These render as labelled greyboxes. Nothing fabricated ships in ` +
        `their place.\n`
    );
    if (strict) {
      console.error("--strict: refusing to build with placeholders present.");
      process.exit(1);
    }
  }

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
