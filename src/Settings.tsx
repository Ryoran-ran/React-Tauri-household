import { useEffect, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import PaymentMethods from "./PaymentMethods";
import Updates from "./Updates";
import { api } from "./api";
import { EmptyState } from "./components";
import type { HolidayCalendar, Snapshot } from "./types";

export default function Settings({
  data,
  onChanged,
  onUpdateBusy,
}: {
  data: Snapshot;
  onChanged: () => Promise<void>;
  onUpdateBusy: (busy: boolean) => void;
}) {
  const [tab, setTab] = useState("payments");
  return (
    <>
      <div
        className="recurring-tabs settings-tabs"
        role="group"
        aria-label="設定の表示切り替え"
      >
        <button
          className={tab === "payments" ? "selected" : ""}
          aria-pressed={tab === "payments"}
          onClick={() => setTab("payments")}
        >
          支払い方法
        </button>
        <button
          className={tab === "holidays" ? "selected" : ""}
          aria-pressed={tab === "holidays"}
          onClick={() => setTab("holidays")}
        >
          祝日
        </button>
        <button
          className={tab === "updates" ? "selected" : ""}
          aria-pressed={tab === "updates"}
          onClick={() => setTab("updates")}
        >
          アップデート
        </button>
      </div>
      {tab === "payments" ? (
        <PaymentMethods data={data} onChanged={onChanged} />
      ) : tab === "holidays" ? (
        <Holidays onChanged={onChanged} />
      ) : (
        <Updates onBusy={onUpdateBusy} />
      )}
    </>
  );
}

function Holidays({ onChanged }: { onChanged: () => Promise<void> }) {
  const [calendar, setCalendar] = useState<HolidayCalendar | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    api
      .holidays()
      .then((data) => {
        if (live) setCalendar(data);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, []);
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const info = await api.refreshHolidays();
      setCalendar(await api.holidays());
      await onChanged();
      setMessage(
        `${info.count}件の祝日を保存しました。未編集の仮入力の日付も更新しました。`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const rows =
    calendar?.holidays.filter((h) => h.date.startsWith(`${year}-`)) || [];
  const info = calendar?.info;
  const covered =
    info?.firstYear != null &&
    info.lastYear != null &&
    year >= info.firstYear &&
    year <= info.lastYear;
  return (
    <div className="page-content">
      <section className="panel holiday-intro">
        <div className="panel-heading">
          <div>
            <h2>
              <CalendarDays size={18} />
              祝日カレンダー
            </h2>
            <p>出典：内閣府「国民の祝日について」</p>
          </div>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            {busy ? "取得中…" : "祝日を取得・更新"}
          </button>
        </div>
        <div className="holiday-description">
          <p>
            取得ボタンを押したときだけ、内閣府の公開CSVをダウンロードします。収支やメモは送信しません。取得後はオフラインでも使えます。
          </p>
          <p>
            定期収支の前倒し・後ろ倒しで、土日と保存済みの祝日を避けます。祝日を更新すると未編集の仮入力を調整し、確定済み・個別に修正済みの記録は保持します。
          </p>
          <p>
            金融機関や会社独自の休業日は含みません。取得範囲外の年は、公式データの公開後に更新してください。
          </p>
          <p data-testid="holiday-info">
            {info?.fetchedAt
              ? `保存済み：${info.firstYear}〜${info.lastYear}年・${info.count}件 / 最終取得：${new Date(info.fetchedAt).toLocaleString("ja-JP")}`
              : "祝日はまだ取得していません。現在の日付調整は土日だけが対象です。"}
          </p>
          {message && (
            <p role="status" className="positive">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{year}年の祝日・休日</h2>
            <p>{covered ? `${rows.length}件` : "この年の祝日は未取得です。"}</p>
          </div>
          <label className="field">
            表示する年
            <input
              aria-label="祝日を表示する年"
              type="number"
              min="1955"
              max="9999"
              value={year}
              onChange={(e) => {
                const y = Number(e.target.value);
                if (y >= 1955 && y <= 9999) setYear(y);
              }}
            />
          </label>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="entry-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>曜日</th>
                  <th>祝日・休日名</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.date}>
                    <td>{h.date}</td>
                    <td>
                      {new Date(`${h.date}T12:00:00`).toLocaleDateString(
                        "ja-JP",
                        { weekday: "long" },
                      )}
                    </td>
                    <td>{h.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="祝日データがありません"
            text="祝日を取得するか、保存済みの年を指定してください。"
          />
        )}
      </section>
    </div>
  );
}
