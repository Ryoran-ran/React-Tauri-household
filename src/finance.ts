import type { Entry, Filters, Summary } from "./types";
export const weekendLabels = {
  none: "変更しない",
  previous: "土日・登録祝日を避けて前倒し",
  next: "土日・登録祝日を避けて後ろ倒し",
} as const;

export const expenseLabels = {
  normal: "通常支出",
  special: "税金・特別支出",
  transfer: "投資・貯蓄",
} as const;
const formatter = new Intl.NumberFormat("ja-JP");
export const yen = (value: number) => `¥${formatter.format(Math.abs(value))}`;
export const signedYen = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${yen(value)}`;
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const monthLabel = (month: string) =>
  `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
export const monthRange = (month: string) => ({
  from: `${month}-01`,
  to: `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}`,
});
export function shiftMonth(month: string, by: number): string {
  const date = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)) - 1 + by,
    1,
  );
  return localDate(date).slice(0, 7);
}
export function summarize(entries: Entry[], includeDrafts = false): Summary {
  entries = entries.filter(
    (entry) => includeDrafts || entry.status === "confirmed",
  );
  const result: Summary = {
    income: 0,
    normal: 0,
    special: 0,
    transfer: 0,
    living: 0,
    cash: 0,
    count: entries.length,
  };
  for (const entry of entries) {
    if (entry.direction === "income") result.income += entry.amount;
    else if (entry.expenseKind) result[entry.expenseKind] += entry.amount;
  }
  result.living = result.income - result.normal;
  result.cash = result.living - result.special - result.transfer;
  return result;
}
export const forMonth = (entries: Entry[], month: string) =>
  entries.filter((entry) => entry.date.startsWith(`${month}-`));
export const forYearToDate = (entries: Entry[], today: string) =>
  entries.filter(
    (entry) =>
      entry.date >= `${today.slice(0, 4)}-01-01` && entry.date <= today,
  );
export const monthlySummaries = (
  entries: Entry[],
  year: number,
  includeDrafts = false,
) =>
  Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return { month, ...summarize(forMonth(entries, month), includeDrafts) };
  });
export function filterEntries(entries: Entry[], filters: Filters): Entry[] {
  return entries
    .filter(
      (entry) =>
        (!filters.status || entry.status === filters.status) &&
        (!filters.from || entry.date >= filters.from) &&
        (!filters.to || entry.date <= filters.to) &&
        (!filters.direction || entry.direction === filters.direction) &&
        (!filters.category ||
          (filters.category === "none"
            ? entry.categoryId === null
            : entry.categoryId === Number(filters.category))) &&
        (!filters.paymentMethod ||
          (filters.paymentMethod === "none"
            ? entry.paymentMethodId === null
            : entry.paymentMethodId === Number(filters.paymentMethod))) &&
        (!filters.expenseKind ||
          (entry.direction === "expense" &&
            entry.expenseKind === filters.expenseKind)) &&
        (!filters.search ||
          entry.memo
            .toLocaleLowerCase()
            .includes(filters.search.trim().toLocaleLowerCase())),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
export function balanceMessage(summary: Summary): string {
  if (!summary.count) return "最初の記録から、家計の見える化をはじめましょう。";
  if (summary.living < 0)
    return "通常の生活支出が収入を上回っています。支出の内訳を確認しましょう。";
  if (summary.living === 0)
    return "収入と通常支出が同額です。生活収支はプラスマイナスゼロです。";
  if (summary.cash < 0)
    return "生活収支は黒字です。現金の減少は、特別支出・資産形成によるものです。";
  return "生活収支は黒字です。特別支出・資産形成を含めても現金に余裕があります。";
}
