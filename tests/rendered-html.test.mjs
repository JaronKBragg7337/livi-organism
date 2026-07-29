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
  const [component, css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/LiviCompanion.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(component, /function metabolize/);
  assert.match(component, /function applyOfflineLife/);
  assert.match(component, /getUserMedia/);
  assert.match(component, /localStorage/);
  assert.match(component, /Feed/);
  assert.match(component, /Pet/);
  assert.match(component, /Play/);
  assert.match(component, /living cells/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(page, /<LiviCompanion \/>/);
  assert.match(layout, /themeColor:\s*"#071724"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
