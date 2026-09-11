import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleAlert,
  Coins,
  Leaf,
  Plus,
  TrendingUp,
} from "lucide-react";
import { EmptyState, EntryTable, TrendChart } from "./components";
import type { ReactNode } from "react";
import {
  balanceMessage,
  forMonth,
  forYearToDate,
  localDate,
  monthLabel,
  shiftMonth,
  signedYen,
  summarize,
  yen,
} from "./finance";
import type { Category, Entry } from "./types";

export default function Dashboard({
  entries,
  categories,
  month,
  onAdd,
  onEdit,
  onHistory,
  onReports,
  tools,
}: {
  entries: Entry[];
  categories: Category[];
  month: string;
  onAdd: () => void;
  onEdit: (entry: Entry) => void;
  onHistory: () => void;
  onReports: () => void;
  tools?: ReactNode;
}) {
  const monthlyEntries = forMonth(entries, month);
  const summary = summarize(monthlyEntries);
  const forecast = summarize(monthlyEntries, true);
  const draftCount = monthlyEntries.filter(
    (entry) => entry.status === "draft",
  ).length;
  const annual = summarize(forYearToDate(entries, localDate()));
  const previous = summarize(forMonth(entries, shiftMonth(month, -1)));
  const chartRows = Array.from({ length: 6 }, (_, index) => {
    const key = shiftMonth(month, index - 5);
    return { month: key, ...summarize(forMonth(entries, key)) };
  });
  const normalEntries = monthlyEntries.filter(
    (entry) =>
      entry.status === "confirmed" &&
      entry.direction === "expense" &&
      entry.expenseKind === "normal",
  );
  const groups = new Map<number | null, number>();
  normalEntries.forEach((entry) =>
    groups.set(
      entry.categoryId,
      (groups.get(entry.categoryId) || 0) + entry.amount,
    ),
  );
  const ranked = [...groups].sort((a, b) => b[1] - a[1]);
  const topCategories = ranked.slice(0, 4).map(([id, amount]) => ({
    name: categories.find((category) => category.id === id)?.name || "未分類",
    amount,
  }));
  if (ranked.length > 4)
    topCategories.push({
      name: "その他",
      amount: ranked.slice(4).reduce((sum, item) => sum + item[1], 0),
    });
  const status = !summary.count
    ? "記録待ち"
    : summary.living > 0
      ? "生活は黒字"
      : summary.living < 0
        ? "生活は赤字"
        : "収支均衡";
  return (
    <div className="page-content dashboard">
      {tools}
      <div className="section-eyebrow">
        <span className="eyebrow">MONTHLY OVERVIEW</span>
        <span>{monthLabel(month)}の家計 · 確定分</span>
      </div>
      <section
        className={`living-card ${summary.living < 0 ? "is-negative" : ""}`}
      >
        <div className="living-main">
          <div className="living-heading">
            <span>
              <Leaf size={19} />
              生活収支
            </span>
            <span className="living-status">
              {summary.living < 0 ? (
                <CircleAlert size={14} />
              ) : (
                <CircleCheck size={14} />
              )}
              {status}
            </span>
          </div>
          <div className="hero-amount" data-testid="living-balance">
            {signedYen(summary.living)}
          </div>
          <p>収入 − 通常支出</p>
          <div className="living-note">{balanceMessage(summary)}</div>
        </div>
        <div className="living-breakdown">
          <div>
            <span>
              <ArrowDownLeft size={17} />
              {month === localDate().slice(0, 7)
                ? "今月の収入"
                : "この月の収入"}
            </span>
            <strong data-testid="monthly-income">{yen(summary.income)}</strong>
          </div>
          <div>
            <span>
              <ArrowUpRight size={17} />
              {month === localDate().slice(0, 7)
                ? "今月の通常支出"
                : "この月の通常支出"}
            </span>
            <strong data-testid="monthly-normal">{yen(summary.normal)}</strong>
          </div>
          <div className="spending-meter">
            <span
              style={{
                width: `${summary.income > 0 ? Math.min(100, (summary.normal / summary.income) * 100) : summary.normal > 0 ? 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {summary.income > 0
              ? `収入に対する通常支出 ${Math.round((summary.normal / summary.income) * 100)}%`
              : "収入を記録すると支出の割合が分かります"}
          </small>
        </div>
      </section>
      <div className="metrics-grid">
        <section className="metric-card">
          <div className="metric-top">
            <span>税金・特別支出</span>
            <span className="metric-icon special">
              <Coins size={19} />
            </span>
          </div>
          <strong data-testid="monthly-special">{yen(summary.special)}</strong>
          <p>税金や、一時的な大きな支出</p>
        </section>
        <section className="metric-card">
          <div className="metric-top">
            <span>投資・貯蓄額</span>
            <span className="metric-icon transfer">
              <TrendingUp size={19} />
            </span>
          </div>
          <strong data-testid="monthly-transfer">
            {yen(summary.transfer)}
          </strong>
          <p>将来に向けた資金移動</p>
        </section>
        <section className="metric-card cash-card">
          <div className="metric-top">
            <span>最終的な現金収支</span>
            <span
              className={`small-status ${summary.cash < 0 ? "negative" : "positive"}`}
            >
              {!summary.count
                ? "記録待ち"
                : summary.cash > 0
                  ? "現金は黒字"
                  : summary.cash < 0
                    ? "現金は赤字"
                    : "増減なし"}
            </span>
          </div>
          <strong
            className={summary.cash < 0 ? "negative" : "positive"}
            data-testid="monthly-cash"
          >
            {signedYen(summary.cash)}
          </strong>
          <p>生活収支 − 特別支出 − 投資・貯蓄</p>
        </section>
      </div>
      <section className="panel forecast-panel">
        <div>
          <h2>仮入力を含む見込み</h2>
          <p>この月の確定分 ＋ 仮入力 {draftCount} 件</p>
        </div>
        <div>
          <span>生活収支の見込み</span>
          <strong
            data-testid="forecast-living"
            className={forecast.living < 0 ? "negative" : "positive"}
          >
            {signedYen(forecast.living)}
          </strong>
        </div>
        <div>
          <span>現金収支の見込み</span>
          <strong
            data-testid="forecast-cash"
            className={forecast.cash < 0 ? "negative" : "positive"}
          >
            {signedYen(forecast.cash)}
          </strong>
        </div>
      </section>
      <div className="dashboard-middle">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <h2>家計の推移</h2>
              <p>生活と現金の変化を、分けて見る</p>
            </div>
            <button className="text-button link-button" onClick={onReports}>
              月別集計
              <ArrowRight size={15} />
            </button>
          </div>
          <TrendChart rows={chartRows} />
          <div className="chart-footnote">
            {previous.count && summary.count ? (
              <>
                前月からの生活収支の変化{" "}
                <strong
                  className={
                    summary.living - previous.living < 0
                      ? "negative"
                      : "positive"
                  }
                >
                  {signedYen(summary.living - previous.living)}
                </strong>
              </>
            ) : (
              "記録が増えると、月ごとの変化が見えてきます。"
            )}
          </div>
        </section>
        <section className="panel category-panel">
          <div className="panel-heading">
            <div>
              <h2>通常支出の内訳</h2>
              <p>日々の生活に使ったお金</p>
            </div>
            <span className="subtle-label">
              {month === localDate().slice(0, 7)
                ? "今月"
                : `${Number(month.slice(5))}月`}
            </span>
          </div>
          {topCategories.length ? (
            <div className="category-breakdown">
              {topCategories.map((category, index) => (
                <div className="category-bar" key={`${index}:${category.name}`}>
                  <div>
                    <span>
                      <i className={`dot dot-${index}`} />
                      {category.name}
                    </span>
                    <strong>{yen(category.amount)}</strong>
                  </div>
                  <div className="bar-track">
                    <span
                      className={`bar-${index}`}
                      style={{
                        width: `${(category.amount / summary.normal) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="category-total">
                <span>通常支出 合計</span>
                <strong>{yen(summary.normal)}</strong>
              </div>
            </div>
          ) : (
            <EmptyState
              title="内訳はここに表示されます"
              text="通常支出を記録してみましょう。"
            />
          )}
        </section>
      </div>
      <section className="annual-strip">
        <div className="annual-label">
          <span className="annual-icon">
            <TrendingUp size={20} />
          </span>
          <div>
            <h2>{localDate().slice(0, 4)}年の累計 · 確定分</h2>
            <p>1月1日〜今日（{localDate().slice(5).replace("-", "/")}）</p>
          </div>
        </div>
        <div>
          <span>年間の生活収支</span>
          <strong className={annual.living < 0 ? "negative" : "positive"}>
            {signedYen(annual.living)}
          </strong>
        </div>
        <div>
          <span>年間の現金収支</span>
          <strong className={annual.cash < 0 ? "negative" : ""}>
            {signedYen(annual.cash)}
          </strong>
        </div>
        <div>
          <span>年間の投資・貯蓄</span>
          <strong>{yen(annual.transfer)}</strong>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>最近の記録</h2>
            <p>選択した月の直近5件</p>
          </div>
          <button className="text-button link-button" onClick={onHistory}>
            すべての履歴
            <ArrowRight size={15} />
          </button>
        </div>
        {monthlyEntries.length ? (
          <EntryTable
            entries={monthlyEntries.slice(0, 5)}
            categories={categories}
            onEdit={onEdit}
            onDelete={() => undefined}
            compact
          />
        ) : (
          <EmptyState
            action={
              <button className="button secondary" onClick={onAdd}>
                <Plus size={16} />
                最初の収支を記録
              </button>
            }
          />
        )}
      </section>
      <p className="page-footnote">
        確定分は将来の日付も含め、取引の月に集計します。年間累計は今日までです。見込みは作成済みの仮入力だけを含みます。現金収支は口座残高ではなく、登録した収入と出金の差額です。
      </p>
    </div>
  );
}
