import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  expenseLabels,
  monthLabel,
  shiftMonth,
  signedYen,
  yen,
} from "./finance";
import type { Category, Entry, Summary, PaymentMethod } from "./types";

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="month-picker">
      <button
        className="icon-button"
        aria-label="前の月"
        disabled={month === "1900-01"}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={18} />
      </button>
      <label className="month-input">
        <span>{monthLabel(month)}</span>
        <input
          aria-label="表示する月"
          type="month"
          min="1900-01"
          max="9999-12"
          value={month}
          onChange={(event) => {
            if (
              /^\d{4}-\d{2}$/.test(event.target.value) &&
              event.target.validity.valid
            )
              onChange(event.target.value);
          }}
        />
      </label>
      <button
        className="icon-button"
        aria-label="次の月"
        disabled={month === "9999-12"}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          disabled={busy}
          className="icon-button"
          onClick={onClose}
          aria-label="閉じる"
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function EmptyState({
  title = "まだ記録がありません",
  text = "日々の収入や支出を、ひとつずつ記録しましょう。",
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Wallet size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function EntryTable({
  entries,
  categories,
  onEdit,
  onDelete,
  compact = false,
  paymentMethods = [],
}: {
  entries: Entry[];
  categories: Category[];
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  compact?: boolean;
  paymentMethods?: PaymentMethod[];
}) {
  return (
    <div className="table-scroll">
      <table className="entry-table">
        <thead>
          <tr>
            <th>日付 / 内容</th>
            <th>カテゴリ</th>
            <th>種類</th>
            {!compact && <th>支払い方法</th>}
            <th className="align-right">金額</th>
            {!compact && <th className="align-right">操作</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>
                <div className="entry-title">
                  <span
                    className={`entry-icon ${entry.direction === "income" ? "income" : entry.expenseKind}`}
                  >
                    {entry.direction === "income" ? (
                      <ArrowDownLeft size={17} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                  <div>
                    <button
                      className="text-button memo-button"
                      onClick={() => onEdit(entry)}
                    >
                      {entry.memo ||
                        categories.find(
                          (category) => category.id === entry.categoryId,
                        )?.name ||
                        "未分類の記録"}
                    </button>
                    <small>{entry.date.replaceAll("-", ".")}</small>
                    <span className={`entry-status ${entry.status}`}>
                      {entry.status === "draft" ? "仮入力" : "確定"}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                {categories.find((category) => category.id === entry.categoryId)
                  ?.name || "未分類"}
              </td>
              <td>
                <span
                  className={`badge ${entry.direction === "income" ? "income" : entry.expenseKind}`}
                >
                  {entry.direction === "income"
                    ? "収入"
                    : expenseLabels[entry.expenseKind!]}
                </span>
              </td>
              {!compact && (
                <td>
                  {paymentMethods.find(
                    (method) => method.id === entry.paymentMethodId,
                  )?.name || "未設定"}
                </td>
              )}
              <td
                className={`align-right amount ${entry.direction === "income" ? "positive" : ""}`}
              >
                {entry.direction === "income" ? "+" : "−"}
                {yen(entry.amount)}
              </td>
              {!compact && (
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`${entry.memo || "記録"}を編集`}
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button danger-hover"
                      aria-label={`${entry.memo || "記録"}を削除`}
                      onClick={() => onDelete(entry)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrendChart({
  rows,
}: {
  rows: (Summary & { month: string })[];
}) {
  const max = Math.max(
    10000,
    ...rows.flatMap((row) => [Math.abs(row.living), Math.abs(row.cash)]),
  );
  const hasNegative = rows.some((row) => row.living < 0 || row.cash < 0);
  const top = 16,
    bottom = 178,
    baseline = hasNegative ? 97 : bottom;
  const scale = (hasNegative ? 72 : 146) / max;
  const chartWidth = 660,
    left = 78,
    usable = chartWidth - left - 12,
    step = usable / rows.length;
  return (
    <div className="trend-chart">
      <svg
        viewBox={`0 0 ${chartWidth} 218`}
        role="img"
        aria-label="月別の生活収支と現金収支の棒グラフ。正確な金額は月別集計の表で確認できます。"
      >
        {[top, baseline, ...(hasNegative ? [bottom] : [97])].map((y) => (
          <line
            key={y}
            x1={left}
            x2={chartWidth - 8}
            y1={y}
            y2={y}
            stroke="#e7ebe6"
            strokeDasharray={y === baseline ? "" : "4 5"}
          />
        ))}
        <text
          x={left - 10}
          y={top + 6}
          textAnchor="end"
          className="chart-label"
        >
          {(max / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}
          万円
        </text>
        <text
          x={left - 10}
          y={baseline + 4}
          textAnchor="end"
          className="chart-label"
        >
          0
        </text>
        {hasNegative && (
          <text
            x={left - 10}
            y={bottom}
            textAnchor="end"
            className="chart-label"
          >
            −
            {(max / 10000).toLocaleString("ja-JP", {
              maximumFractionDigits: 1,
            })}
            万円
          </text>
        )}
        {rows.map((row, index) => {
          const center = left + step * (index + 0.5),
            width = Math.min(18, step * 0.25);
          return (
            <g key={row.month}>
              <title>
                {monthLabel(row.month)}：生活収支 {signedYen(row.living)}
                、現金収支 {signedYen(row.cash)}
              </title>
              {[
                { value: row.living, x: center - width - 2, fill: "#367560" },
                { value: row.cash, x: center + 2, fill: "#b8cbbb" },
              ].map((bar) => (
                <rect
                  key={bar.x}
                  x={bar.x}
                  y={
                    bar.value >= 0
                      ? baseline - Math.abs(bar.value) * scale
                      : baseline
                  }
                  width={width}
                  height={Math.max(
                    bar.value === 0 ? 1 : 2,
                    Math.abs(bar.value) * scale,
                  )}
                  rx="3"
                  fill={bar.fill}
                />
              ))}
              <text
                x={center}
                y={205}
                textAnchor="middle"
                className="chart-label"
              >
                {Number(row.month.slice(5))}月
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span>
          <i style={{ background: "#367560" }} />
          生活収支
        </span>
        <span>
          <i style={{ background: "#b8cbbb" }} />
          現金収支
        </span>
      </div>
    </div>
  );
}
