import { useRef, useState, type FormEvent } from "react";
import { CreditCard, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "./api";
import { EmptyState, Modal } from "./components";
import OrderButtons, { movedIds } from "./OrderButtons";
import type { PaymentMethod, Snapshot } from "./types";

export default function PaymentMethods({
  data,
  onChanged,
}: {
  data: Snapshot;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [deletion, setDeletion] = useState<PaymentMethod | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");
  async function move(index: number, step: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setOrderStatus("");
    try {
      await api.reorderPaymentMethods(
        movedIds(data.paymentMethods, index, step),
      );
      await onChanged();
      setOrderStatus("並び順を保存しました");
    } catch (error) {
      setError(String(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function reset() {
    setName("");
    setIsDefault(false);
    setEditing(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.savePaymentMethod(editing?.id ?? null, name, isDefault);
      reset();
      await onChanged();
    } catch (error) {
      setError(String(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!deletion || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.deletePaymentMethod(deletion.id);
      if (editing?.id === deletion.id) reset();
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
      <div className="section-title">
        <h2>支払い方法</h2>
        <span>設定</span>
      </div>
      <section className="panel category-editor">
        <div className="panel-heading">
          <div>
            <h2>{editing ? "支払い方法を編集" : "支払い方法を追加"}</h2>
            <p>現金、カード、交通系ICなど、普段使う方法を登録しましょう。</p>
          </div>
        </div>
        <form onSubmit={save}>
          <label className="field">
            支払い方法名
            <input
              ref={input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={40}
              disabled={busy}
              placeholder="例：Suica・メインのカード"
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim()}>
            <Plus size={16} />
            {editing ? "変更を保存" : "追加する"}
          </button>
          {editing && (
            <button
              type="button"
              className="icon-button"
              aria-label="編集をキャンセル"
              disabled={busy}
              onClick={reset}
            >
              <X size={18} />
            </button>
          )}
        </form>
        <label className="checkbox-label payment-default">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
            disabled={busy}
          />
          新しい記録で最初に選択する
        </label>
        {!deletion && error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>
      <div className="section-title">
        <h2>登録した支払い方法</h2>
        <span>{data.paymentMethods.length} 件</span>
        <button
          type="button"
          className="button secondary"
          disabled={busy || data.paymentMethods.length < 2}
          onClick={() => {
            setReordering(!reordering);
            setOrderStatus("");
          }}
        >
          {reordering ? "並び替えを完了" : "並び替え"}
        </button>
      </div>
      {reordering && (
        <p className="order-help">
          上下ボタンで並び替えます。順序は自動保存され、入力画面の選択肢にも反映されます。
        </p>
      )}
      <p className="order-status" role="status">
        {orderStatus}
      </p>
      {data.paymentMethods.length ? (
        <div className={`category-grid ${reordering ? "is-reordering" : ""}`}>
          {data.paymentMethods.map((method, index) => (
            <div
              className="category-item"
              key={method.id}
              data-testid="payment-method-item"
            >
              {reordering && <span className="order-number">{index + 1}</span>}
              <span className="category-folder">
                <CreditCard size={18} />
              </span>
              <div>
                <strong>{method.name}</strong>
                <small>
                  {
                    data.entries.filter(
                      (entry) => entry.paymentMethodId === method.id,
                    ).length
                  }{" "}
                  件の記録{method.isDefault && " · 初期選択"}
                </small>
              </div>
              <div className="row-actions">
                {reordering && (
                  <OrderButtons
                    name={method.name}
                    index={index}
                    count={data.paymentMethods.length}
                    busy={busy}
                    onMove={(step) => void move(index, step)}
                  />
                )}
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`${method.name}を編集`}
                  onClick={() => {
                    setEditing(method);
                    setName(method.name);
                    setIsDefault(method.isDefault);
                    setError("");
                    input.current?.focus();
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button danger-hover"
                  disabled={busy}
                  aria-label={`${method.name}を削除`}
                  onClick={() => {
                    setDeletion(method);
                    setError("");
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="支払い方法を追加しましょう"
          text="未設定のままでも収支を記録できます。"
        />
      )}
      <p className="page-footnote">
        削除した支払い方法は、過去の記録とテンプレートで「未設定」になります。金額は変わりません。カード利用は利用時の支出として記録し、後日の引き落としを重ねて登録しない運用を想定しています。
      </p>
      {deletion && (
        <Modal
          title="支払い方法を削除しますか？"
          onClose={() => setDeletion(null)}
          busy={busy}
        >
          <div className="confirm-body">
            <p>
              「{deletion.name}
              」を削除します。記録とテンプレートは残り、支払い方法だけが未設定になります。
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
