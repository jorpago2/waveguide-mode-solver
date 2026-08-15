import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const html = await readFile("dist/index.html", "utf8");
const assets = [...new Set([...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.js)"/g)].map((match) => match[1]))];

if (assets.length === 0) throw new Error("No initial JavaScript assets found in dist/index.html.");

const gzipBytes = (
  await Promise.all(assets.map(async (asset) => gzipSync(await readFile(`dist/assets/${asset}`)).byteLength))
).reduce((total, bytes) => total + bytes, 0);
const maximumBytes = 180 * 1024;
const measuredKiB = (gzipBytes / 1024).toFixed(1);

if (gzipBytes > maximumBytes) {
  throw new Error(`Initial JavaScript is ${measuredKiB} KiB gzip; budget is 180.0 KiB.`);
}

globalThis.console.log(`Initial JavaScript: ${measuredKiB} KiB gzip (budget 180.0 KiB).`);

const builtAssets = await readdir("dist/assets");
const evidence = await Promise.all(builtAssets.filter((asset) => /\.(?:js|css|wasm)$/.test(asset)).map(async (asset) => {
  const source = await readFile(`dist/assets/${asset}`);
  return { asset, extension: asset.split(".").at(-1), raw: source.byteLength, gzip: gzipSync(source).byteLength };
}));
const budgetsKiB = { js: 1450, css: 930, wasm: 700 };
for (const [extension, budgetKiB] of Object.entries(budgetsKiB)) {
  const largest = evidence.filter((entry) => entry.extension === extension).toSorted((left, right) => right.raw - left.raw)[0];
  if (!largest) throw new Error(`No ${extension.toUpperCase()} asset found in dist/assets.`);
  if (largest.raw > budgetKiB * 1024) throw new Error(`${largest.asset} is ${(largest.raw / 1024).toFixed(1)} KiB raw; ${extension.toUpperCase()} budget is ${budgetKiB} KiB.`);
  globalThis.console.log(`${extension.toUpperCase()} evidence: ${largest.asset} ${(largest.raw / 1024).toFixed(1)} KiB raw / ${(largest.gzip / 1024).toFixed(1)} KiB gzip.`);
}
