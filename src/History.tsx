import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { EmptyState, EntryTable } from "./components";
import {
  expenseLabels,
  filterEntries,
  monthRange,
  signedYen,
  summarize,
  yen,
} from "./finance";
import type { Category, Entry, Filters, PaymentMethod } from "./types";

export default function History({
  entries,
  categories,
  paymentMethods,
  month,
  onEdit,
  onDelete,
}: {
  entries: Entry[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  month: string;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
}) {
  const initial: Filters = {
    ...monthRange(month),
    direction: "",
    category: "",
    expenseKind: "",
    search: "",
    paymentMethod: "",
  };
  const [filters, setFilters] = useState<Filters>(initial);
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () => filterEntries(entries, filters),
    [entries, filters],
  );
  const summary = summarize(filtered, true);
  const invalidPeriod = Boolean(
    filters.from && filters.to && filters.from > filters.to,
  );
  const pageSize = 20,
    lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1),
    currentPage = Math.min(page, lastPage);
  function update(values: Partial<Filters>) {
    setFilters((previous) => ({ ...previous, ...values }));
    setPage(0);
  }
  return (
    <div className="page-content">
      <section className="panel filter-panel">
        <div className="panel-heading">
          <h2>
            <SlidersHorizontal size={17} />
            履歴を絞り込む
          </h2>
          <button
            className="text-button link-button"
            onClick={() =>
              update({
                from: "",
                to: "",
                direction: "",
                category: "",
                expenseKind: "",
                search: "",
                paymentMethod: "",
                status: "",
              })
            }
          >
            <RotateCcw size={14} />
            すべて解除
          </button>
        </div>
        <div className="filter-grid">
          <label className="field">
            開始日
            <input
              type="date"
              min="1900-01-01"
              max="9999-12-31"
              value={filters.from}
              onChange={(event) => update({ from: event.target.value })}
            />
          </label>
          <label className="field">
            終了日
            <input
              type="date"
              min="1900-01-01"
              max="9999-12-31"
              value={filters.to}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
          <label className="field">
            収入 / 支出
            <select
              aria-label="収入 / 支出"
              value={filters.direction}
              onChange={(event) =>
                update({
                  direction: event.target.value as Filters["direction"],
                  expenseKind:
                    event.target.value === "income" ? "" : filters.expenseKind,
                })
              }
            >
              <option value="">すべて</option>
              <option value="income">収入</option>
              <option value="expense">支出</option>
            </select>
          </label>
          <label className="field">
            カテゴリ
            <select
              aria-label="カテゴリ"
              value={filters.category}
              onChange={(event) => update({ category: event.target.value })}
            >
              <option value="">すべて</option>
              <option value="none">未分類</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            支出の種類
            <select
              aria-label="支出の種類"
              disabled={filters.direction === "income"}
              value={filters.expenseKind}
              onChange={(event) =>
                update({
                  expenseKind: event.target.value as Filters["expenseKind"],
                })
              }
            >
              <option value="">すべて</option>
              {Object.entries(expenseLabels).map(([kind, name]) => (
                <option value={kind} key={kind}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-bottom">
          <label className="payment-filter">
            記録の状態
            <select
              aria-label="記録の状態"
              value={filters.status || ""}
              onChange={(event) =>
                update({ status: event.target.value as Filters["status"] })
              }
            >
              <option value="">すべて</option>
              <option value="confirmed">確定</option>
              <option value="draft">仮入力</option>
            </select>
          </label>
          <label className="payment-filter">
            支払い方法
            <select
              aria-label="支払い方法"
              value={filters.paymentMethod}
              onChange={(event) =>
                update({ paymentMethod: event.target.value })
              }
            >
              <option value="">すべて</option>
              <option value="none">未設定</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </label>
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="メモを検索"
              placeholder="メモを検索"
              value={filters.search}
              onChange={(event) => update({ search: event.target.value })}
            />
          </label>
          <button
            className="button secondary small"
            onClick={() => update(monthRange(month))}
          >
            選択中の月に戻す
          </button>
        </div>
        {invalidPeriod && (
          <p className="error-message" role="alert">
            終了日は開始日以降にしてください。
          </p>
        )}
      </section>
      <div className="history-summary">
        <span>
          <strong>{filtered.length}</strong> 件の記録 · 表示中の合計
          {filtered.some((entry) => entry.status === "draft")
            ? "（仮入力を含む）"
            : "（確定分）"}
        </span>
        <div>
          <span>
            収入 <strong className="positive">{yen(summary.income)}</strong>
          </span>
          <span>
            出金合計{" "}
            <strong>
              {yen(summary.normal + summary.special + summary.transfer)}
            </strong>
          </span>
          <span>
            差額{" "}
            <strong className={summary.cash < 0 ? "negative" : "positive"}>
              {signedYen(summary.cash)}
            </strong>
          </span>
        </div>
      </div>
      <section className="panel">
        {filtered.length ? (
          <>
            <EntryTable
              entries={filtered.slice(
                currentPage * pageSize,
                (currentPage + 1) * pageSize,
              )}
              categories={categories}
              paymentMethods={paymentMethods}
              onEdit={onEdit}
              onDelete={onDelete}
            />
            <div className="pagination">
              <span>
                {currentPage * pageSize + 1}–
                {Math.min((currentPage + 1) * pageSize, filtered.length)} /{" "}
                {filtered.length}件
              </span>
              <div className="button-group">
                <button
                  className="icon-button"
                  aria-label="前のページ"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {currentPage + 1} / {lastPage + 1}
                </span>
                <button
                  className="icon-button"
                  aria-label="次のページ"
                  disabled={currentPage === lastPage}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="条件に一致する記録がありません"
            text="期間やカテゴリなどの絞り込み条件を変更してください。"
          />
        )}
      </section>
    </div>
  );
}
