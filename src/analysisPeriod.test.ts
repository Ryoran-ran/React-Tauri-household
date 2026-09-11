import { expect, it } from "vitest";
import { rangeDays, resolveAnalysisPeriod } from "./analysisPeriod";

it("四半期の両端、年をまたぐ前四半期、年間を求める", () => {
  for (const [quarter, from, to] of [
    [1, "2026-01-01", "2026-03-31"],
    [2, "2026-04-01", "2026-06-30"],
    [3, "2026-07-01", "2026-09-30"],
    [4, "2026-10-01", "2026-12-31"],
  ] as const) {
    expect(
      resolveAnalysisPeriod({ type: "quarter", year: 2026, quarter }).current,
    ).toMatchObject({ from, to });
  }
  expect(
    resolveAnalysisPeriod({ type: "quarter", year: 2026, quarter: 1 }).previous,
  ).toMatchObject({ from: "2025-10-01", to: "2025-12-31" });
  const annual = resolveAnalysisPeriod({ type: "year", year: 2024 });
  expect(annual.current).toMatchObject({
    from: "2024-01-01",
    to: "2024-12-31",
  });
  expect(annual.previous).toMatchObject({
    from: "2023-01-01",
    to: "2023-12-31",
  });
  expect(rangeDays(annual.current!)).toBe(366);
  expect(rangeDays(annual.previous!)).toBe(365);
});

it("任意期間は両端を含めて数え、前の同日数と重複なく比較する", () => {
  const leap = resolveAnalysisPeriod({
    type: "custom",
    from: "2024-03-01",
    to: "2024-03-31",
  });
  expect(leap.previous).toMatchObject({ from: "2024-01-30", to: "2024-02-29" });
  expect(rangeDays(leap.current!)).toBe(rangeDays(leap.previous!));
  const single = resolveAnalysisPeriod({
    type: "custom",
    from: "2026-01-01",
    to: "2026-01-01",
  });
  expect(rangeDays(single.current!)).toBe(1);
  expect(single.previous).toMatchObject({
    from: "2025-12-31",
    to: "2025-12-31",
  });
});

it("不正日付と逆転した期間を拒否し、1900年より前の比較を省く", () => {
  for (const [from, to] of [
    ["", "2026-01-01"],
    ["2026-02-29", "2026-03-01"],
    ["2026-03-02", "2026-03-01"],
    ["2026-01-01", "10000-01-01"],
  ]) {
    const invalid = resolveAnalysisPeriod({ type: "custom", from, to });
    expect(invalid.current).toBeNull();
    expect(invalid.error).not.toBe("");
  }
  expect(
    resolveAnalysisPeriod({ type: "year", year: 2026.5 }).current,
  ).toBeNull();
  expect(
    resolveAnalysisPeriod({ type: "quarter", year: 2026, quarter: 0 }).current,
  ).toBeNull();
  expect(
    resolveAnalysisPeriod({ type: "year", year: 1900 }).previous,
  ).toBeNull();
  expect(
    resolveAnalysisPeriod({
      type: "custom",
      from: "1900-01-02",
      to: "1900-01-10",
    }).previous,
  ).toBeNull();
  expect(
    resolveAnalysisPeriod({ type: "quarter", year: 9999, quarter: 4 }).current
      ?.to,
  ).toBe("9999-12-31");
});
