import { readFileSync, writeFileSync } from "node:fs";
const version = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? ""))
  throw new Error("Usage: node scripts/set-version.mjs 0.10.1");
for (const path of [
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
]) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  value.version = version;
  if (path === "package-lock.json") value.packages[""].version = version;
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
const manifest = "src-tauri/Cargo.toml";
writeFileSync(
  manifest,
  readFileSync(manifest, "utf8").replace(
    /(\[package\][\s\S]*?\nversion = ")[^"]+"/,
    `$1${version}"`,
  ),
);
const lock = "src-tauri/Cargo.lock";
writeFileSync(
  lock,
  readFileSync(lock, "utf8").replace(
    /(name = "hibi-kakeibo"\r?\nversion = ")[^"]+"/,
    `$1${version}"`,
  ),
);
console.log(
  `Version set to ${version}. Run tests, then commit and tag v${version}.`,
);
