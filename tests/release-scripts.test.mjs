import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const project = process.cwd();
function fixture() {
  const parent = resolve(".local-backups/release-script-tests");
  mkdirSync(parent, { recursive: true });
  const folder = mkdtempSync(join(parent, "fixture-"));
  for (const dir of ["src-tauri", "scripts", "node_modules/@tauri-apps/cli"])
    mkdirSync(join(folder, dir), { recursive: true });
  for (const file of [
    "package.json",
    "package-lock.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.release.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "scripts/setup-updater.ps1",
    "scripts/set-version.mjs",
    "scripts/check-release.mjs",
  ])
    copyFileSync(resolve(file), join(folder, file));
  // Run the real installed signer; keep all fixture secrets outside tracked files.
  writeFileSync(
    join(folder, "node_modules/@tauri-apps/cli/package.json"),
    '{"type":"commonjs"}',
  );
  writeFileSync(
    join(folder, "node_modules/@tauri-apps/cli/tauri.js"),
    `require(${JSON.stringify(join(project, "node_modules/@tauri-apps/cli/tauri.js"))});`,
  );
  execFileSync("git", ["init", "--quiet"], {
    cwd: folder,
    stdio: "ignore",
    windowsHide: true,
  });
  const json = (name) => JSON.parse(readFileSync(join(folder, name), "utf8"));
  const save = (name, value) =>
    writeFileSync(join(folder, name), JSON.stringify(value));
  // Public configuration may already exist after the owner's initial setup.
  const conf = json("src-tauri/tauri.conf.json");
  conf.plugins.updater.pubkey = "";
  save("src-tauri/tauri.conf.json", conf);
  const run = (file, ...args) =>
    spawnSync(process.execPath, [join(folder, file), ...args], {
      cwd: folder,
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        RELEASE_TAG: "",
        GITHUB_REPOSITORY: "Ryoran-ran/React-Tauri-household",
      },
    });
  return { folder, json, save, run };
}

test("version bump synchronizes manifests without changing dependency versions", () => {
  const { json, run, folder } = fixture();
  const dependencies =
    json("package-lock.json").packages["node_modules/fsevents"];
  assert.equal(run("scripts/set-version.mjs", "0.10.1").status, 0);
  assert.equal(json("package.json").version, "0.10.1");
  assert.equal(json("package-lock.json").packages[""].version, "0.10.1");
  assert.equal(json("src-tauri/tauri.conf.json").version, "0.10.1");
  assert.deepEqual(
    json("package-lock.json").packages["node_modules/fsevents"],
    dependencies,
  );
  assert.match(
    readFileSync(join(folder, "src-tauri/Cargo.lock"), "utf8"),
    /name = "hibi-kakeibo"\r?\nversion = "0.10.1"/,
  );
  assert.notEqual(run("scripts/set-version.mjs", "v0.10.2").status, 0);
  assert.equal(json("package.json").version, "0.10.1");
});

test(
  "key setup uses a real encrypted signer key, is repeatable, and refuses rotation",
  { skip: process.platform !== "win32" },
  () => {
    const { folder, json, save, run } = fixture();
    const setup = () =>
      spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(folder, "scripts/setup-updater.ps1"),
        ],
        { cwd: folder, encoding: "utf8", windowsHide: true },
      );
    assert.notEqual(run("scripts/check-release.mjs").status, 0);
    assert.equal(setup().status, 0, "Initial key setup must succeed");
    const key = readFileSync(join(folder, ".local-secrets/updater.key"));
    const password = readFileSync(
      join(folder, ".local-secrets/updater-password.txt"),
      "utf8",
    );
    assert.ok(password.length >= 40);
    const again = setup();
    assert.equal(again.status, 0);
    assert.ok(
      !again.stdout.includes(password) && !again.stderr.includes(password),
    );
    assert.ok(
      key.equals(readFileSync(join(folder, ".local-secrets/updater.key"))),
      "Existing signing key must be reused",
    );
    assert.equal(run("scripts/check-release.mjs").status, 0);
    const payload = join(folder, "inert.txt");
    writeFileSync(payload, "Signed fixture");
    const sign = spawnSync(
      process.execPath,
      [
        resolve("node_modules/@tauri-apps/cli/tauri.js"),
        "signer",
        "sign",
        "-f",
        join(folder, ".local-secrets/updater.key"),
        "-p",
        password,
        payload,
      ],
      { cwd: folder, stdio: "ignore", windowsHide: true },
    );
    assert.equal(sign.status, 0, "Generated password must unlock the key");
    const config = json("src-tauri/tauri.conf.json");
    config.plugins.updater.pubkey = "different-existing-key";
    save("src-tauri/tauri.conf.json", config);
    assert.notEqual(setup().status, 0);
    assert.ok(
      key.equals(readFileSync(join(folder, ".local-secrets/updater.key"))),
    );
  },
);

test("release validation rejects version drift, wrong repository, and tracked database", () => {
  const { folder, json, save, run } = fixture();
  const config = json("src-tauri/tauri.conf.json");
  const keyRecord = Buffer.alloc(42);
  keyRecord.write("Ed");
  config.plugins.updater.pubkey = Buffer.from(
    `untrusted comment: structural test fixture\n${keyRecord.toString("base64")}\n`,
  ).toString("base64");
  save("src-tauri/tauri.conf.json", config);
  assert.equal(run("scripts/check-release.mjs").status, 0);
  const pkg = json("package.json");
  save("package.json", { ...pkg, version: "99.0.0" });
  assert.notEqual(run("scripts/check-release.mjs").status, 0);
  save("package.json", pkg);
  const endpoint = config.plugins.updater.endpoints;
  config.plugins.updater.endpoints = [
    "https://github.com/wrong/repository/releases/latest/download/latest.json",
  ];
  save("src-tauri/tauri.conf.json", config);
  assert.notEqual(run("scripts/check-release.mjs").status, 0);
  config.plugins.updater.endpoints = endpoint;
  save("src-tauri/tauri.conf.json", config);
  writeFileSync(
    join(folder, "fake.sqlite3"),
    "This is not personal data or a real database.",
  );
  execFileSync("git", ["add", "fake.sqlite3"], {
    cwd: folder,
    stdio: "ignore",
    windowsHide: true,
  });
  assert.notEqual(run("scripts/check-release.mjs").status, 0);
});
