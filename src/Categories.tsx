import { useRef, useState, type FormEvent } from "react";
import { Check, Folder, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "./api";
import { EmptyState } from "./components";
import OrderButtons, { movedIds } from "./OrderButtons";
import type { Category, Entry } from "./types";

export default function Categories({
  categories,
  entries,
  onSaved,
  onDelete,
  onChanged,
}: {
  categories: Category[];
  entries: Entry[];
  onSaved: (category: Category) => void;
  onDelete: (category: Category) => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  async function move(index: number, step: number) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setOrderStatus("");
    try {
      await api.reorderCategories(movedIds(categories, index, step));
      await onChanged();
      setOrderStatus("並び順を保存しました");
    } catch (error) {
      setError(String(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveCategory(editing?.id ?? null, name);
      onSaved(saved);
      setName("");
      setEditing(null);
    } catch (error) {
      setError(String(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="page-content categories-page">
      <section className="panel category-editor">
        <div className="panel-heading">
          <div>
            <h2>{editing ? "カテゴリを編集" : "カテゴリを追加"}</h2>
            <p>自分の暮らしに合わせて、自由に整理できます。</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            カテゴリ名
            <input
              ref={inputRef}
              disabled={busy}
              value={name}
              maxLength={40}
              placeholder="例：カフェ・書籍・ペット"
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim()}>
            {editing ? <Check size={17} /> : <Plus size={17} />}
            {busy ? "保存中…" : editing ? "変更を保存" : "追加する"}
          </button>
          {editing && (
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label="編集をキャンセル"
              onClick={() => {
                setEditing(null);
                setName("");
                setError("");
              }}
            >
              <X size={18} />
            </button>
          )}
        </form>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>
      <div className="section-title">
        <h2>カテゴリ一覧</h2>
        <span>{categories.length} カテゴリ</span>
        <button
          type="button"
          className="button secondary"
          disabled={busy || categories.length < 2}
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
      {categories.length ? (
        <div className={`category-grid ${reordering ? "is-reordering" : ""}`}>
          {categories.map((category, index) => (
            <div
              data-testid="category-item"
              className={`category-item ${editing?.id === category.id ? "editing" : ""}`}
              key={category.id}
            >
              {reordering && <span className="order-number">{index + 1}</span>}
              <span className="category-folder">
                <Folder size={19} />
              </span>
              <div>
                <strong>{category.name}</strong>
                <small>
                  {
                    entries.filter((entry) => entry.categoryId === category.id)
                      .length
                  }{" "}
                  件の記録
                </small>
              </div>
              <div className="row-actions">
                {reordering && (
                  <OrderButtons
                    name={category.name}
                    index={index}
                    count={categories.length}
                    busy={busy}
                    onMove={(step) => void move(index, step)}
                  />
                )}
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`${category.name}を編集`}
                  onClick={() => {
                    setEditing(category);
                    setName(category.name);
                    setError("");
                    inputRef.current?.focus();
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button danger-hover"
                  disabled={busy}
                  aria-label={`${category.name}を削除`}
                  onClick={() => {
                    if (editing?.id === category.id) {
                      setEditing(null);
                      setName("");
                    }
                    onDelete(category);
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
          title="カテゴリを追加しましょう"
          text="カテゴリがなくても「未分類」で収支を記録できます。"
        />
      )}
      <p className="page-footnote">
        カテゴリを削除しても記録は消えません。該当する記録のカテゴリは「未分類」になります。支出の種類や集計金額は変わりません。
      </p>
    </div>
  );
}
