import { copyFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = resolve(root, "rust/bend-solver/Cargo.toml");
const build = spawnSync("cargo", ["build", "--manifest-path", manifest, "--target", "wasm32-unknown-unknown", "--release"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const source = resolve(root, "rust/bend-solver/target/wasm32-unknown-unknown/release/bend_solver.wasm");
const destination = resolve(root, "src/wasm/bend_solver.wasm");
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
