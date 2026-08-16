import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes complete social and browser metadata", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const metadata of ["theme-color", "canonical", "favicon.svg", "og:site_name", "og:title", "og:description", "og:type", "og:url", "twitter:card", "twitter:title", "twitter:description"]) {
    assert.match(html, new RegExp(metadata));
  }
});

test("builds the Carbon UI contract", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const carbon = await readFile(new URL("../src/carbon.scss", import.meta.url), "utf8");
  assert.match(carbon, /@use ["']@carbon\/react["']/);
  assert.doesNotMatch(styles, /tailwindcss|@theme inline/);
  assert.match(app, /<ScientificAppShell/);
});

test("waits for explicit user action before solving modes", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /Configure the cross-section, then select Solve modes\./);
  assert.doesNotMatch(app, /runSolverWorker<SolverResult>\(\{ kind: "solve", config: initialConfig \}\)/);
});

test("reveals results and reports solver state after an explicit solve", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /setResult\(next\);[\s\S]*closeConfiguration\(\);/);
  for (const label of ["Not solved", "Solving", "Solved", "Stale"]) assert.match(app, new RegExp(label));
  assert.match(app, /const failedCheckCount =/);
  assert.match(app, /const solverWarningCount =/);
  assert.match(app, /const solveStateLabel =/);
  assert.match(app, /<ScientificHeader[\s\S]*label: solveStateLabel/);
  assert.match(app, /<ScientificStatusBar[\s\S]*label: solveStateLabel/);
  assert.doesNotMatch(app, /validation issue\(s\)|convergence pending/);
});

test("keeps the scientific result ahead of introductory chrome", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /className="workspace-header"/);
  assert.doesNotMatch(app, /className="product-copy"/);
  assert.match(app, /id="solver"[^>]+aria-label="Mode solver"/);
  assert.doesNotMatch(app, /view-heading"><div className="view-title">\{icon\}<h1 id=\{id\}>\{title\}<\/h1><\/div><p>/);
});

test("keeps React as the sole owner of the application UI root", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const plotConfig = await readFile(new URL("../src/plotConfig.ts", import.meta.url), "utf8");

  assert.equal((main.match(/\bcreateRoot\s*\(/g) ?? []).length, 1);
  assert.match(main, /createRoot\(document\.getElementById\(["']root["']\)!\)/);

  const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  const bodyWithoutRuntime = body.replace(/<div\s+id=["']root["']\s*>\s*<\/div>/i, "").replace(/<script\b[\s\S]*?<\/script>/gi, "").trim();
  assert.equal(bodyWithoutRuntime, "");

  assert.doesNotMatch(app, /document\.querySelector(?:<[^>]+>)?\(\s*["']#mode-solver-form["']\s*\)[\s\S]{0,80}requestSubmit\s*\(/);
  assert.doesNotMatch(plotConfig, /addEventListener\s*\(/);
  assert.doesNotMatch(plotConfig, /querySelectorAll\s*\(/);
});
