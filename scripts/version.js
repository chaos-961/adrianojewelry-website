#!/usr/bin/env node
/* ==========================================================================
   scripts/version.js — the site's version, in one place.

   The version lives in the VERSION file at the repo root. Everywhere else it
   appears (the footer of every page, the SITE_VERSION constant in
   assets/js/site.js) is generated from it, so there is never a second copy to
   forget about.

   Counting rule: each release adds 0.0.1, and every segment rolls over at 9.

       0.0.1 -> 0.0.2 -> ... -> 0.0.9 -> 0.1.0 -> ... -> 0.9.9 -> 1.0.0

   Usage:
       node scripts/version.js show          print the current version
       node scripts/version.js bump          +0.0.1, then write it everywhere
       node scripts/version.js set 0.2.0     force a version, then write it
       node scripts/version.js sync          rewrite from VERSION, no bump

   No dependencies. Requires Node 14+.
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VERSION_FILE = path.join(ROOT, "VERSION");
const SITE_JS = path.join(ROOT, "assets", "js", "site.js");

/* Directories that never contain anything worth rewriting. */
const IGNORED_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "scripts",
  "dist",
  "build",
  ".vscode",
  ".idea",
]);

const MAX_SEGMENT = 9;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/* ---- version arithmetic --------------------------------------------------- */

function parse(version) {
  const match = SEMVER_RE.exec(String(version).trim());
  if (!match) {
    throw new Error(
      `"${version}" is not a valid version. Expected three numbers, e.g. 0.0.1.`
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function format(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bump(version) {
  const v = parse(version);

  v.patch += 1;
  if (v.patch > MAX_SEGMENT) {
    v.patch = 0;
    v.minor += 1;
  }
  if (v.minor > MAX_SEGMENT) {
    v.minor = 0;
    v.major += 1;
  }

  return format(v);
}

/* ---- file helpers --------------------------------------------------------- */

function readVersion() {
  if (!fs.existsSync(VERSION_FILE)) {
    throw new Error(`Missing ${rel(VERSION_FILE)}. Create it containing "0.0.1".`);
  }
  return format(parse(fs.readFileSync(VERSION_FILE, "utf8")));
}

function writeVersion(version) {
  fs.writeFileSync(VERSION_FILE, version + "\n", "utf8");
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function findHtmlFiles(dir, found) {
  found = found || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      findHtmlFiles(path.join(dir, entry.name), found);
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

/* Replace only when the content actually differs, so `sync` stays a no-op and
   git history isn't churned by touch-only writes. */
function rewrite(file, transform) {
  const before = fs.readFileSync(file, "utf8");
  const result = transform(before);
  if (result.count === 0) return { file, count: 0, changed: false };
  if (result.text === before) return { file, count: result.count, changed: false };
  fs.writeFileSync(file, result.text, "utf8");
  return { file, count: result.count, changed: true };
}

/* ---- the sync itself ------------------------------------------------------ */

function sync(version) {
  const results = [];

  /* 1. assets/js/site.js — var SITE_VERSION = "x.y.z"; */
  if (fs.existsSync(SITE_JS)) {
    results.push(
      rewrite(SITE_JS, (text) => {
        let count = 0;
        const out = text.replace(
          /(\bSITE_VERSION\s*=\s*")[^"]*(")/g,
          (_match, open, close) => {
            count += 1;
            return open + version + close;
          }
        );
        return { text: out, count };
      })
    );
  }

  /* 2. Every page's footer — <span data-site-version>vX.Y.Z</span> */
  for (const file of findHtmlFiles(ROOT)) {
    results.push(
      rewrite(file, (text) => {
        let count = 0;
        const out = text.replace(
          /(<span\b[^>]*\bdata-site-version\b[^>]*>)[\s\S]*?(<\/span>)/gi,
          (_match, open, close) => {
            count += 1;
            return open + "v" + version + close;
          }
        );
        return { text: out, count };
      })
    );
  }

  return results;
}

function report(version, results) {
  const changed = results.filter((r) => r.changed);
  const empty = results.filter((r) => r.count === 0);

  console.log(`Site version: v${version}`);

  if (changed.length === 0) {
    console.log("  everything already up to date");
  } else {
    for (const r of changed) {
      console.log(`  updated  ${rel(r.file)} (${r.count})`);
    }
  }

  /* A page with no version marker is almost always an oversight — the footer
     was copied without it. Warn, but don't fail the command. */
  for (const r of empty) {
    if (/\.html?$/i.test(r.file)) {
      console.warn(`  warning  ${rel(r.file)} has no [data-site-version] marker`);
    } else {
      console.warn(`  warning  ${rel(r.file)} has no SITE_VERSION constant`);
    }
  }
}

/* ---- CLI ------------------------------------------------------------------ */

function main(argv) {
  const command = argv[0] || "show";

  if (command === "show") {
    console.log(readVersion());
    return;
  }

  if (command === "sync") {
    const version = readVersion();
    report(version, sync(version));
    return;
  }

  if (command === "bump") {
    const previous = readVersion();
    const next = bump(previous);
    writeVersion(next);
    console.log(`v${previous} -> v${next}`);
    report(next, sync(next));
    return;
  }

  if (command === "set") {
    if (!argv[1]) throw new Error("Usage: node scripts/version.js set <x.y.z>");
    const next = format(parse(argv[1]));
    writeVersion(next);
    report(next, sync(next));
    return;
  }

  throw new Error(
    `Unknown command "${command}". Use one of: show, bump, set <x.y.z>, sync.`
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error("version.js: " + error.message);
  process.exit(1);
}
