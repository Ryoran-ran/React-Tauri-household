import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { TrendChart } from "./components";
import {
  localDate,
  monthlySummaries,
  signedYen,
  summarize,
  yen,
} from "./finance";
import type { Entry } from "./types";

export default function Reports({
  entries,
  year,
  onYear,
  onMonth,
}: {
  entries: Entry[];
  year: number;
  onYear: (year: number) => void;
  onMonth: (month: string) => void;
}) {
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const rows = monthlySummaries(entries, year, includeDrafts);
  const total = summarize(
    entries.filter((entry) => entry.date.startsWith(`${year}-`)),
    includeDrafts,
  );
  return (
    <div className="page-content">
      <label className="field">
        集計対象
        <select
          aria-label="集計対象"
          value={includeDrafts ? "forecast" : "confirmed"}
          onChange={(event) =>
            setIncludeDrafts(event.target.value === "forecast")
          }
        >
          <option value="confirmed">確定分</option>
          <option value="forecast">仮入力を含む見込み</option>
        </select>
      </label>
      <div className="report-toolbar">
        <p>毎月の生活収支と、資産形成を含めた現金の変化を比較できます。</p>
        <div className="year-picker">
          <button
            className="icon-button"
            aria-label="前年"
            disabled={year <= 1900}
            onClick={() => onYear(year - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <label>
            <input
              aria-label="集計する年"
              type="number"
              min={1900}
              max={9999}
              value={year}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value >= 1900 && value <= 9999) onYear(value);
              }}
            />
            年
          </label>
          <button
            className="icon-button"
            aria-label="翌年"
            disabled={year >= 9999}
            onClick={() => onYear(year + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{year}年の収支推移</h2>
            <p>上向きが黒字、下向きが赤字。未登録の月は0円です。</p>
          </div>
        </div>
        <TrendChart rows={rows} />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>月ごとの収支</h2>
            <p>月をクリックすると、その月のダッシュボードを表示します。</p>
          </div>
          <span className="subtle-label">単位：円</span>
        </div>
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>月</th>
                <th>収入</th>
                <th>通常支出</th>
                <th className="highlight-cell">生活収支</th>
                <th>税金・特別支出</th>
                <th>投資・貯蓄</th>
                <th>現金収支</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.month}
                  className={
                    row.month === localDate().slice(0, 7) ? "current-month" : ""
                  }
                >
                  <td>
                    <button
                      className="text-button month-link"
                      onClick={() => onMonth(row.month)}
                    >
                      {Number(row.month.slice(5))}月
                      {row.month === localDate().slice(0, 7) && (
                        <span className="current-dot" />
                      )}
                    </button>
                    {!row.count && (
                      <small className="no-entry-label">未登録</small>
                    )}
                  </td>
                  <td>{yen(row.income)}</td>
                  <td>{yen(row.normal)}</td>
                  <td
                    className={`highlight-cell ${row.living < 0 ? "negative" : "positive"}`}
                  >
                    {signedYen(row.living)}
                  </td>
                  <td>{yen(row.special)}</td>
                  <td>{yen(row.transfer)}</td>
                  <td className={row.cash < 0 ? "negative" : "positive"}>
                    {signedYen(row.cash)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>年間合計</th>
                <td>{yen(total.income)}</td>
                <td>{yen(total.normal)}</td>
                <td className={total.living < 0 ? "negative" : "positive"}>
                  {signedYen(total.living)}
                </td>
                <td>{yen(total.special)}</td>
                <td>{yen(total.transfer)}</td>
                <td className={total.cash < 0 ? "negative" : "positive"}>
                  {signedYen(total.cash)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <div className="formula-note">
        <strong>集計の考え方</strong>
        <span>生活収支 = 収入 − 通常支出</span>
        <span>現金収支 = 生活収支 − 税金・特別支出 − 投資・貯蓄</span>
        <p>
          年間合計は選択した年と集計対象の記録が対象です。見込みは作成済みの仮入力だけを含みます。ダッシュボードの年間累計は今年の今日までの確定分が対象です。
        </p>
      </div>
    </div>
  );
}
