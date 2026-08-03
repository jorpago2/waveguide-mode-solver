import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = resolve(root, "rust/bend-solver/Cargo.toml");
const portableBin = resolve(root, ".rustup-local/toolchains/1.97.1-x86_64-pc-windows-gnu/bin");
const portableCargo = resolve(portableBin, "cargo.exe");
const cargo = process.env.CARGO || (existsSync(portableCargo) ? portableCargo : "cargo");
const build = spawnSync(cargo, ["build", "--manifest-path", manifest, "--target", "wasm32-unknown-unknown", "--release"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PATH: existsSync(portableCargo) ? `${portableBin};${process.env.PATH}` : process.env.PATH },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const source = resolve(root, "rust/bend-solver/target/wasm32-unknown-unknown/release/mode_solver_core.wasm");
const destination = resolve(root, "src/wasm/mode_solver_core.wasm");
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
