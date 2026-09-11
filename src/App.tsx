import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  FolderOpen,
  LayoutDashboard,
  Leaf,
  LockKeyhole,
  Plus,
  RefreshCw,
  X,
  Settings,
  CalendarClock,
  Zap,
  Sparkles,
} from "lucide-react";
import { api, desktopAvailable } from "./api";
import { EmptyState, Modal, MonthPicker } from "./components";
import Dashboard from "./Dashboard";
import History from "./History";
import Reports from "./Reports";
import Categories from "./Categories";
import AnalysisPrompt from "./AnalysisPrompt";
import EntryForm from "./EntryForm";
import SettingsPage from "./Settings";
import Presets, { DailyTools } from "./Presets";
import { localDate, yen } from "./finance";
import type {
  Category,
  Entry,
  EntryInput,
  Snapshot,
  Preset,
  PresetMode,
  Occurrence,
} from "./types";

type Page =
  | "dashboard"
  | "history"
  | "reports"
  | "categories"
  | "payments"
  | "recurring"
  | "quick"
  | "analysis";
type FormState = {
  entry: Entry | null;
  initial?: EntryInput;
  preset?: Preset | null;
  presetMode?: PresetMode;
  occurrence?: Occurrence;
  templateName?: string;
};
const pages = [
  {
    id: "dashboard",
    label: "ダッシュボード",
    icon: LayoutDashboard,
    description: "暮らしのお金を、ひと目で。",
  },
  {
    id: "history",
    label: "収支の履歴",
    icon: BookOpen,
    description: "日々の記録を、振り返る。",
  },
  {
    id: "reports",
    label: "月別集計",
    icon: BarChart3,
    description: "家計の変化を、少し長い目で。",
  },
  {
    id: "categories",
    label: "カテゴリ管理",
    icon: FolderOpen,
    description: "あなたの暮らしに合う分類を。",
  },
  {
    id: "analysis",
    label: "AI分析プロンプト",
    icon: Sparkles,
    description: "家計の振り返りを、AIに相談する準備。",
  },
  {
    id: "payments",
    label: "設定",
    icon: Settings,
    description: "支払い方法と、祝日カレンダーを管理。",
  },
  {
    id: "recurring",
    label: "定期収支",
    icon: CalendarClock,
    description: "毎月の収支を、忘れずに。",
  },
  {
    id: "quick",
    label: "入力テンプレート",
    icon: Zap,
    description: "いつもの金額を、もっと手軽に。",
  },
] as const;
const sortEntries = (entries: Entry[]) =>
  [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

export default function App() {
  const [data, setData] = useState<Snapshot>({
    entries: [],
    categories: [],
    paymentMethods: [],
    presets: [],
    schedules: [],
    draftThrough: "",
    holidayInfo: { fetchedAt: null, firstYear: null, lastYear: null, count: 0 },
  });
  const [page, setPage] = useState<Page>("dashboard");
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [syncError, setSyncError] = useState("");
  const [deletion, setDeletion] = useState<
    { type: "entry"; item: Entry } | { type: "category"; item: Category } | null
  >(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [toast, setToast] = useState("");
  const [showStorage, setShowStorage] = useState(false);
  const [storagePath, setStoragePath] = useState("");
  const [storageError, setStorageError] = useState("");
  const desktop = desktopAvailable();
  const currentPage = pages.find((item) => item.id === page)!;
  const refresh = useCallback(async () => {
    const loaded = await api.load();
    setData({ ...loaded, entries: sortEntries(loaded.entries) });
    setSyncError("");
  }, []);
  const refreshSafely = useCallback(() => {
    void refresh().catch((error) =>
      setSyncError(`最新の表示を取得できませんでした。${String(error)}`),
    );
  }, [refresh]);
  const load = useCallback(async () => {
    if (!desktop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const loaded = await api.load();
      setData({ ...loaded, entries: sortEntries(loaded.entries) });
    } catch (error) {
      setLoadError(String(error));
    } finally {
      setLoading(false);
    }
  }, [desktop]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!desktop || loading || loadError || form || deletion) return;
    const timer = setInterval(refreshSafely, 60_000);
    window.addEventListener("focus", refreshSafely);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshSafely);
    };
  }, [desktop, loading, loadError, form, deletion, refreshSafely]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "n" &&
        desktop &&
        !loading &&
        !loadError &&
        !form &&
        !deletion &&
        !showStorage
      ) {
        event.preventDefault();
        setForm({ entry: null });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [desktop, loading, loadError, form, deletion, showStorage]);

  function savedEntry(entry: Entry, keepOpen: boolean) {
    setData((previous) => ({
      ...previous,
      entries: sortEntries([
        ...previous.entries.filter((item) => item.id !== entry.id),
        entry,
      ]),
    }));
    setToast(form?.entry ? "記録を更新しました" : "収支を記録しました");
    if (form?.occurrence || entry.presetId !== null) refreshSafely();
    if (!keepOpen) setForm(null);
  }
  function savedCategory(category: Category) {
    setData((previous) => ({
      ...previous,
      categories: previous.categories.some((item) => item.id === category.id)
        ? previous.categories.map((item) =>
            item.id === category.id ? category : item,
          )
        : [...previous.categories, category],
    }));
    setToast("カテゴリを保存しました");
  }
  async function confirmDelete() {
    if (!deletion || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      if (deletion.type === "entry") {
        await api.deleteEntry(deletion.item.id);
        setData((previous) => ({
          ...previous,
          entries: previous.entries.filter(
            (entry) => entry.id !== deletion.item.id,
          ),
        }));
      } else {
        await api.deleteCategory(deletion.item.id);
        setData((previous) => ({
          ...previous,
          categories: previous.categories.filter(
            (category) => category.id !== deletion.item.id,
          ),
          entries: previous.entries.map((entry) =>
            entry.categoryId === deletion.item.id
              ? { ...entry, categoryId: null }
              : entry,
          ),
          presets: previous.presets.map((preset) =>
            preset.categoryId === deletion.item.id
              ? { ...preset, categoryId: null }
              : preset,
          ),
        }));
      }
      setDeletion(null);
      setToast("削除しました");
      refreshSafely();
    } catch (error) {
      setDeleteError(String(error));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }
  async function openStorage() {
    setShowStorage(true);
    setStorageError("");
    try {
      setStoragePath(await api.path());
    } catch (error) {
      setStorageError(String(error));
    }
  }
  const add = () => setForm({ entry: null });
  const edit = (entry: Entry) => setForm({ entry });
  const usePreset = (preset: Preset, date?: string) =>
    setForm({
      entry:
        data.entries.find(
          (entry) =>
            entry.presetId === preset.id && entry.scheduledDate === date,
        ) || null,
      templateName: preset.name,
      initial: {
        id: null,
        status: preset.mode === "recurring" ? "draft" : "confirmed",
        date: date || localDate(),
        amount: preset.amount,
        direction: preset.direction,
        categoryId: preset.categoryId,
        paymentMethodId: preset.paymentMethodId,
        memo: preset.memo || preset.name,
        expenseKind: preset.expenseKind,
      },
      occurrence:
        preset.mode === "recurring" &&
        date &&
        !data.entries.some(
          (entry) =>
            entry.presetId === preset.id && entry.scheduledDate === date,
        )
          ? { presetId: preset.id, scheduledDate: date }
          : undefined,
    });
  const savedPreset = (preset: Preset) => {
    setData((previous) => ({
      ...previous,
      presets: [
        ...previous.presets.filter((item) => item.id !== preset.id),
        preset,
      ].sort((a, b) => a.id - b.id),
    }));
    setForm(null);
    setToast("設定を保存しました");
    refreshSafely();
  };
  const deleteEntry = (item: Entry) => {
    setDeleteError("");
    setDeletion({ type: "entry", item });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Leaf size={23} />
          </div>
          <div>
            <strong>
              HIBI<span>日々</span>
            </strong>
            <small>わたしの家計簿</small>
          </div>
        </div>
        <div className="nav-caption">MY HOUSEHOLD</div>
        <nav aria-label="メインナビゲーション">
          {pages.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {page === item.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={22} />
            <strong>
              今日の記録が、
              <br />
              明日のゆとりに。
            </strong>
            <p>
              暮らしと、将来のためのお金。
              <br />
              分けて見ると、もっと分かる。
            </p>
          </div>
          <button
            className="storage-button"
            disabled={!desktop}
            onClick={() => void openStorage()}
          >
            <LockKeyhole size={15} />
            <span>この端末だけに保存</span>
            <ArrowRight size={14} />
          </button>
          <div className="app-version">
            HIBI K A K E I B O <span>v0.9.0</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="breadcrumb">
              わたしの家計簿 <span>/</span> {currentPage.label}
            </p>
            <h1>{currentPage.label}</h1>
            <p className="page-description">{currentPage.description}</p>
          </div>
          <div className="header-actions">
            {(page === "dashboard" || page === "history") && (
              <MonthPicker month={month} onChange={setMonth} />
            )}
            <button
              className="button primary"
              onClick={add}
              disabled={!desktop || loading || Boolean(loadError)}
              title="Ctrl+N"
            >
              <Plus size={19} />
              収支を記録
            </button>
          </div>
        </header>
        {!desktop ? (
          <div className="page-content">
            <section className="panel">
              <EmptyState
                title="デスクトップアプリで開いてください"
                text="この家計簿はTauriから端末内のSQLiteに保存します。ブラウザ単体では記録できません。"
              />
              <div className="launch-help">
                <code>npm run tauri dev</code>
                <p>
                  開発環境では上記コマンドで起動してください。配布版はHIBI
                  家計簿を開いてください。
                </p>
              </div>
            </section>
          </div>
        ) : loading ? (
          <div className="loading-state" role="status">
            <RefreshCw className="spin" size={24} />
            <p>家計簿を読み込んでいます…</p>
          </div>
        ) : loadError ? (
          <div className="page-content">
            <section className="panel error-panel">
              <h2>データを読み込めませんでした</h2>
              <p role="alert">{loadError}</p>
              <button className="button secondary" onClick={() => void load()}>
                <RefreshCw size={16} />
                再試行
              </button>
            </section>
          </div>
        ) : (
          <>
            {syncError && (
              <div className="sync-error" role="alert">
                {syncError}
                <button
                  className="button secondary small"
                  onClick={refreshSafely}
                >
                  表示を更新
                </button>
              </div>
            )}
            {page === "dashboard" && (
              <Dashboard
                {...data}
                tools={
                  <DailyTools
                    data={data}
                    onUse={usePreset}
                    month={month}
                    onRecurring={() => setPage("recurring")}
                    onManage={() => setPage("quick")}
                  />
                }
                month={month}
                onAdd={add}
                onEdit={edit}
                onHistory={() => setPage("history")}
                onReports={() => {
                  setYear(Number(month.slice(0, 4)));
                  setPage("reports");
                }}
              />
            )}
            {page === "history" && (
              <History
                key={month}
                {...data}
                month={month}
                onEdit={edit}
                onDelete={deleteEntry}
              />
            )}
            {page === "reports" && (
              <Reports
                entries={data.entries}
                year={year}
                onYear={setYear}
                onMonth={(value) => {
                  setMonth(value);
                  setPage("dashboard");
                }}
              />
            )}
            {page === "categories" && (
              <Categories
                {...data}
                onSaved={savedCategory}
                onChanged={refresh}
                onDelete={(item) => {
                  setDeleteError("");
                  setDeletion({ type: "category", item });
                }}
              />
            )}
            {page === "analysis" && (
              <AnalysisPrompt data={data} month={month} onMonth={setMonth} />
            )}
            {page === "payments" && (
              <SettingsPage data={data} onChanged={refresh} />
            )}
            {(page === "quick" || page === "recurring") && (
              <Presets
                key={page}
                mode={page}
                month={month}
                onMonth={setMonth}
                data={data}
                onChanged={refresh}
                onUse={usePreset}
                onAdd={() => setForm({ entry: null, presetMode: page })}
                onEdit={(preset) =>
                  setForm({ entry: null, presetMode: preset.mode, preset })
                }
              />
            )}
          </>
        )}
      </main>
      {form && (
        <EntryForm
          {...form}
          categories={data.categories}
          paymentMethods={data.paymentMethods}
          holidayInfo={data.holidayInfo}
          onSaved={savedEntry}
          onPresetSaved={savedPreset}
          onClose={() => setForm(null)}
        />
      )}
      {deletion && (
        <Modal
          title={
            deletion.type === "entry"
              ? "この記録を削除しますか？"
              : "カテゴリを削除しますか？"
          }
          onClose={() => setDeletion(null)}
          busy={deleting}
        >
          <div className="confirm-body">
            {deletion.type === "entry" ? (
              <>
                <div className="delete-preview">
                  <span>
                    {deletion.item.date} · {deletion.item.memo || "メモなし"}
                  </span>
                  <strong>{yen(deletion.item.amount)}</strong>
                </div>
                <p>この操作は取り消せません。</p>
              </>
            ) : (
              <>
                <p>
                  <strong>「{deletion.item.name}」</strong>を削除します。
                </p>
                <p>
                  該当する
                  {
                    data.entries.filter(
                      (entry) => entry.categoryId === deletion.item.id,
                    ).length
                  }
                  件の記録は「未分類」に移ります。記録や金額は残ります。
                </p>
              </>
            )}
            {deleteError && (
              <p className="error-message" role="alert">
                {deleteError}
              </p>
            )}
            <div className="button-group justify-end">
              <button
                className="button secondary"
                disabled={deleting}
                onClick={() => setDeletion(null)}
              >
                キャンセル
              </button>
              <button
                className="button danger"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "削除中…" : "削除する"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showStorage && (
        <Modal
          title="データの保存先"
          subtitle="すべての収支とカテゴリは、この端末内のSQLiteに保存されています。"
          onClose={() => setShowStorage(false)}
        >
          <div className="storage-body">
            <LockKeyhole size={28} />
            <p>
              収支やメモを外部サービスへ送信しません。祝日の取得・更新時だけ内閣府の公開CSVをダウンロードします。銀行・証券口座との自動連携はありません。
            </p>
            <label>保存ファイル</label>
            <code>
              {storagePath ||
                (storageError ? "取得できませんでした" : "確認中…")}
            </code>
            {storageError && (
              <p role="alert" className="error-message">
                {storageError}
              </p>
            )}
            <p>
              バックアップする場合はアプリを終了してから、保存先フォルダをコピーしてください。復元時もアプリを終了し、同じ場所に戻してください。
            </p>
            <button
              className="button secondary"
              onClick={() => setShowStorage(false)}
            >
              閉じる
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="通知を閉じる"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
