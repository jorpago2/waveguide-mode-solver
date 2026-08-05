import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes complete social and browser metadata", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const metadata of ["theme-color", "canonical", "favicon.svg", "og:site_name", "og:title", "og:description", "og:type", "og:url", "twitter:card", "twitter:title", "twitter:description"]) {
    assert.match(html, new RegExp(metadata));
  }
});

test("waits for explicit user action before solving modes", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /Configure the cross-section, then select Solve modes\./);
  assert.doesNotMatch(app, /runSolverWorker<SolverResult>\(\{ kind: "solve", config: initialConfig \}\)/);
});
