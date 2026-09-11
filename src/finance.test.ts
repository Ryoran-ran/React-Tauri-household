import { describe, expect, it } from "vitest";
import {
  balanceMessage,
  filterEntries,
  forMonth,
  forYearToDate,
  localDate,
  monthRange,
  monthlySummaries,
  shiftMonth,
  summarize,
} from "./finance";
import type { Entry, Filters } from "./types";

const entry = (
  id: number,
  amount: number,
  direction: Entry["direction"],
  expenseKind: Entry["expenseKind"],
  date = "2026-09-11",
  categoryId: number | null = 1,
): Entry => ({
  status: "confirmed",
  presetId: null,
  scheduledDate: null,
  id,
  amount,
  direction,
  expenseKind,
  date,
  categoryId,
  paymentMethodId: null,
  memo: `記録${id}`,
});
const example = [
  entry(1, 250000, "income", null),
  entry(2, 200000, "expense", "normal"),
  entry(3, 20000, "expense", "special"),
  entry(4, 65000, "expense", "transfer"),
];
const noFilters: Filters = {
  from: "",
  to: "",
  direction: "",
  expenseKind: "",
  category: "",
  search: "",
};

it("仮入力は見込みだけに含め、未来の確定分は取引月に計上する", () => {
  const future = entry(10, 250000, "income", null, "2027-01-25");
  const draft: Entry = {
    ...entry(11, 80000, "expense", "normal", "2027-01-31"),
    status: "draft",
  };
  expect(summarize([future, draft]).cash).toBe(250000);
  expect(summarize([future, draft], true).cash).toBe(170000);
  expect(monthlySummaries([future, draft], 2026)[11].cash).toBe(0);
  expect(monthlySummaries([future, draft], 2027, true)[0].cash).toBe(170000);
  expect(summarize(forYearToDate([future, draft], "2027-01-01")).cash).toBe(0);
  expect(
    filterEntries([future, draft], { ...noFilters, status: "draft" }),
  ).toEqual([draft]);
});

it("支払い方法の絞り込みは集計分類を変えない", () => {
  const entries = example.map((entry, index) => ({
    ...entry,
    paymentMethodId: index === 3 ? 2 : null,
  }));
  const selected = filterEntries(entries, { ...noFilters, paymentMethod: "2" });
  expect(selected).toHaveLength(1);
  expect(summarize(selected).transfer).toBe(65000);
  expect(summarize(selected).normal).toBe(0);
  expect(
    filterEntries(entries, { ...noFilters, paymentMethod: "none" }),
  ).toHaveLength(3);
});

describe("生活収支と現金収支", () => {
  it("65,000円の資金移動は生活費の赤字にしない", () => {
    const result = summarize(example);
    expect(result).toEqual({
      income: 250000,
      normal: 200000,
      special: 20000,
      transfer: 65000,
      living: 50000,
      cash: -35000,
      count: 4,
    });
    expect(balanceMessage(result)).toContain("生活収支は黒字");
    expect(balanceMessage(result)).toContain("特別支出・資産形成");
  });
  it("通常支出だけで赤字になった場合を識別する", () => {
    const result = summarize([
      entry(1, 100000, "income", null),
      entry(2, 110000, "expense", "normal"),
    ]);
    expect(result.living).toBe(-10000);
    expect(balanceMessage(result)).toContain("通常の生活支出が収入を上回って");
  });
  it("収支ゼロと未登録を区別する", () => {
    expect(summarize([]).cash).toBe(0);
    expect(balanceMessage(summarize([]))).toContain("最初の記録");
    expect(
      balanceMessage(
        summarize([
          entry(1, 1000, "income", null),
          entry(2, 1000, "expense", "normal"),
        ]),
      ),
    ).toContain("同額");
  });
  it("整数円を端数なしで合計する", () => {
    expect(
      summarize([
        entry(1, 999999999, "income", null),
        entry(2, 1, "expense", "normal"),
      ]).living,
    ).toBe(999999998);
  });
});

describe("期間と月別比較", () => {
  const entries = [
    ...example,
    entry(5, 100, "income", null, "2025-12-31"),
    entry(6, 200, "income", null, "2026-01-01"),
    entry(7, 300, "income", null, "2026-09-12"),
    entry(8, 400, "income", null, "2027-01-01"),
  ];
  it("年間累計は今年1月1日から今日までで未来日を含めない", () => {
    expect(summarize(forYearToDate(entries, "2026-09-11")).income).toBe(250200);
  });
  it("月の境界と年の境界をまたいで混ぜない", () => {
    expect(forMonth(entries, "2025-12").map((entry) => entry.id)).toEqual([5]);
    const rows = monthlySummaries(entries, 2026);
    expect(rows).toHaveLength(12);
    expect(rows[0].income).toBe(200);
    expect(rows[1].cash).toBe(0);
    expect(rows[8].cash).toBe(-34700);
    expect(rows[11].income).toBe(0);
  });
  it("年末年始とうるう年を正しく処理する", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthRange("2024-02").to).toBe("2024-02-29");
    expect(monthRange("2025-02").to).toBe("2025-02-28");
    expect(localDate(new Date(2026, 8, 1, 0, 1))).toBe("2026-09-01");
  });
});

describe("履歴の絞り込み", () => {
  it("開始日と終了日を両端含みで適用する", () => {
    const entries = [
      entry(1, 1, "income", null, "2026-09-01"),
      entry(2, 1, "income", null, "2026-09-30"),
      entry(3, 1, "income", null, "2026-10-01"),
    ];
    expect(
      filterEntries(entries, {
        ...noFilters,
        from: "2026-09-01",
        to: "2026-09-30",
      }).map((entry) => entry.id),
    ).toEqual([2, 1]);
  });
  it("収支・カテゴリ・支出種別・メモを組み合わせる", () => {
    expect(
      filterEntries(example, {
        ...noFilters,
        direction: "expense",
        category: "1",
        expenseKind: "transfer",
        search: "記録4",
      }).map((entry) => entry.id),
    ).toEqual([4]);
    expect(
      filterEntries(example, {
        ...noFilters,
        direction: "income",
        expenseKind: "normal",
      }),
    ).toEqual([]);
  });
  it("カテゴリ削除後の未分類も検索できる", () => {
    const entries = [
      entry(1, 200, "expense", "normal", "2026-09-11", null),
      ...example,
    ];
    expect(
      filterEntries(entries, { ...noFilters, category: "none" }),
    ).toHaveLength(1);
  });
});
