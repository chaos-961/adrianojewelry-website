#!/usr/bin/env node
/* Screenshot a page at an EXACT viewport, including ones Chrome's own flags
 * cannot reach.
 *
 *   node scripts/shot.js <url> <out.png> [--w 320] [--h 800] [--dpr 2]
 *                                        [--wait 4500] [--mobile]
 *
 * Why this exists. The rule that every edit holds from 320px to wide desktop
 * was, until this script, not actually testable on this machine, because the
 * documented recipe does not do what it says:
 *
 *   --window-size=1170,2532 --force-device-scale-factor=3
 *       measured: 1154 x 2437 CSS px at dpr 3
 *
 * which is a DESKTOP layout rendered at 3x, not a phone. Worse,
 * --window-size clamps at roughly 490 CSS px however small you ask, so no
 * combination of flags will give you 320, or 375, or 390. Every "phone"
 * capture taken that way was a wide viewport in disguise, and a media query
 * that only fires under 500px was never once exercised.
 *
 * The DevTools Protocol has no such clamp. Emulation.setDeviceMetricsOverride
 * sets the layout viewport directly, so 320 means 320. Node 22 ships a global
 * WebSocket, so this needs no dependencies, which is the standing rule for
 * tooling in this repo.
 *
 * --mobile also sets the mobile flag, which is what makes (pointer: coarse)
 * match; the film reads that as lowPower. Without it you get a narrow desktop,
 * which is a different thing and worth being able to capture separately.
 */

"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findChrome() {
  for (const c of CHROMES) if (fs.existsSync(c)) return c;
  throw new Error("Could not find Chrome. Edit CHROMES in scripts/shot.js.");
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome writes the port to the profile dir; polling /json/version is simpler. */
function getJSON(port, route) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: route }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function waitForPort(port, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      return await getJSON(port, "/json/version");
    } catch {
      await sleep(100);
    }
  }
  throw new Error("Chrome never opened its debugging port.");
}

/** Minimal CDP client over the browser endpoint, using flat sessions. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let next = 1;
  const pending = new Map();
  const listeners = [];

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      return;
    }
    for (const fn of listeners) fn(msg);
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  return {
    ready,
    close: () => ws.close(),
    on: (fn) => listeners.push(fn),
    send(method, params, sessionId) {
      const id = next++;
      const payload = { id, method, params: params || {} };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
      return new Promise((resolve, reject) =>
        pending.set(id, { resolve, reject })
      );
    },
  };
}

async function main() {
  const url = process.argv[2];
  const out = process.argv[3];
  if (!url || !out) {
    console.error(
      "usage: node scripts/shot.js <url> <out.png> [--w 320] [--h 800] " +
        "[--dpr 2] [--wait 4500] [--mobile]"
    );
    process.exit(1);
  }

  const w = Number(arg("w", 320));
  const h = Number(arg("h", 800));
  const dpr = Number(arg("dpr", 2));
  const wait = Number(arg("wait", 4500));
  const mobile = process.argv.includes("--mobile");
  const port = Number(arg("port", 9223));

  const profile = path.join(
    require("os").tmpdir(),
    `adriano-shot-${process.pid}`
  );

  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--incognito",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let client;
  try {
    const version = await waitForPort(port);
    client = connect(version.webSocketDebuggerUrl);
    await client.ready;

    const { targetId } = await client.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await client.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    // The whole point: this is not clamped the way --window-size is.
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      { width: w, height: h, deviceScaleFactor: dpr, mobile },
      sessionId
    );
    if (mobile) {
      await client.send(
        "Emulation.setTouchEmulationEnabled",
        { enabled: true, maxTouchPoints: 5 },
        sessionId
      );
    }

    await client.send("Page.enable", {}, sessionId);
    const loaded = new Promise((resolve) => {
      client.on((m) => {
        if (m.method === "Page.loadEventFired") resolve();
      });
    });
    await client.send("Page.navigate", { url }, sessionId);
    await Promise.race([loaded, sleep(15000)]);
    // The film runs on rAF after load; give it real time to settle.
    await sleep(wait);

    const shot = await client.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId
    );
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));

    const size = await client.send(
      "Runtime.evaluate",
      {
        expression:
          '(()=>innerWidth+"x"+innerHeight+" dpr="+devicePixelRatio+' +
          '" coarse="+matchMedia("(pointer: coarse)").matches+' +
          '" overflow="+(document.documentElement.scrollWidth>innerWidth))()',
        returnByValue: true,
      },
      sessionId
    );
    console.log(`${out}  ${size.result.value}`);
  } finally {
    if (client) client.close();
    chrome.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
