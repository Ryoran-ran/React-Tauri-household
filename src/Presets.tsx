import { useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Pencil,
  Plus,
  SkipForward,
  Trash2,
  Zap,
} from "lucide-react";
import { api } from "./api";
import { EmptyState, Modal, MonthPicker } from "./components";
import {
  expenseLabels,
  forMonth,
  monthLabel,
  weekendLabels,
  yen,
} from "./finance";
import type { Occurrence, Preset, PresetMode, Snapshot } from "./types";

export const frequencyLabels = {
  weekly: "毎週",
  monthly: "毎月",
  yearly: "毎年",
};

export function ScheduleQueue({
  data,
  onUse,
  onChanged,
  month,
  onMonth,
}: {
  data: Snapshot;
  onUse: (preset: Preset, date?: string) => void;
  onChanged: () => Promise<void>;
  month: string;
  onMonth: (month: string) => void;
}) {
  const due = forMonth(data.entries, month)
    .filter((entry) => entry.presetId !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const draftCount = due.filter((entry) => entry.status === "draft").length;
  const [skip, setSkip] = useState<Occurrence | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  async function confirmSkip() {
    if (!skip || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const entry = data.entries.find(
        (entry) =>
          entry.presetId === skip.presetId &&
          entry.scheduledDate === skip.scheduledDate,
      );
      if (entry) await api.deleteEntry(entry.id);
      setSkip(null);
      await onChanged();
    } catch (error) {
      setError(String(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel due-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <CalendarClock size={18} />
            {monthLabel(month)}の定期収支
          </h2>
          <p>
            仮入力 {draftCount} 件 · 確定済み {due.length - draftCount}{" "}
            件。取引の日付で月ごとに表示します。
          </p>
        </div>
        <MonthPicker month={month} onChange={onMonth} />
      </div>
      {!due.length && (
        <EmptyState
          title="この月の定期収支はありません"
          text="月を切り替えるか、定期収支を追加してください。自動作成されている範囲まで確認できます。"
        />
      )}
      {due.map((schedule) => {
        const preset = data.presets.find(
          (preset) => preset.id === schedule.presetId,
        )!;
        return (
          <div
            className="due-row"
            key={schedule.id}
            data-testid="recurring-entry"
          >
            <div>
              <strong>{preset.name}</strong>
              <small>
                {schedule.date}
                {schedule.date !== schedule.scheduledDate &&
                  ` · 元の予定日 ${schedule.scheduledDate}`}
                {schedule.memo && schedule.memo !== preset.name
                  ? ` · ${schedule.memo}`
                  : ""}
              </small>
              <span className={`entry-status ${schedule.status}`}>
                {schedule.status === "draft" ? "仮入力" : "確定済み"}
              </span>
            </div>
            <strong
              className={schedule.direction === "income" ? "positive" : ""}
            >
              {schedule.direction === "income" ? "+" : "−"}
              {yen(schedule.amount)}
            </strong>
            <div className="button-group">
              <button
                className="button secondary small"
                onClick={() => onUse(preset, schedule.scheduledDate!)}
                aria-label={
                  schedule.status === "draft"
                    ? `${preset.name}の予定を確認`
                    : `${preset.name}の記録を編集`
                }
              >
                {schedule.status === "draft" ? "変更・確定" : "編集"}
              </button>
              {schedule.status === "draft" && (
                <button
                  className="icon-button"
                  aria-label={`${preset.name}の今回をスキップ`}
                  onClick={() => {
                    setSkip({
                      presetId: preset.id,
                      scheduledDate: schedule.scheduledDate!,
                    });
                    setError("");
                  }}
                >
                  <SkipForward size={17} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {!skip && error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {skip && (
        <Modal
          title="今回の予定をスキップしますか？"
          onClose={() => setSkip(null)}
          busy={busy}
        >
          <div className="confirm-body">
            <p>
              {skip.scheduledDate}{" "}
              の仮入力を削除します。次回以降の予定は残ります。
            </p>
            <p>
              スキップした分は再表示されません。必要な場合は通常の収支登録から記録できます。
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="button-group justify-end">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setSkip(null)}
              >
                キャンセル
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void confirmSkip()}
              >
                今回をスキップ
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function DailyTools({
  data,
  onUse,
  onManage,
  month,
  onRecurring,
}: {
  data: Snapshot;
  onUse: (preset: Preset, date?: string) => void;
  onManage: () => void;
  month: string;
  onRecurring: () => void;
}) {
  const quick = data.presets.filter(
    (preset) => preset.mode === "quick" && preset.active,
  );
  const monthly = forMonth(data.entries, month).filter(
    (entry) => entry.presetId !== null,
  );
  const drafts = monthly.filter((entry) => entry.status === "draft").length;
  return (
    <>
      {quick.length > 0 && (
        <section className="quick-panel">
          <div className="quick-heading">
            <span>
              <Zap size={15} />
              いつもの入力
            </span>
            <button className="text-button link-button" onClick={onManage}>
              テンプレート
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="quick-buttons">
            {quick.slice(0, 6).map((preset) => (
              <button key={preset.id} onClick={() => onUse(preset)}>
                <span>{preset.name}</span>
                <strong>{yen(preset.amount)}</strong>
                <Plus size={14} />
              </button>
            ))}
          </div>
        </section>
      )}
      {data.presets.some((preset) => preset.mode === "recurring") && (
        <section className="recurring-shortcut">
          <CalendarClock size={20} />
          <div>
            <strong>{monthLabel(month)}の定期収支</strong>
            <p>
              仮入力 {drafts} 件 · 確定済み {monthly.length - drafts} 件
            </p>
          </div>
          <button className="button secondary small" onClick={onRecurring}>
            月ごとの定期収支を開く
            <ArrowRight size={15} />
          </button>
        </section>
      )}
    </>
  );
}

export default function Presets({
  mode,
  data,
  onAdd,
  onEdit,
  onUse,
  onChanged,
  month,
  onMonth,
}: {
  mode: PresetMode;
  data: Snapshot;
  onAdd: () => void;
  onEdit: (preset: Preset) => void;
  onUse: (preset: Preset, date?: string) => void;
  onChanged: () => Promise<void>;
  month: string;
  onMonth: (month: string) => void;
}) {
  const list = data.presets.filter((preset) => preset.mode === mode);
  const [view, setView] = useState<"monthly" | "settings">("monthly");
  const showSettings = mode === "quick" || view === "settings";
  const [deletion, setDeletion] = useState<Preset | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const label = mode === "recurring" ? "定期収支" : "テンプレート";
  async function remove() {
    if (!deletion || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.deletePreset(deletion.id);
      setDeletion(null);
      await onChanged();
    } catch (error) {
      setError(String(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="page-content">
      {mode === "recurring" && (
        <div
          className="recurring-tabs"
          role="group"
          aria-label="定期収支の表示切り替え"
        >
          <button
            className={view === "monthly" ? "selected" : ""}
            aria-pressed={view === "monthly"}
            onClick={() => setView("monthly")}
          >
            月ごとの収支
          </button>
          <button
            className={view === "settings" ? "selected" : ""}
            aria-pressed={view === "settings"}
            onClick={() => setView("settings")}
          >
            繰り返し設定
          </button>
        </div>
      )}
      <div className="preset-toolbar">
        <p>
          {mode === "recurring"
            ? `給与・家賃などを仮入力。${data.draftThrough}まで（開始日が先なら初回）を自動で用意します。`
            : "電車代・いつものランチなど、決まった内容をすぐに入力。"}
        </p>
        <button className="button primary" onClick={onAdd}>
          <Plus size={17} />
          {label}を追加
        </button>
      </div>
      {mode === "recurring" && view === "monthly" && (
        <>
          {(!data.holidayInfo.firstYear ||
            !data.holidayInfo.lastYear ||
            Number(month.slice(0, 4)) < data.holidayInfo.firstYear ||
            Number(month.slice(0, 4)) > data.holidayInfo.lastYear) && (
            <p className="holiday-warning">
              この年の祝日は未取得です。現在は土日と保存済みの祝日だけを日付調整に使います。「設定
              → 祝日」で取得・更新できます。
            </p>
          )}
          <ScheduleQueue
            data={data}
            onUse={onUse}
            onChanged={onChanged}
            month={month}
            onMonth={onMonth}
          />
        </>
      )}
      {showSettings && (
        <>
          <div className="section-title">
            <h2>登録した{label}</h2>
            <span>{list.length} 件</span>
          </div>
          {list.length ? (
            <div className="preset-grid">
              {list.map((preset) => {
                const schedule = data.schedules.find(
                  (schedule) => schedule.presetId === preset.id,
                );
                return (
                  <section className="panel preset-card" key={preset.id}>
                    <div className="preset-title">
                      <span
                        className={`metric-icon ${preset.direction === "income" ? "income" : preset.expenseKind}`}
                      >
                        {mode === "recurring" ? (
                          <CalendarClock size={18} />
                        ) : (
                          <Zap size={18} />
                        )}
                      </span>
                      <h3>{preset.name}</h3>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`${preset.name}を編集`}
                          onClick={() => onEdit(preset)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button danger-hover"
                          aria-label={`${preset.name}を削除`}
                          onClick={() => {
                            setDeletion(preset);
                            setError("");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <strong
                      className={`preset-amount ${preset.direction === "income" ? "positive" : ""}`}
                    >
                      {preset.direction === "income" ? "+" : "−"}
                      {yen(preset.amount)}
                    </strong>
                    <div className="preset-meta">
                      <span>
                        {preset.direction === "income"
                          ? "収入"
                          : expenseLabels[preset.expenseKind!]}
                      </span>
                      <span>
                        {data.categories.find(
                          (category) => category.id === preset.categoryId,
                        )?.name || "未分類"}
                      </span>
                      <span>
                        {data.paymentMethods.find(
                          (method) => method.id === preset.paymentMethodId,
                        )?.name || "支払い方法 未設定"}
                      </span>
                    </div>
                    {mode === "recurring" ? (
                      <div className="preset-schedule">
                        <p>
                          {frequencyLabels[preset.frequency!]} · 開始{" "}
                          {preset.startDate}
                          {preset.endDate && ` / 終了 ${preset.endDate}`}
                        </p>
                        <p>
                          土日・祝日の扱い：
                          {weekendLabels[preset.weekendAdjustment]}
                        </p>
                        <strong>
                          {!preset.active
                            ? "停止中"
                            : schedule?.dueCount
                              ? `予定日を迎えた未確定分 ${schedule.dueCount}件`
                              : schedule?.nextDate
                                ? `次回 ${schedule.nextDate}`
                                : "すべての予定が終了しました"}
                        </strong>
                      </div>
                    ) : (
                      <button
                        className="button secondary"
                        onClick={() => onUse(preset)}
                      >
                        この内容で入力
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={`${label}を追加しましょう`}
              text={
                mode === "recurring"
                  ? "収入・支出のどちらも設定できます。仮入力は見込みに、確定後は確定分の収支に反映します。"
                  : "名前・金額・カテゴリ・支払い方法を保存できます。"
              }
            />
          )}
        </>
      )}
      {!deletion && error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <p className="page-footnote">
        {mode === "recurring"
          ? "予定は開始日を基準に繰り返し、該当日がない月は月末に調整します。記録済みの予定は、記録を削除しても再表示しません。"
          : "テンプレートを選ぶと今日の日付で入力画面が開きます。今回だけの金額変更も可能です。"}
      </p>
      {deletion && (
        <Modal
          title={`${label}を削除しますか？`}
          onClose={() => setDeletion(null)}
          busy={busy}
        >
          <div className="confirm-body">
            <p>
              「{deletion.name}
              」を削除します。作成済みの仮入力と確定分は残り、履歴から編集・削除できます。
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="button-group justify-end">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setDeletion(null)}
              >
                キャンセル
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                削除する
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
