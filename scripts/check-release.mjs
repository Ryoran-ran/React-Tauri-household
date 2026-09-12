import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const pkg = json("package.json"),
  config = json("src-tauri/tauri.conf.json");
const fail = (text) => {
  throw new Error(text);
};
if (
  config.version !== pkg.version ||
  json("package-lock.json").version !== pkg.version ||
  json("package-lock.json").packages[""].version !== pkg.version
)
  fail("Application versions differ.");
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").match(
  /\[package\][\s\S]*?\nversion = "([^"]+)"/,
)?.[1];
if (cargo !== pkg.version) fail("Cargo version differs.");
const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8").match(
  /name = "hibi-kakeibo"\r?\nversion = "([^"]+)"/,
)?.[1];
if (cargoLock !== pkg.version) fail("Cargo lock version differs.");
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${pkg.version}`)
  fail("Tag must match the application version.");
const updater = config.plugins?.updater;
const publicKey = updater?.pubkey?.trim();
const decodedKey = Buffer.from(publicKey ?? "", "base64").toString("utf8");
const keyRecord = Buffer.from(decodedKey.split(/\r?\n/)[1] ?? "", "base64");
if (
  !publicKey ||
  !decodedKey.startsWith("untrusted comment:") ||
  keyRecord.length !== 42 ||
  keyRecord.subarray(0, 2).toString() !== "Ed"
)
  fail(
    "Run scripts/setup-updater.ps1 and commit the public key before publishing.",
  );
const repo =
  process.env.GITHUB_REPOSITORY ?? "Ryoran-ran/React-Tauri-household";
if (
  updater.endpoints?.length !== 1 ||
  updater.endpoints[0] !==
    `https://github.com/${repo}/releases/latest/download/latest.json`
)
  fail("Updater endpoint must match the release repository.");
if (
  updater.dangerousInsecureTransportProtocol ||
  updater.dangerousAcceptInvalidCerts ||
  updater.dangerousAcceptInvalidHostnames
)
  fail("Insecure updater transport is not allowed.");
if (
  json("src-tauri/tauri.release.conf.json").bundle?.createUpdaterArtifacts !==
  true
)
  fail("Signed updater artifacts must be enabled.");
const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0");
if (
  tracked.some(
    (name) =>
      /(^|\/)(\.local-secrets|\.local-backups|test-results)\//.test(name) ||
      /\.(key|sqlite3|sqlite|db)(-|$)/i.test(name),
  )
)
  fail(
    "Private keys or local databases are tracked. Remove them from Git before releasing.",
  );
console.log(`Release configuration validated for v${pkg.version}.`);
