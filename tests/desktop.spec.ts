import {
  test,
  expect,
  chromium,
  type Browser,
  type Page,
} from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { routineScenario } from "./routine-scenario";

let child: ChildProcess;
let browser: Browser;
let page: Page;
let testDirectory: string;
const failures: string[] = [];
const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

test("実機: AI分析の年間・四半期・任意期間と比較範囲", async () => {
  await start();
  await add("100", "前四半期", "normal", "食費", "2025-12-31");
  await add("200", "年初", "normal", "食費", "2026-01-01");
  await add("300", "四半期末", "normal", "食費", "2026-03-31");
  await add("400", "次の四半期", "normal", "食費", "2026-04-01");
  await add("500", "年末", "normal", "食費", "2026-12-31");
  await add("600", "翌年", "normal", "食費", "2027-01-01");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "AI分析プロンプト", exact: true })
    .dispatchEvent("click");
  await page.getByLabel("分析する範囲", { exact: true }).selectOption("year");
  await page.getByLabel("分析する年", { exact: true }).fill("2026");
  await expect(page.getByTestId("analysis-period")).toContainText(
    "2026-01-01 〜 2026-12-31",
  );
  await expect(page.getByTestId("analysis-comparison")).toContainText(
    "2025-01-01 〜 2025-12-31",
  );
  await page
    .getByRole("button", { name: "プロンプトを生成", exact: true })
    .dispatchEvent("click");
  const preview = page.getByLabel("生成したプロンプト", { exact: true });
  const parsed = async () =>
    JSON.parse((await preview.inputValue()).split("【家計データ】\n")[1]);
  expect((await parsed()).対象期間.確定分.通常支出).toBe(1400);
  expect((await parsed()).対象期間.月別収支).toHaveLength(4);
  expect((await parsed()).比較期間.確定分.通常支出).toBe(100);
  await page.screenshot({
    path: "test-results/analysis-year.png",
    fullPage: true,
  });
  await page
    .getByLabel("分析する範囲", { exact: true })
    .selectOption("quarter");
  await page.getByLabel("分析する四半期", { exact: true }).selectOption("1");
  await expect(page.getByTestId("analysis-period")).toContainText(
    "2026-01-01 〜 2026-03-31",
  );
  await expect(page.getByTestId("analysis-comparison")).toContainText(
    "2025-10-01 〜 2025-12-31",
  );
  expect((await parsed()).対象期間.確定分.通常支出).toBe(500);
  await page.screenshot({
    path: "test-results/analysis-quarter.png",
    fullPage: true,
  });
  await page.getByLabel("分析する範囲", { exact: true }).selectOption("custom");
  await page.getByLabel("分析開始日", { exact: true }).fill("2026-03-31");
  await page.getByLabel("分析終了日", { exact: true }).fill("2026-04-01");
  await expect(page.getByTestId("analysis-comparison")).toContainText(
    "2026-03-29 〜 2026-03-30",
  );
  expect((await parsed()).対象期間.確定分.通常支出).toBe(700);
  await page
    .getByLabel("直前の同じ日数の期間との比較を含める", { exact: true })
    .dispatchEvent("click");
  expect(await parsed()).not.toHaveProperty("比較期間");
  await page.getByLabel("分析終了日", { exact: true }).fill("2026-03-30");
  await expect(page.getByRole("alert")).toHaveText(
    "終了日は開始日以降にしてください。",
  );
  await expect(
    page.getByRole("button", { name: "プロンプトを生成", exact: true }),
  ).toBeDisabled();
  await expect(preview).not.toBeVisible();
});

test("実機: AI分析プロンプトの集計、共有範囲、コピーと手動コピー", async () => {
  await start();
  const navigate = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "AI分析プロンプト", exact: true })
      .dispatchEvent("click");
  await navigate();
  await expect(
    page.getByRole("button", { name: "プロンプトを生成", exact: true }),
  ).toBeDisabled();
  await add("250000", "共有前に確認する給与メモ", "income", "給与");
  await add("200000", "共有前に確認する生活費メモ", "normal");
  await add("20000", "税金メモ", "special", "税金");
  await add("65000", "証券口座メモ", "transfer", "投資");
  await navigate();
  await page
    .getByLabel("追加で相談したいこと", { exact: true })
    .fill("投資額を維持して生活費を減らしたい");
  await page
    .getByRole("button", { name: "プロンプトを生成", exact: true })
    .dispatchEvent("click");
  const preview = page.getByLabel("生成したプロンプト", { exact: true });
  await expect(preview).toBeVisible();
  const initial = await preview.inputValue();
  expect(initial).toContain("投資額を維持して生活費を減らしたい");
  expect(initial).not.toContain("共有前に確認する");
  const report = JSON.parse(initial.split("【家計データ】\n")[1]);
  expect(report.対象期間.確定分).toMatchObject({
    収入: 250000,
    通常支出: 200000,
    生活収支: 50000,
    税金特別支出: 20000,
    投資貯蓄への資金移動: 65000,
    現金収支: -35000,
  });
  await page
    .getByLabel("収支の明細を含める", { exact: true })
    .dispatchEvent("click");
  await expect(preview).toHaveValue(/"明細"/);
  expect(await preview.inputValue()).not.toContain("共有前に確認する");
  await page.getByLabel("メモを含める", { exact: true }).dispatchEvent("click");
  await expect(preview).toHaveValue(/共有前に確認する/);
  await page
    .getByLabel("収支の明細を含める", { exact: true })
    .dispatchEvent("click");
  await expect(preview).not.toHaveValue(/共有前に確認する/);
  // Capture the clipboard boundary without overwriting the person's OS clipboard.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copiedPrompt = text;
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "プロンプトをコピー", exact: true })
    .dispatchEvent("click");
  await expect(
    page.getByText("コピーしました。利用するAIの入力欄に貼り付けてください。", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.dataset.copiedPrompt),
  ).toBe(await preview.inputValue());
  await page.screenshot({
    path: "test-results/analysis-prompt.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard unavailable");
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "プロンプトをコピー", exact: true })
    .dispatchEvent("click");
  await expect(
    page.getByText(
      "自動コピーができませんでした。選択した本文を Ctrl+C でコピーしてください。",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await preview.evaluate(
      (node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart,
    ),
  ).toBe((await preview.inputValue()).length);
  await page.getByLabel("分析する月", { exact: true }).fill("2099-01");
  await expect(
    page.getByRole("button", { name: "プロンプトを生成", exact: true }),
  ).toBeDisabled();
  await expect(preview).not.toBeVisible();
  await page.setViewportSize({ width: 900, height: 650 });
  await page
    .getByRole("button", { name: "この端末だけに保存", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "この端末だけに保存", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "AI分析プロンプト", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "AI分析プロンプト", exact: true }),
  ).toBeInViewport();
});

test("実機: カテゴリと支払い方法の並び替え、選択肢への反映と再起動保持", async () => {
  await start();
  const navigate = (name: string) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .dispatchEvent("click");
  const press = (name: string) =>
    page.getByRole("button", { name, exact: true }).dispatchEvent("click");
  await navigate("カテゴリ管理");
  await press("並び替え");
  await expect(
    page.getByRole("button", { name: "食費を上へ移動", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "貯蓄を下へ移動", exact: true }),
  ).toBeDisabled();
  await press("日用品を上へ移動");
  await expect(page.getByTestId("category-item").first()).toContainText(
    "日用品",
  );
  await expect(
    page.getByText("並び順を保存しました", { exact: true }),
  ).toBeVisible();
  await press("日用品を編集");
  await page.getByLabel("カテゴリ名", { exact: true }).fill("生活用品");
  await press("変更を保存");
  await expect(page.getByTestId("category-item").first()).toContainText(
    "生活用品",
  );
  await page.getByLabel("カテゴリ名", { exact: true }).fill("追加カテゴリ");
  await press("追加する");
  await expect(page.getByTestId("category-item").last()).toContainText(
    "追加カテゴリ",
  );
  await press("生活用品を下へ移動");
  await expect(page.getByTestId("category-item").first()).toContainText("食費");
  await press("生活用品を上へ移動");
  await expect(page.getByTestId("category-item").first()).toContainText(
    "生活用品",
  );
  await page.screenshot({
    path: "test-results/category-order.png",
    fullPage: true,
  });
  await press("並び替えを完了");
  await navigate("設定");
  await press("クレジットカードを編集");
  await page.getByLabel("新しい記録で最初に選択する").dispatchEvent("click");
  await press("変更を保存");
  await expect(page.getByTestId("payment-method-item").nth(1)).toContainText(
    "初期選択",
  );
  await press("並び替え");
  await expect(
    page.getByRole("button", { name: "現金を上へ移動", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "電子マネーを下へ移動", exact: true }),
  ).toBeDisabled();
  await press("銀行振込を上へ移動");
  await expect(page.getByTestId("payment-method-item").nth(2)).toContainText(
    "銀行振込",
  );
  await press("銀行振込を上へ移動");
  await expect(page.getByTestId("payment-method-item").nth(1)).toContainText(
    "銀行振込",
  );
  await press("銀行振込を上へ移動");
  await expect(page.getByTestId("payment-method-item").first()).toContainText(
    "銀行振込",
  );
  await press("銀行振込を下へ移動");
  await expect(page.getByTestId("payment-method-item").first()).toContainText(
    "現金",
  );
  await press("銀行振込を上へ移動");
  await expect(page.getByTestId("payment-method-item").first()).toContainText(
    "銀行振込",
  );
  await page.screenshot({
    path: "test-results/payment-order.png",
    fullPage: true,
  });
  await press("並び替えを完了");
  await stop();
  await start();
  await navigate("カテゴリ管理");
  await expect(page.getByTestId("category-item").first()).toContainText(
    "生活用品",
  );
  await expect(page.getByTestId("category-item").last()).toContainText(
    "追加カテゴリ",
  );
  await navigate("設定");
  await expect(page.getByTestId("payment-method-item").first()).toContainText(
    "銀行振込",
  );
  await press("収支を記録");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("カテゴリ", { exact: true }).locator("option").nth(1),
  ).toHaveText("生活用品");
  await expect(
    dialog.getByLabel("支払い方法", { exact: true }).locator("option").nth(1),
  ).toHaveText("銀行振込");
  await expect(
    dialog.getByLabel("支払い方法", { exact: true }).locator("option:checked"),
  ).toHaveText("クレジットカード");
  await dialog
    .getByRole("button", { name: "キャンセル", exact: true })
    .dispatchEvent("click");
  await navigate("収支の履歴");
  await expect(
    page.getByLabel("カテゴリ", { exact: true }).locator("option").nth(2),
  ).toHaveText("生活用品");
});

test("実機: 給与の予定日変更で同じ月に重複せず、個別変更を保持", async () => {
  await start();
  const navigate = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "定期収支", exact: true })
      .dispatchEvent("click");
  await navigate();
  await page
    .getByRole("button", { name: "定期収支を追加", exact: true })
    .dispatchEvent("click");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前", { exact: true }).fill("給与の重複防止");
  await dialog
    .getByRole("button", { name: "収入", exact: true })
    .dispatchEvent("click");
  await dialog.getByLabel("金額", { exact: true }).fill("263744");
  await dialog.getByLabel("開始日", { exact: true }).fill("2026-09-01");
  await dialog.getByLabel("終了日", { exact: true }).fill("2026-10-31");
  await dialog
    .getByLabel("予定日が土日・祝日の場合", { exact: true })
    .selectOption("previous");
  await dialog
    .getByRole("button", { name: "設定を保存", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("表示する月", { exact: true }).fill("2026-09");
  await page
    .getByTestId("recurring-entry")
    .getByRole("button", { name: "給与の重複防止の予定を確認", exact: true })
    .dispatchEvent("click");
  await dialog.getByLabel("日付", { exact: true }).fill("2026-09-25");
  await dialog.getByLabel("金額", { exact: true }).fill("264000");
  await dialog.getByLabel("金額", { exact: true }).press("Enter");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "繰り返し設定", exact: true })
    .dispatchEvent("click");
  await page
    .getByRole("button", { name: "給与の重複防止を編集", exact: true })
    .dispatchEvent("click");
  await dialog.getByLabel("開始日", { exact: true }).fill("2026-09-25");
  await dialog
    .getByRole("button", { name: "設定を保存", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "月ごとの収支", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).toContainText("264,000");
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-09-25");
  await page.getByLabel("表示する月", { exact: true }).fill("2026-10");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-10-23");
  await expect(page.getByTestId("recurring-entry")).toContainText("263,744");
  await stop();
  await start();
  await navigate();
  await page.getByLabel("表示する月", { exact: true }).fill("2026-09");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).toContainText("264,000");
  await page.screenshot({
    path: "test-results/payday-dedup.png",
    fullPage: true,
  });
});

test("実機: 内閣府から祝日取得、連休回避、再起動後の保存", async () => {
  await start();
  const navigate = (name: string) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .dispatchEvent("click");
  await navigate("定期収支");
  await page
    .getByRole("button", { name: "定期収支を追加", exact: true })
    .dispatchEvent("click");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前", { exact: true }).fill("祝日の給与");
  await dialog
    .getByRole("button", { name: "収入", exact: true })
    .dispatchEvent("click");
  await dialog.getByLabel("金額", { exact: true }).fill("250000");
  await dialog.getByLabel("開始日", { exact: true }).fill("2026-09-23");
  await dialog.getByLabel("終了日", { exact: true }).fill("2026-09-23");
  await dialog
    .getByLabel("予定日が土日・祝日の場合", { exact: true })
    .selectOption("previous");
  await dialog
    .getByRole("button", { name: "設定を保存", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("表示する月", { exact: true }).fill("2026-09");
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-09-23");
  await navigate("設定");
  await page
    .getByRole("button", { name: "祝日", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("holiday-info")).toContainText(
    "まだ取得していません",
  );
  await page
    .getByRole("button", { name: "祝日を取得・更新", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("holiday-info")).toContainText("最終取得", {
    timeout: 40_000,
  });
  await page.getByLabel("祝日を表示する年", { exact: true }).fill("2026");
  await expect(page.locator("tbody")).toContainText("秋分の日");
  await expect(page.locator("tbody")).toContainText("2026-09-22");
  await page.screenshot({ path: "test-results/holidays.png", fullPage: true });
  await page.getByLabel("祝日を表示する年", { exact: true }).fill("2099");
  await expect(
    page.getByText("この年の祝日は未取得です。", { exact: true }),
  ).toBeVisible();
  await navigate("定期収支");
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-09-18");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await stop();
  await start();
  await navigate("定期収支");
  await page.getByLabel("表示する月", { exact: true }).fill("2026-09");
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-09-18");
  await navigate("設定");
  await page
    .getByRole("button", { name: "祝日", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("holiday-info")).toContainText("最終取得");
});

test("実機: 土日の前倒し・後ろ倒し、月またぎ、確定分の保持", async () => {
  await start();
  const navigate = () =>
    page
      .getByRole("navigation")
      .getByRole("button", { name: "定期収支", exact: true })
      .dispatchEvent("click");
  const setPolicy = async (value: string) => {
    await page
      .getByRole("button", { name: "繰り返し設定", exact: true })
      .dispatchEvent("click");
    await page
      .getByRole("button", { name: "土日の給与を編集", exact: true })
      .dispatchEvent("click");
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("予定日が土日・祝日の場合", { exact: true })
      .selectOption(value);
    await dialog
      .getByRole("button", { name: "設定を保存", exact: true })
      .dispatchEvent("click");
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("button", { name: "月ごとの収支", exact: true })
      .dispatchEvent("click");
  };
  await navigate();
  await page
    .getByRole("button", { name: "定期収支を追加", exact: true })
    .dispatchEvent("click");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前", { exact: true }).fill("土日の給与");
  await dialog
    .getByRole("button", { name: "収入", exact: true })
    .dispatchEvent("click");
  await dialog.getByLabel("金額", { exact: true }).fill("250000");
  await dialog.getByLabel("開始日", { exact: true }).fill("2026-08-01");
  await dialog.getByLabel("終了日", { exact: true }).fill("2026-08-01");
  await expect(
    dialog.getByLabel("予定日が土日・祝日の場合", { exact: true }),
  ).toHaveValue("none");
  await dialog
    .getByRole("button", { name: "設定を保存", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("表示する月", { exact: true }).fill("2026-08");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await setPolicy("previous");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(0);
  await page.getByLabel("表示する月", { exact: true }).fill("2026-07");
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-07-31");
  await expect(page.getByTestId("recurring-entry")).toContainText(
    "元の予定日 2026-08-01",
  );
  await setPolicy("next");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(0);
  await page.getByLabel("表示する月", { exact: true }).fill("2026-08");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-08-03");
  await page.screenshot({
    path: "test-results/weekend-adjustment.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "土日の給与の予定を確認", exact: true })
    .dispatchEvent("click");
  await expect(dialog.getByLabel("日付", { exact: true })).toHaveValue(
    "2026-08-03",
  );
  await dialog
    .getByRole("button", { name: "変更して確定", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await setPolicy("previous");
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-08-03");
  await expect(page.getByTestId("recurring-entry")).toContainText("確定済み");
  await stop();
  await start();
  await navigate();
  await page.getByLabel("表示する月", { exact: true }).fill("2026-08");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).toContainText("2026-08-03");
});

test("実機: 支払い方法・入力テンプレート・定期収支・今回だけの金額変更", async () => {
  await start();
  await routineScenario(page);
  await stop();
  await start();
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥82,460");
  await expect(
    page.getByRole("button", { name: "毎月の家賃の予定を確認", exact: true }),
  ).toHaveCount(0);
});

async function start() {
  console.log("Starting isolated desktop app");
  child = spawn(resolve("src-tauri/target/debug/hibi-kakeibo.exe"), [], {
    windowsHide: true,
    env: {
      ...process.env,
      HIBI_TEST_DATA_DIR: testDirectory,
      WEBVIEW2_USER_DATA_FOLDER: join(testDirectory, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=19224",
    },
    stdio: "pipe",
  });
  let stderr = "";
  child.stderr?.on("data", (data) => {
    stderr += data.toString();
  });
  // Attach after native navigation; attaching to WebView2's initial about:blank
  // can leave Playwright's isolated execution world waiting for navigation.
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const targets = await (
        await fetch("http://127.0.0.1:19224/json/list", {
          signal: AbortSignal.timeout(1000),
        })
      ).json();
      if (
        targets.some((target: { url: string }) =>
          target.url.startsWith("http://tauri.localhost"),
        )
      )
        break;
    } catch {
      /* WebView2 is still starting. */
    }
    if (child.exitCode !== null) throw new Error(`App exited: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:19224", {
        timeout: 3000,
      });
      break;
    } catch (error) {
      if (attempt % 10 === 0) console.log(String(error));
      if (child.exitCode !== null) throw new Error(`App exited: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!browser) throw new Error(`WebView2 debugging unavailable: ${stderr}`);
  const context = browser.contexts()[0];
  for (let attempt = 0; attempt < 50 && !context.pages().length; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  page = context.pages()[0];
  page.setDefaultTimeout(10_000);
  console.log("Connected:", page.url());
  page.on("pageerror", (error) => failures.push(error.message));
  await expect(
    page.getByRole("heading", { name: "ダッシュボード", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "収支を記録", exact: true }),
  ).toBeEnabled();
}

async function stop() {
  if (child && child.exitCode === null) {
    const closed = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.kill();
    await closed;
  }
  if (browser) await browser.close();
}

async function add(
  amount: string,
  memo: string,
  kind: "income" | "normal" | "special" | "transfer",
  category = "食費",
  customDate = date,
) {
  await page
    .getByRole("button", { name: "収支を記録", exact: true })
    .dispatchEvent("click");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("金額", { exact: true }).fill(amount);
  await dialog.getByLabel("日付", { exact: true }).fill(customDate);
  if (kind === "income")
    await dialog
      .getByRole("button", { name: "収入", exact: true })
      .dispatchEvent("click");
  else
    await dialog
      .getByRole("radio", {
        name:
          kind === "normal"
            ? "通常支出"
            : kind === "special"
              ? "税金・特別支出"
              : "投資・貯蓄への資金移動",
      })
      .dispatchEvent("click");
  await dialog
    .getByLabel("カテゴリ", { exact: true })
    .selectOption({ label: category });
  await dialog.getByLabel("メモ").fill(memo);
  await dialog
    .getByRole("button", { name: "記録する", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
}

test.beforeEach(async () => {
  await mkdir(resolve("test-results"), { recursive: true });
  testDirectory = await mkdtemp(resolve("test-results/desktop-data-"));
});
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && page && !page.isClosed()) {
    console.log(
      await page
        .locator("body")
        .ariaSnapshot({ timeout: 3000 })
        .catch(() => "Snapshot unavailable"),
    );
    await page
      .screenshot({ path: "test-results/failure.png", timeout: 5000 })
      .catch(() => undefined);
  }
  await stop();
});

test("実機: 記録、収支分離、月別比較、絞り込み、編集、削除、再起動保持", async () => {
  await start();
  await expect(page.getByTestId("living-balance")).toHaveText("¥0");
  await expect(
    page.getByText("まだ記録がありません", { exact: true }),
  ).toBeVisible();
  await add("250000", "9月の給与", "income", "給与");
  await add("200000", "生活費の記録", "normal");
  await add("20000", "住民税の記録", "special", "税金");
  await add("65000", "証券口座へ入金", "transfer", "投資");
  await expect(page.getByTestId("monthly-income")).toHaveText("¥250,000");
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥200,000");
  await expect(page.getByTestId("living-balance")).toHaveText("+¥50,000");
  await expect(page.getByTestId("monthly-special")).toHaveText("¥20,000");
  await expect(page.getByTestId("monthly-transfer")).toHaveText("¥65,000");
  await expect(page.getByTestId("monthly-cash")).toHaveText("−¥35,000");
  await expect(
    page.getByText(
      "生活収支は黒字です。現金の減少は、特別支出・資産形成によるものです。",
    ),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });

  // Real process restart and SQLite persistence, including the original IDs.
  await stop();
  await start();
  await expect(page.getByTestId("living-balance")).toHaveText("+¥50,000");
  await expect(page.getByTestId("monthly-cash")).toHaveText("−¥35,000");

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "月別集計", exact: true })
    .dispatchEvent("click");
  const monthRow = page.getByRole("row").filter({
    has: page.getByRole("button", {
      name: `${today.getMonth() + 1}月`,
      exact: true,
    }),
  });
  await expect(monthRow).toContainText("+¥50,000");
  await expect(monthRow).toContainText("−¥35,000");
  await page.screenshot({
    path: "test-results/monthly-report.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "前年", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("row").last()).not.toContainText("250,000");

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "収支の履歴", exact: true })
    .dispatchEvent("click");
  await page.getByLabel("収入 / 支出", { exact: true }).selectOption("expense");
  await page.getByLabel("支出の種類", { exact: true }).selectOption("transfer");
  await page
    .getByLabel("カテゴリ", { exact: true })
    .selectOption({ label: "投資" });
  await page.getByLabel("メモを検索").fill("証券");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("証券口座へ入金");
  await page
    .getByRole("button", { name: "証券口座へ入金を編集", exact: true })
    .dispatchEvent("click");
  await page
    .getByRole("dialog")
    .getByLabel("金額", { exact: true })
    .fill("60000");
  await page
    .getByRole("button", { name: "変更を保存", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("tbody")).toContainText("60,000");
  await page
    .getByRole("button", { name: "すべて解除", exact: true })
    .dispatchEvent("click");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByLabel("開始日", { exact: true })
    .fill(`${today.getFullYear() + 1}-01-01`);
  await expect(page.getByText("条件に一致する記録がありません")).toBeVisible();
  await page
    .getByLabel("終了日", { exact: true })
    .fill(`${today.getFullYear()}-01-01`);
  await expect(page.getByRole("alert")).toHaveText(
    "終了日は開始日以降にしてください。",
  );
  await page
    .getByRole("button", { name: "すべて解除", exact: true })
    .dispatchEvent("click");

  // Category rename updates existing rows; deletion keeps the monetary records.
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "カテゴリ管理", exact: true })
    .dispatchEvent("click");
  await page.getByLabel("カテゴリ名", { exact: true }).fill("学習費");
  await page
    .getByRole("button", { name: "追加する", exact: true })
    .dispatchEvent("click");
  await expect(page.getByText("学習費", { exact: true })).toBeVisible();
  await page.getByLabel("カテゴリ名", { exact: true }).fill("学習費");
  await page
    .getByRole("button", { name: "追加する", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("alert")).toContainText("同じ名前のカテゴリ");
  await page
    .getByRole("button", { name: "投資を編集", exact: true })
    .dispatchEvent("click");
  await page.getByLabel("カテゴリ名", { exact: true }).fill("資産形成");
  await page
    .getByRole("button", { name: "変更を保存", exact: true })
    .dispatchEvent("click");
  await expect(page.getByText("資産形成", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "資産形成を削除", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog")).toContainText("1件の記録");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "削除する", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "収支の履歴", exact: true })
    .dispatchEvent("click");
  await page.getByLabel("カテゴリ", { exact: true }).selectOption("none");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("60,000");
  await expect(page.locator("tbody")).toContainText("未分類");
  await page
    .getByRole("button", { name: "証券口座へ入金を削除", exact: true })
    .dispatchEvent("click");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "キャンセル", exact: true })
    .dispatchEvent("click");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "証券口座へ入金を削除", exact: true })
    .dispatchEvent("click");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "削除する", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("条件に一致する記録がありません")).toBeVisible();

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "ダッシュボード", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("monthly-cash")).toHaveText("+¥30,000");
  await add("60000", "赤字確認の生活費", "normal");
  await expect(page.getByTestId("living-balance")).toHaveText("−¥10,000");
  await expect(
    page.getByText(
      "通常の生活支出が収入を上回っています。支出の内訳を確認しましょう。",
    ),
  ).toBeVisible();

  // Continued entry preserves date/category/kind and rejects zero amounts.
  await page
    .getByRole("button", { name: "収支を記録", exact: true })
    .dispatchEvent("click");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("金額", { exact: true }).fill("0");
  await dialog
    .getByRole("button", { name: "記録する", exact: true })
    .dispatchEvent("click");
  await expect(dialog.getByRole("alert")).toContainText("整数");
  await dialog.getByLabel("金額", { exact: true }).fill("100");
  await dialog.getByLabel("続けて入力").dispatchEvent("click");
  await dialog
    .getByRole("button", { name: "記録する", exact: true })
    .dispatchEvent("click");
  await expect(dialog.getByLabel("金額", { exact: true })).toHaveValue("");
  await dialog
    .getByRole("button", { name: "閉じる", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("living-balance")).toHaveText("−¥10,100");
  await page
    .getByRole("button", { name: "この端末だけに保存" })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog")).toContainText("desktop-data-");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "閉じる", exact: true })
    .last()
    .dispatchEvent("click");
  expect(failures).toEqual([]);
});
