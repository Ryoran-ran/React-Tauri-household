import { expect, it } from "vitest";
import { buildAnalysisPrompt, type PromptOptions } from "./promptBuilder";
import type { Entry, Snapshot } from "./types";

const entry = (
  id: number,
  amount: number,
  expenseKind: Entry["expenseKind"],
  extra: Partial<Entry> = {},
): Entry => ({
  id,
  amount,
  expenseKind,
  date: "2026-09-10",
  direction: expenseKind ? "expense" : "income",
  status: "confirmed",
  categoryId: 1,
  paymentMethodId: 1,
  memo: "秘密の店名",
  presetId: null,
  scheduledDate: null,
  ...extra,
});
const data: Snapshot = {
  categories: [{ id: 1, name: "食費" }],
  paymentMethods: [{ id: 1, name: "秘密の口座", isDefault: true }],
  presets: [],
  schedules: [],
  draftThrough: "2026-10-31",
  holidayInfo: { fetchedAt: null, firstYear: null, lastYear: null, count: 0 },
  entries: [
    entry(1, 250000, null),
    entry(2, 200000, "normal"),
    entry(3, 20000, "special"),
    entry(4, 65000, "transfer"),
    entry(5, 10000, null, { status: "draft", date: "2026-09-25" }),
    entry(6, 30000, "normal", { date: "2026-08-10" }),
    entry(7, 999, "normal", { date: "2026-07-10" }),
  ],
};
const options: PromptOptions = {
  period: { type: "month", month: "2026-09" },
  comparePrevious: true,
  includeDrafts: true,
  includeDetails: false,
  includeMemos: false,
  includePaymentMethods: false,
  question: "",
};
const prompt = (overrides: Partial<PromptOptions> = {}, snapshot = data) =>
  buildAnalysisPrompt(snapshot, { ...options, ...overrides }, "2026-09-12");
const report = (text: string) => JSON.parse(text.split("【家計データ】\n")[1]);

it("年間と四半期は境界内だけを集計し、月別合計も一致する", () => {
  const source = {
    ...data,
    entries: [
      entry(1, 100, "normal", { date: "2025-12-31" }),
      entry(2, 200, "normal", { date: "2026-01-01" }),
      entry(3, 300, "special", { date: "2026-03-31" }),
      entry(4, 400, "normal", { date: "2026-04-01" }),
      entry(5, 500, "transfer", { date: "2026-12-31", status: "draft" }),
      entry(6, 600, "normal", { date: "2027-01-01" }),
    ],
  };
  const quarterly = report(
    prompt(
      {
        period: { type: "quarter", year: 2026, quarter: 1 },
        includeDetails: true,
      },
      source,
    ),
  );
  expect(quarterly.対象期間.確定分).toMatchObject({
    通常支出: 200,
    税金特別支出: 300,
    現金収支: -500,
    件数: 2,
  });
  expect(quarterly.対象期間.明細.map((e: { 日付: string }) => e.日付)).toEqual([
    "2026-01-01",
    "2026-03-31",
  ]);
  expect(quarterly.対象期間.月別収支.map((e: { 月: string }) => e.月)).toEqual([
    "2026-01",
    "2026-03",
  ]);
  expect(quarterly.比較期間.確定分.通常支出).toBe(100);
  const annual = report(
    prompt({ period: { type: "year", year: 2026 } }, source),
  );
  expect(annual.対象期間.確定分.通常支出).toBe(600);
  expect(annual.対象期間.仮入力を含む見込み.現金収支).toBe(-1400);
  expect(
    annual.対象期間.月別収支.reduce(
      (sum: number, row: { 仮入力を含む見込み: { 現金収支: number } }) =>
        sum + row.仮入力を含む見込み.現金収支,
      0,
    ),
  ).toBe(-1400);
  const partial = report(
    prompt(
      {
        period: { type: "custom", from: "2026-03-31", to: "2026-04-01" },
        includeDetails: true,
      },
      source,
    ),
  );
  expect(partial.対象期間.確定分.現金収支).toBe(-700);
  expect(partial.対象期間.明細).toHaveLength(2);
  expect(partial.対象期間.月別収支).toHaveLength(2);
  expect(partial.比較期間.集計期間).toBe("2026-03-29〜2026-03-30");
});

it("生活費・特別支出・投資を分離し、仮入力を確定に加算しない", () => {
  const value = report(prompt());
  expect(value.対象期間.確定分).toMatchObject({
    収入: 250000,
    通常支出: 200000,
    生活収支: 50000,
    税金特別支出: 20000,
    投資貯蓄への資金移動: 65000,
    現金収支: -35000,
    件数: 4,
  });
  expect(value.対象期間.仮入力を含む見込み).toMatchObject({
    収入: 260000,
    生活収支: 60000,
    現金収支: -25000,
    件数: 5,
  });
  expect(value.対象期間.仮入力のみ.収入).toBe(10000);
  expect(value.対象期間.カテゴリ別内訳).toHaveLength(5);
  expect(value.比較期間.確定分.通常支出).toBe(30000);
  expect(value.対象期間.期間の状態).toContain("期間の途中");
  expect(
    report(buildAnalysisPrompt(data, options, "2026-09-30")).対象期間
      .期間の状態,
  ).toContain("期間の最終日");
});

it("標準出力と明細だけの出力にはメモ・支払い方法・内部IDを含めない", () => {
  expect(prompt()).not.toContain("秘密");
  expect(report(prompt()).対象期間).not.toHaveProperty("明細");
  const details = report(prompt({ includeDetails: true })).対象期間.明細;
  expect(details).toHaveLength(5);
  expect(details[0]).not.toHaveProperty("メモ");
  expect(details[0]).not.toHaveProperty("支払い受取方法");
  expect(details[0]).not.toHaveProperty("id");
  expect(
    prompt({
      includeDetails: false,
      includeMemos: true,
      includePaymentMethods: true,
    }),
  ).not.toContain("秘密");
  expect(
    prompt({
      includeDetails: true,
      includeMemos: true,
      includePaymentMethods: true,
    }),
  ).toContain("秘密の店名");
  expect(
    prompt({ includeDetails: true, includePaymentMethods: true }),
  ).toContain("秘密の口座");
});

it("除外した仮入力・前月は明細や集計にも漏れず、相談文は反映する", () => {
  const text = prompt({
    includeDrafts: false,
    comparePrevious: false,
    includeDetails: true,
    question: "家賃の見直しを相談したい",
  });
  const value = report(text);
  expect(value).not.toHaveProperty("比較期間");
  expect(value.対象期間).not.toHaveProperty("仮入力を含む見込み");
  expect(value.対象期間.集計に含めていない仮入力件数).toBe(1);
  expect(value.対象期間.明細).toHaveLength(4);
  expect(
    value.対象期間.明細.every((x: { 状態: string }) => x.状態 === "確定"),
  ).toBe(true);
  expect(text).toContain("家賃の見直しを相談したい");
});

it("未来の確定分と基準日までを区別し、未分類と改行を壊さない", () => {
  const specialData = {
    ...data,
    categories: [{ id: 1, name: '食費\n"指示"' }],
    entries: [
      entry(1, 250000, null, { date: "2026-09-25" }),
      entry(2, 500, "normal", { categoryId: null }),
    ],
  };
  const value = report(prompt({ includeDetails: true }, specialData)).対象期間;
  expect(value.確定分.収入).toBe(250000);
  expect(value.基準日までの確定分.収入).toBe(0);
  expect(value.未来日付の確定件数).toBe(1);
  expect(value.明細[0].カテゴリ).toBe("未分類");
  expect(value.明細[1].カテゴリ).toBe('食費\n"指示"');
});

it("対象月の妥当性、前年への比較、空の月を扱う", () => {
  expect(prompt({ period: { type: "month", month: "" } })).toBe("");
  expect(prompt({ period: { type: "month", month: "2026-13" } })).toBe("");
  const value = report(prompt({ period: { type: "month", month: "2026-01" } }));
  expect(value.比較期間.集計期間).toBe("2025-12-01〜2025-12-31");
  expect(value.対象期間.確定分.件数).toBe(0);
  expect(
    report(prompt({ period: { type: "month", month: "1900-01" } })),
  ).not.toHaveProperty("比較期間");
});
