import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Livi organism experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>LIVI — A living virtual companion<\/title>/i);
  assert.match(html, /Waking the organism/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("ships the biological simulation and care interactions", async () => {
  const [component, hub, lifeData, css, page, layout, packageJson, readme, changelog, license] = await Promise.all([
    readFile(new URL("../app/LiviCompanion.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LifeHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lifeData.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
  ]);

  assert.match(component, /function metabolize/);
  assert.match(component, /function applyOfflineLife/);
  assert.match(component, /function migrateCellField/);
  assert.match(component, /function findNearestFoodIndex/);
  assert.match(component, /foods\.splice\(activeFoodIndex, 1\)/);
  assert.match(component, /const GRID = 35/);
  assert.match(component, /getUserMedia/);
  assert.match(component, /localStorage/);
  assert.match(component, /Feed/);
  assert.match(component, /Pet/);
  assert.match(component, /Play/);
  assert.match(component, /living cells/);
  assert.match(component, /function lifeStats/);
  assert.match(component, /function evaluateProgress/);
  assert.match(component, /FEEDER_INTERVAL_MS/);
  assert.match(hub, /BLOB STORE/);
  assert.match(hub, /UPDATE HISTORY/);
  assert.match(lifeData, /version: "0\.3\.0"/);
  assert.match(lifeData, /auto-feeder/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.life-hub/);
  assert.match(page, /<LiviCompanion \/>/);
  assert.match(layout, /themeColor:\s*"#071724"/);
  assert.match(packageJson, /"license": "CC0-1\.0"/);
  assert.match(readme, /public\s+domain under/i);
  assert.match(changelog, /\[0\.3\.0\]/);
  assert.match(license, /CC0 1\.0 Universal/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
