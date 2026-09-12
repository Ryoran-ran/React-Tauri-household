import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

// Exercise the real Tauri updater and signature verifier with an inert local payload.
// Only the debug build can stop before the Windows installer is launched.
export async function updaterScenario(
  directory: string,
  start: (env: Record<string, string>) => Promise<Page>,
  addAfterFailure: () => Promise<void>,
) {
  const key = join(directory, "fixture.key");
  const payload = join(directory, "fixture.exe");
  const cli = resolve("node_modules/@tauri-apps/cli/tauri.js");
  const run = (args: string[]) =>
    execFileSync(process.execPath, [cli, "signer", ...args], {
      stdio: "ignore",
      windowsHide: true,
    });
  run(["generate", "--ci", "-p", "test-only", "-w", key]);
  const original = Buffer.from(
    "HIBI inert signed test payload. This is not an executable.",
  );
  await writeFile(payload, original);
  run(["sign", "-f", key, "-p", "test-only", payload]);
  const signature = (await readFile(`${payload}.sig`, "utf8")).trim();
  let mode: "available" | "latest" | "error" | "tampered" = "available";
  let baseUrl = "";
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === "/latest.json") {
      if (mode === "error") {
        response.writeHead(503).end();
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          version: mode === "latest" ? "0.0.1" : "99.0.0",
          notes: "テスト用の更新です。<b>HTMLとして実行しません</b>",
          platforms: {
            "windows-x86_64": { url: `${baseUrl}/fixture.exe`, signature },
          },
        }),
      );
    } else if (request.url === "/fixture.exe") {
      response.end(mode === "tampered" ? Buffer.from("tampered") : original);
    } else response.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  const config = join(directory, "updater.json");
  await writeFile(
    config,
    JSON.stringify({
      pubkey: (await readFile(`${key}.pub`, "utf8")).trim(),
      endpoints: [`${baseUrl}/latest.json`],
    }),
  );
  const backups = () => readdir(join(directory, "backups")).catch(() => []);
  try {
    const page = await start({
      HIBI_TEST_UPDATER_CONFIG: config,
      HIBI_TEST_UPDATE_NO_INSTALL: "1",
    });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "設定", exact: true })
      .dispatchEvent("click");
    await page
      .getByRole("button", { name: "アップデート", exact: true })
      .dispatchEvent("click");
    expect(requests).toEqual([]); // Visiting Settings never checks the network automatically.
    const click = (name: string) =>
      page.getByRole("button", { name, exact: true }).dispatchEvent("click");
    await expect(
      page.getByRole("button", { name: "更新を確認", exact: true }),
    ).toBeEnabled();
    mode = "latest";
    await click("更新を確認");
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "現在のバージョンは最新です。",
    );
    mode = "error";
    await click("更新を確認");
    await expect(page.getByRole("alert")).toContainText(
      "更新情報を取得できませんでした",
    );
    await expect(
      page.getByText("現在のバージョンは最新です。", { exact: true }),
    ).not.toBeVisible();
    mode = "available";
    await click("更新を確認");
    await expect(page.getByTestId("available-update")).toContainText("v99.0.0");
    await expect(page.locator(".update-release pre")).toContainText(
      "<b>HTMLとして実行しません</b>",
    );
    await expect(page.locator(".update-release pre b")).toHaveCount(0);
    await click("更新する");
    await click("キャンセル");
    expect(await backups()).toEqual([]);
    expect(requests.filter((item) => item.endsWith("/fixture.exe"))).toEqual(
      [],
    );
    mode = "tampered";
    await click("更新する");
    await click("バックアップして更新");
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "署名検証に失敗しました",
    );
    expect(await backups()).toEqual([]);
    await page.screenshot({
      path: "test-results/update-signature-error.png",
      fullPage: true,
    });
    await click("キャンセル");
    await addAfterFailure(); // DB write guard must be released after a failed download.
    mode = "available";
    await writeFile(join(directory, "backups"), "block the backup directory");
    await click("更新する");
    await click("バックアップして更新");
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "バックアップ先を作成できませんでした",
    );
    await click("キャンセル");
    await unlink(join(directory, "backups"));
    await click("更新する");
    await click("バックアップして更新");
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      "更新処理が完了しました。",
    );
    const names = await backups();
    expect(names).toHaveLength(1);
    const saved = await readFile(join(directory, "backups", names[0]));
    expect(saved.subarray(0, 16).toString()).toBe("SQLite format 3\0");
    expect(saved.includes(Buffer.from("更新前の記録"))).toBe(true);
    expect(saved.includes(Buffer.from("更新失敗後の記録"))).toBe(true);
    await expect(page.getByTestId("update-backup-path")).toContainText(
      names[0],
    );
    await page.screenshot({
      path: "test-results/update-complete.png",
      fullPage: true,
    });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "ダッシュボード", exact: true })
      .dispatchEvent("click");
    await expect(page.getByTestId("monthly-normal")).toHaveText("¥900");
    expect(
      requests.every(
        (item) => item === "GET /latest.json" || item === "GET /fixture.exe",
      ),
    ).toBe(true);
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
}
