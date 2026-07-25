#!/usr/bin/env node
/* ==========================================================================
   scripts/serve.js — local preview that behaves like GitHub Pages.

   Matters because Pages does three things a naive static server doesn't:
     * "/foo/"  resolves to /foo/index.html
     * "/foo"   redirects to "/foo/" when a directory exists
     * anything unmatched returns 404.html *with a 404 status*, served at the
       requested URL — which is why 404.html must not rely on relative assets

   Usage:
       node scripts/serve.js                        http://localhost:4173/
       node scripts/serve.js --port 8080
       node scripts/serve.js --base /adrianojewelry-website/

   --base reproduces the project sub-path Pages actually deploys to. Run it at
   least once before shipping: it catches root-absolute paths ("/assets/…")
   that work locally and break in production.

   No dependencies. Requires Node 14+.
   ========================================================================== */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

/* ---- arguments ------------------------------------------------------------ */

function parseArgs(argv) {
  const options = { port: 4173, host: "localhost", base: "/" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") options.port = Number(argv[++i]);
    else if (arg === "--host") options.host = argv[++i];
    else if (arg === "--base" || arg === "-b") options.base = argv[++i];
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }

  /* Normalise to a leading and trailing slash: "" and "repo" both become "/repo/". */
  let base = String(options.base || "/").trim();
  if (!base.startsWith("/")) base = "/" + base;
  if (!base.endsWith("/")) base += "/";
  options.base = base;

  return options;
}

/* ---- path resolution ------------------------------------------------------ */

/* Map a URL pathname onto a file inside ROOT, refusing anything that escapes
   it (encoded traversal, absolute paths, symlink-ish tricks). */
function resolveWithin(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return null; /* malformed percent-encoding */
  }

  if (decoded.indexOf("\0") !== -1) return null;

  const target = path.resolve(ROOT, "." + decoded.replace(/\\/g, "/"));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

function statOrNull(target) {
  try {
    return fs.statSync(target);
  } catch (error) {
    return null;
  }
}

/* ---- responses ------------------------------------------------------------ */

function sendFile(res, file, status) {
  const body = fs.readFileSync(file);
  res.writeHead(status, {
    "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    /* Pages caches aggressively; locally we want every reload to be honest. */
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendNotFound(res) {
  const page = path.join(ROOT, "404.html");
  if (statOrNull(page)) {
    sendFile(res, page, 404);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
}

function sendError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

/* ---- server --------------------------------------------------------------- */

function createServer(options) {
  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }

    const requested = url.parse(req.url).pathname || "/";

    /* Serving under --base: everything outside it is off-site. */
    let pathname = requested;
    if (options.base !== "/") {
      if (requested === options.base.slice(0, -1)) {
        res.writeHead(302, { Location: options.base });
        res.end();
        return;
      }
      if (!requested.startsWith(options.base)) {
        sendError(res, 404, `404 — this site is served from ${options.base}`);
        return;
      }
      pathname = requested.slice(options.base.length - 1);
    }

    const target = resolveWithin(pathname);
    if (!target) {
      sendError(res, 400, "400 Bad Request");
      return;
    }

    const stats = statOrNull(target);

    if (stats && stats.isDirectory()) {
      /* "/about" -> "/about/" so relative links inside resolve correctly. */
      if (!pathname.endsWith("/")) {
        res.writeHead(301, { Location: requested + "/" });
        res.end();
        return;
      }
      const index = path.join(target, "index.html");
      if (statOrNull(index)) {
        sendFile(res, index, 200);
      } else {
        sendNotFound(res);
      }
      return;
    }

    if (stats && stats.isFile()) {
      sendFile(res, target, 200);
      return;
    }

    /* Extensionless miss: try "<path>.html" the way Pages does. */
    if (!path.extname(target)) {
      const asHtml = target + ".html";
      if (statOrNull(asHtml)) {
        sendFile(res, asHtml, 200);
        return;
      }
    }

    sendNotFound(res);
  });
}

/* ---- boot ----------------------------------------------------------------- */

try {
  const options = parseArgs(process.argv.slice(2));
  const server = createServer(options);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`serve.js: port ${options.port} is already in use.`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(options.port, options.host, () => {
    console.log(`Serving ${ROOT}`);
    console.log(`  http://${options.host}:${options.port}${options.base}`);
    console.log("Press Ctrl+C to stop.");
  });
} catch (error) {
  console.error("serve.js: " + error.message);
  process.exit(1);
}
