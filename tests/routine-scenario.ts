import { expect, type Page } from "@playwright/test";

export async function routineScenario(page: Page) {
  const navigate = async (name: string) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .dispatchEvent("click");
  await navigate("設定");
  await page.getByLabel("支払い方法名", { exact: true }).fill("通勤用IC");
  await page.getByLabel("新しい記録で最初に選択する").dispatchEvent("click");
  await page
    .getByRole("button", { name: "追加する", exact: true })
    .dispatchEvent("click");
  await expect(page.getByText("通勤用IC", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "収支を記録", exact: true })
    .dispatchEvent("click");
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("支払い方法", { exact: true })
      .locator("option:checked"),
  ).toHaveText("通勤用IC");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "キャンセル", exact: true })
    .dispatchEvent("click");

  await navigate("入力テンプレート");
  await page
    .getByRole("button", { name: "テンプレートを追加", exact: true })
    .dispatchEvent("click");
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前", { exact: true }).fill("通勤電車・片道");
  await dialog.getByLabel("金額", { exact: true }).fill("230");
  await dialog
    .getByLabel("カテゴリ", { exact: true })
    .selectOption({ label: "交通費" });
  await dialog
    .getByRole("button", { name: "設定を保存", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "通勤電車・片道", exact: true }),
  ).toBeVisible();
  await navigate("ダッシュボード");
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥0");
  await page
    .getByRole("button", { name: "通勤電車・片道 ¥230" })
    .dispatchEvent("click");
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("金額", { exact: true })).toHaveValue("230");
  await expect(
    dialog.getByLabel("支払い方法", { exact: true }).locator("option:checked"),
  ).toHaveText("通勤用IC");
  await dialog.getByLabel("金額", { exact: true }).fill("460");
  await dialog
    .getByRole("button", { name: "記録する", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥460");
  await expect(
    page.getByRole("button", { name: "通勤電車・片道 ¥230" }),
  ).toBeVisible();

  await navigate("定期収支");
  await page
    .getByRole("button", { name: "定期収支を追加", exact: true })
    .dispatchEvent("click");
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前", { exact: true }).fill("毎月の家賃");
  await dialog.getByLabel("金額", { exact: true }).fill("80000");
  await dialog
    .getByLabel("カテゴリ", { exact: true })
    .selectOption({ label: "住居費" });
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  await dialog.getByLabel("開始日", { exact: true }).fill(first);
  await dialog
    .getByRole("button", { name: "設定を保存", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "毎月の家賃の予定を確認", exact: true })
      .first(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/recurring.png", fullPage: true });
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).toContainText(first);
  await page
    .getByRole("button", { name: "次の月", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).not.toContainText(first);
  await page
    .getByRole("button", { name: "次の月", exact: true })
    .dispatchEvent("click");
  await expect(
    page.getByText("この月の定期収支はありません", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("表示する月", { exact: true }).fill(first.slice(0, 7));
  await navigate("ダッシュボード");
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥460");
  await expect(page.getByTestId("forecast-cash")).toHaveText("−¥80,460");
  await expect(page.getByTestId("recurring-entry")).toHaveCount(0);
  await expect(page.locator(".recurring-shortcut")).toContainText(
    "仮入力 1 件",
  );
  await page
    .getByRole("button", { name: "月ごとの定期収支を開く", exact: true })
    .dispatchEvent("click");
  await expect(page.getByLabel("表示する月", { exact: true })).toHaveValue(
    first.slice(0, 7),
  );
  await page
    .getByRole("button", { name: "毎月の家賃の予定を確認", exact: true })
    .first()
    .dispatchEvent("click");
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("金額", { exact: true })).toHaveValue("80000");
  await expect(dialog.getByLabel("日付", { exact: true })).toHaveValue(first);
  await dialog.getByLabel("金額", { exact: true }).fill("82000");
  await dialog
    .getByRole("button", { name: "変更して確定", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("recurring-entry")).toHaveCount(1);
  await expect(page.getByTestId("recurring-entry")).toContainText("確定済み");
  await navigate("ダッシュボード");
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥82,460");
  await expect(
    page
      .getByRole("button", { name: "毎月の家賃の予定を確認", exact: true })
      .first(),
  ).toHaveCount(0);
  await navigate("定期収支");
  await page
    .getByRole("button", { name: "繰り返し設定", exact: true })
    .dispatchEvent("click");
  const card = page
    .locator(".preset-card")
    .filter({ has: page.getByRole("heading", { name: "毎月の家賃" }) });
  await expect(card).toContainText("¥80,000");
  await expect(card).toContainText("次回");
  await page
    .getByRole("button", { name: "毎月の家賃を編集", exact: true })
    .dispatchEvent("click");
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("金額", { exact: true }).fill("85000");
  await dialog
    .getByRole("button", { name: "設定を保存", exact: true })
    .dispatchEvent("click");
  await expect(card).toContainText("¥85,000");

  await navigate("収支の履歴");
  await page
    .getByLabel("支払い方法", { exact: true })
    .selectOption({ label: "通勤用IC" });
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("82,000");
  await navigate("設定");
  await page
    .getByRole("button", { name: "通勤用ICを削除", exact: true })
    .dispatchEvent("click");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "削除する", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await navigate("収支の履歴");
  await page.getByLabel("支払い方法", { exact: true }).selectOption("none");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("未設定");
  await navigate("入力テンプレート");
  await expect(page.locator(".preset-card")).toContainText("支払い方法 未設定");
  await page
    .getByRole("button", { name: "通勤電車・片道を削除", exact: true })
    .dispatchEvent("click");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "削除する", exact: true })
    .dispatchEvent("click");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await navigate("ダッシュボード");
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥82,460");
  await navigate("収支の履歴");
  await page.getByRole("button", { name: "すべて解除" }).dispatchEvent("click");
  await page.getByLabel("記録の状態", { exact: true }).selectOption("draft");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "毎月の家賃を編集", exact: true })
    .dispatchEvent("click");
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("金額", { exact: true })).toHaveValue("85000");
  await dialog.getByLabel("金額", { exact: true }).fill("86000");
  await page.screenshot({
    path: "test-results/draft-form.png",
    fullPage: true,
  });
  // Enter saves a draft; confirmation requires the explicit confirm button.
  await dialog.getByLabel("金額", { exact: true }).press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "毎月の家賃を編集", exact: true })
    .dispatchEvent("click");
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("金額", { exact: true })).toHaveValue("86000");
  await dialog
    .getByRole("button", { name: "変更して確定", exact: true })
    .dispatchEvent("click");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page
    .getByLabel("記録の状態", { exact: true })
    .selectOption("confirmed");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await navigate("月別集計");
  const nextMonth = ((now.getMonth() + 1) % 12) + 1;
  if (nextMonth === 1)
    await page
      .getByRole("button", { name: "翌年", exact: true })
      .dispatchEvent("click");
  await expect(
    page.locator("tbody tr").filter({
      has: page.getByRole("button", { name: `${nextMonth}月`, exact: true }),
    }),
  ).toContainText("86,000");
  await navigate("ダッシュボード");
  await expect(page.getByTestId("monthly-normal")).toHaveText("¥82,460");
  await expect(
    page.getByRole("button", { name: "毎月の家賃の予定を確認", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/draft-confirmed.png",
    fullPage: true,
  });
}
