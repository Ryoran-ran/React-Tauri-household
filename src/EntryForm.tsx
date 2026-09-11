import { useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Plus } from "lucide-react";
import { api } from "./api";
import { localDate, weekendLabels } from "./finance";
import { Modal } from "./components";
import type {
  Category,
  Direction,
  Entry,
  EntryInput,
  ExpenseKind,
  PaymentMethod,
  Preset,
  PresetMode,
  Frequency,
  WeekendAdjustment,
  HolidayInfo,
  Occurrence,
} from "./types";

export default function EntryForm({
  entry,
  categories,
  onSaved,
  onClose,
  paymentMethods,
  initial,
  preset,
  presetMode,
  occurrence,
  templateName,
  onPresetSaved,
  holidayInfo,
}: {
  entry: Entry | null;
  categories: Category[];
  onSaved: (entry: Entry, keepOpen: boolean) => void;
  onClose: () => void;
  paymentMethods: PaymentMethod[];
  initial?: EntryInput;
  preset?: Preset | null;
  presetMode?: PresetMode;
  occurrence?: Occurrence;
  templateName?: string;
  onPresetSaved?: (preset: Preset) => void;
  holidayInfo: HolidayInfo;
}) {
  const source = entry || preset || initial;
  const [date, setDate] = useState(
    preset?.startDate || entry?.date || initial?.date || localDate(),
  );
  const [amount, setAmount] = useState(source ? String(source.amount) : "");
  const [direction, setDirection] = useState<Direction>(
    source?.direction || "expense",
  );
  const [kind, setKind] = useState<ExpenseKind>(
    source?.expenseKind || "normal",
  );
  const [category, setCategory] = useState(
    source?.categoryId?.toString() || "",
  );
  const [memo, setMemo] = useState(source?.memo || "");
  const [status, setStatus] = useState<"draft" | "confirmed">(
    entry?.status || initial?.status || "confirmed",
  );
  const [payment, setPayment] = useState(
    (source
      ? source.paymentMethodId
      : paymentMethods.find((method) => method.isDefault)?.id
    )?.toString() || "",
  );
  const [name, setName] = useState(preset?.name || "");
  const [frequency, setFrequency] = useState<Frequency>(
    preset?.frequency || "monthly",
  );
  const [endDate, setEndDate] = useState(preset?.endDate || "");
  const [active, setActive] = useState(preset?.active ?? true);
  const [weekendAdjustment, setWeekendAdjustment] = useState<WeekendAdjustment>(
    preset?.weekendAdjustment || "none",
  );
  const [keepOpen, setKeepOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (
      !/^\d+$/.test(amount) ||
      Number(amount) < 1 ||
      Number(amount) > 999999999
    ) {
      setError("金額は1〜999,999,999円の整数で入力してください。");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const input: EntryInput = {
        status:
          (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
            "data-confirm",
          ) === "true"
            ? "confirmed"
            : status,
        id: entry?.id ?? null,
        date,
        amount: Number(amount),
        direction,
        categoryId: category ? Number(category) : null,
        memo: memo.trim(),
        expenseKind: direction === "income" ? null : kind,
        paymentMethodId: payment ? Number(payment) : null,
      };
      if (presetMode) {
        const saved = await api.savePreset({
          id: preset?.id ?? null,
          name,
          mode: presetMode,
          amount: input.amount,
          direction,
          categoryId: input.categoryId,
          paymentMethodId: input.paymentMethodId,
          memo: input.memo,
          expenseKind: input.expenseKind,
          frequency: presetMode === "recurring" ? frequency : null,
          startDate: presetMode === "recurring" ? date : null,
          endDate: presetMode === "recurring" && endDate ? endDate : null,
          active,
          weekendAdjustment:
            presetMode === "recurring" ? weekendAdjustment : "none",
        });
        onPresetSaved?.(saved);
        return;
      }
      const saved = occurrence
        ? await api.recordOccurrence(occurrence, input)
        : await api.saveEntry(input);
      const again = !entry && !occurrence && keepOpen;
      onSaved(saved, again);
      if (again) {
        setAmount("");
        setMemo("");
        requestAnimationFrame(() => amountRef.current?.focus());
      }
    } catch (error) {
      setError(String(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={
        presetMode
          ? `${presetMode === "recurring" ? "定期収支" : "テンプレート"}${preset ? "を編集" : "を追加"}`
          : occurrence
            ? "定期収支を記録"
            : entry
              ? "記録を編集"
              : "収支を記録"
      }
      subtitle={
        presetMode
          ? "金額・カテゴリ・支払い方法をまとめて保存します。"
          : occurrence
            ? "必要なら今回の金額や日付を変更してから記録してください。"
            : "毎日の小さな記録が、家計の見通しに。"
      }
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="entry-form">
        <fieldset disabled={busy}>
          {presetMode && (
            <label className="field">
              名前
              <input
                aria-label="名前"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                placeholder={
                  presetMode === "quick"
                    ? "例：電車 自宅→勤務先（片道）"
                    : "例：家賃・毎月の給与"
                }
                required
              />
            </label>
          )}
          {templateName && (
            <p className="template-notice">
              {templateName}
              {occurrence
                ? ` · ${occurrence.scheduledDate} の予定`
                : " から入力"}
              <small>ここでの変更は今回の記録だけに反映されます。</small>
            </p>
          )}
          <div className="segmented-control" aria-label="収入・支出">
            <button
              type="button"
              aria-pressed={direction === "expense"}
              className={direction === "expense" ? "selected" : ""}
              onClick={() => setDirection("expense")}
            >
              <ArrowUpRight size={17} />
              支出
            </button>
            <button
              type="button"
              aria-pressed={direction === "income"}
              className={direction === "income" ? "selected" : ""}
              onClick={() => setDirection("income")}
            >
              <ArrowDownLeft size={17} />
              収入
            </button>
          </div>
          {!presetMode && (
            <label className="field">
              記録の状態
              <select
                aria-label="記録の状態"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "draft" | "confirmed")
                }
              >
                <option value="confirmed">確定</option>
                <option value="draft">仮入力</option>
              </select>
              <small className="field-hint">
                将来の日付でも確定できます。日付の属する月に集計し、仮入力は見込みだけに含めます。
              </small>
            </label>
          )}
          <label className="field amount-field">
            金額 <span className="required">必須</span>
            <div>
              <span>¥</span>
              <input
                autoFocus
                ref={amountRef}
                aria-label="金額"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(event) =>
                  setAmount(
                    event.target.value
                      .replace(/[,，\s]/g, "")
                      .replace(/[０-９]/g, (value) =>
                        String.fromCharCode(value.charCodeAt(0) - 0xfee0),
                      ),
                  )
                }
                maxLength={9}
                required
              />
              <span className="yen-unit">円</span>
            </div>
          </label>
          <div className="form-grid">
            {presetMode !== "quick" && (
              <label className="field">
                {presetMode === "recurring" ? "開始日（最初の予定日）" : "日付"}
                <input
                  aria-label={presetMode === "recurring" ? "開始日" : "日付"}
                  type="date"
                  min="1900-01-01"
                  max="9999-12-31"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </label>
            )}
            <label className="field">
              カテゴリ
              <select
                aria-label="カテゴリ"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">未分類</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            {direction === "income" ? "受取方法" : "支払い方法"}
            <select
              aria-label="支払い方法"
              value={payment}
              onChange={(event) => setPayment(event.target.value)}
            >
              <option value="">未設定</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </label>
          {presetMode === "recurring" && (
            <>
              <div className="form-grid">
                <label className="field">
                  繰り返し
                  <select
                    aria-label="繰り返し"
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.target.value as Frequency)
                    }
                  >
                    <option value="monthly">毎月</option>
                    <option value="weekly">毎週</option>
                    <option value="yearly">毎年</option>
                  </select>
                </label>
                <label className="field">
                  終了日（任意）
                  <input
                    aria-label="終了日"
                    type="date"
                    min={date || "1900-01-01"}
                    max="9999-12-31"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </label>
              </div>
              <p className="schedule-help">
                開始日を基準に繰り返し、該当日がない月は月末になります。翌月末までを仮入力し、開始日がそれより先の場合も初回を用意します。金額や日付を変更して確定できます。
              </p>
              <label className="field">
                予定日が土日・祝日の場合
                <select
                  aria-label="予定日が土日・祝日の場合"
                  value={weekendAdjustment}
                  onChange={(event) =>
                    setWeekendAdjustment(
                      event.target.value as WeekendAdjustment,
                    )
                  }
                >
                  {Object.entries(weekendLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <small className="field-hint">
                  土日と取得済みの祝日を避けます。開始日・終了日は調整前の日付で指定し、収支は調整後の月に集計します。
                </small>
                {weekendAdjustment !== "none" &&
                  (!holidayInfo.firstYear ||
                    !holidayInfo.lastYear ||
                    Number(date.slice(0, 4)) < holidayInfo.firstYear ||
                    Number(date.slice(0, 4)) > holidayInfo.lastYear) && (
                    <small className="holiday-warning">
                      開始年の祝日は未取得です。「設定 → 祝日」で取得できます。
                    </small>
                  )}
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                仮入力の自動作成を有効にする
              </label>
              {preset && (
                <p className="field-hint">
                  停止すると新しい仮入力を作りません。同じ周期で予定日を変えると、その期間の仮入力を引き継ぎます。未編集の仮入力には金額や日付の変更を反映し、個別に変更した内容と確定分は保持します。周期の変更や新しい開始日・終了日の範囲外にある作成済み分は、履歴で調整してください。
                </p>
              )}
            </>
          )}
          {direction === "expense" && (
            <div className="field">
              支出の種類
              <div className="kind-options">
                {(
                  [
                    ["normal", "通常支出", "食費・日用品など、日々の生活費"],
                    ["special", "税金・特別支出", "税金・臨時の大きな支出"],
                    [
                      "transfer",
                      "投資・貯蓄への資金移動",
                      "証券口座・貯蓄口座への入金",
                    ],
                  ] as const
                ).map(([value, title, description]) => (
                  <label
                    className={`kind-option ${kind === value ? "selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="expense-kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                    />
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    {kind === value && <Check size={17} />}
                  </label>
                ))}
              </div>
              {kind === "transfer" && (
                <p className="field-hint">
                  生活収支には含めず、現金収支から差し引きます。
                </p>
              )}
            </div>
          )}
          <label className="field">
            メモ <span className="optional">任意</span>
            <input
              placeholder="例：スーパーで買い物"
              value={memo}
              maxLength={500}
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="form-footer">
            {!entry && !presetMode && !occurrence && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={keepOpen}
                  onChange={(event) => setKeepOpen(event.target.checked)}
                />
                続けて入力
              </label>
            )}
            <div className="button-group">
              <button
                type="button"
                className="button secondary"
                onClick={onClose}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className={`button ${status === "draft" && !presetMode ? "secondary" : "primary"}`}
              >
                {!busy && (entry ? <Check size={17} /> : <Plus size={17} />)}
                {busy
                  ? "保存中…"
                  : presetMode
                    ? "設定を保存"
                    : status === "draft"
                      ? "仮入力を保存"
                      : entry
                        ? "変更を保存"
                        : "記録する"}
              </button>
              {!presetMode && status === "draft" && (
                <button
                  type="submit"
                  data-confirm="true"
                  className="button primary"
                >
                  変更して確定
                </button>
              )}
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
