import { monthLabel, monthRange, shiftMonth } from "./finance";

export type AnalysisPeriod =
  | { type: "month"; month: string }
  | { type: "quarter"; year: number; quarter: number }
  | { type: "year"; year: number }
  | { type: "custom"; from: string; to: string };

export interface AnalysisRange {
  from: string;
  to: string;
  label: string;
}
const dayMs = 86_400_000;
const minDate = "1900-01-01";
const maxDate = "9999-12-31";
const time = (value: string) => Date.parse(`${value}T00:00:00Z`);
const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10);

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < minDate || value > maxDate)
    return false;
  const parsed = time(value);
  return Number.isFinite(parsed) && isoDate(parsed) === value;
}

export const rangeDays = (range: AnalysisRange) =>
  Math.round((time(range.to) - time(range.from)) / dayMs) + 1;
export const inAnalysisRange = (date: string, range: AnalysisRange) =>
  date >= range.from && date <= range.to;

export function resolveAnalysisPeriod(period: AnalysisPeriod): {
  current: AnalysisRange | null;
  previous: AnalysisRange | null;
  comparisonLabel: string;
  error: string;
} {
  let current: AnalysisRange;
  let previous: AnalysisRange;
  const comparisonLabel = {
    month: "前月",
    quarter: "前四半期",
    year: "前年",
    custom: "直前の同じ日数の期間",
  }[period.type];
  const invalid = (error: string) => ({
    current: null,
    previous: null,
    comparisonLabel,
    error,
  });
  if (period.type === "month") {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(period.month) ||
      period.month < "1900-01"
    )
      return invalid("有効な年月を選んでください。");
    current = { ...monthRange(period.month), label: monthLabel(period.month) };
    const month = shiftMonth(period.month, -1);
    previous = { ...monthRange(month), label: monthLabel(month) };
  } else if (period.type === "custom") {
    if (!validDate(period.from) || !validDate(period.to))
      return invalid(
        "開始日と終了日を1900年〜9999年の範囲で入力してください。",
      );
    if (period.from > period.to)
      return invalid("終了日は開始日以降にしてください。");
    current = { from: period.from, to: period.to, label: "指定した期間" };
    const days = rangeDays(current);
    // Compare an adjacent interval with exactly the same number of inclusive days.
    const previousStart = time(period.from) - days * dayMs;
    if (previousStart < time(minDate))
      return { current, previous: null, comparisonLabel, error: "" };
    previous = {
      from: isoDate(previousStart),
      to: isoDate(time(period.from) - dayMs),
      label: comparisonLabel,
    };
  } else {
    if (
      !Number.isInteger(period.year) ||
      period.year < 1900 ||
      period.year > 9999
    )
      return invalid("年は1900〜9999の整数で入力してください。");
    if (period.type === "year") {
      current = {
        from: `${period.year}-01-01`,
        to: `${period.year}-12-31`,
        label: `${period.year}年（1〜12月）`,
      };
      previous = {
        from: `${period.year - 1}-01-01`,
        to: `${period.year - 1}-12-31`,
        label: `${period.year - 1}年（1〜12月）`,
      };
    } else {
      if (
        !Number.isInteger(period.quarter) ||
        period.quarter < 1 ||
        period.quarter > 4
      )
        return invalid("四半期を選んでください。");
      const first = `${period.year}-${String((period.quarter - 1) * 3 + 1).padStart(2, "0")}`;
      current = {
        from: monthRange(first).from,
        to: monthRange(shiftMonth(first, 2)).to,
        label: `${period.year}年第${period.quarter}四半期`,
      };
      const previousFirst = shiftMonth(first, -3);
      previous = {
        from: monthRange(previousFirst).from,
        to: monthRange(shiftMonth(first, -1)).to,
        label: `${previousFirst.slice(0, 4)}年第${Math.floor((Number(previousFirst.slice(5, 7)) - 1) / 3) + 1}四半期`,
      };
    }
  }
  return {
    current,
    previous: previous.from < minDate ? null : previous,
    comparisonLabel,
    error: "",
  };
}
