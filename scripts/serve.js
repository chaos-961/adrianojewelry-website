#!/usr/bin/env node
/* Local preview that behaves the way GitHub Pages does.
 *
 *   node scripts/serve.js            http://localhost:4319
 *   node scripts/serve.js 8080       on another port
 *
 * Opening index.html straight off the disk does not work for this site: the
 * links are extensionless, so file:// resolves /contact-us/ to a folder and the
 * browser shows a directory listing instead of the page. A server is what turns
 * a directory into its index.html. This one mirrors the three Pages behaviours
 * that matter, so a link that works here works when deployed:
 *
 *   /contact-us/   ->  contact-us/index.html
 *   /contact-us    ->  301 to /contact-us/
 *   anything else  ->  404.html, with a 404 status
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2]) || 4319;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();

function send(res, status, body, file) {
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(file || "").toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    // Always revalidate, so an edit shows up on reload rather than from cache.
    "Cache-Control": "no-store",
  });
  res.end(body);
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);

    // Keep the resolved path inside the project, whatever the request says.
    const target = path.join(ROOT, path.normalize(url).replace(/^[\\/]+/, ""));
    if (!target.startsWith(ROOT)) {
      return send(res, 403, Buffer.from("Forbidden"), ".txt");
    }

    if (isFile(target)) {
      return send(res, 200, fs.readFileSync(target), target);
    }

    // A directory serves its index; without the trailing slash, redirect first
    // so relative links inside the page resolve against the directory.
    if (isDir(target)) {
      if (!url.endsWith("/")) {
        res.writeHead(301, { Location: `${url}/` });
        return res.end();
      }
      const index = path.join(target, "index.html");
      if (isFile(index)) return send(res, 200, fs.readFileSync(index), index);
    }

    const notFound = path.join(ROOT, "404.html");
    return isFile(notFound)
      ? send(res, 404, fs.readFileSync(notFound), notFound)
      : send(res, 404, Buffer.from("Not found"), ".txt");
  })
  .listen(PORT, () => {
    console.log(`Adriano Jewelry — http://localhost:${PORT}`);
    console.log("Ctrl+C to stop.");
  });
