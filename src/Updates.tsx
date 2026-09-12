import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { Channel } from "@tauri-apps/api/core";
import { api } from "./api";
import { Modal } from "./components";

export interface UpdateInfo {
  version: string;
  configured: boolean;
  releasesUrl: string;
}
export interface AvailableUpdate {
  version: string;
  notes: string;
}
export interface UpdateProgress {
  stage: "download" | "verify" | "backup" | "install";
  downloaded: number;
  total: number | null;
  backupPath: string | null;
}
const stages = {
  download: "更新ファイルをダウンロードしています…",
  verify: "更新ファイルの署名を確認しています…",
  backup: "家計簿をバックアップしています…",
  install:
    "更新をインストールしています。アプリが終了し、更新後に再起動します。",
};

export default function Updates({
  onBusy,
}: {
  onBusy: (busy: boolean) => void;
}) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    onBusy(confirm);
    return () => onBusy(false);
  }, [confirm, onBusy]);
  useEffect(() => {
    let live = true;
    api
      .updateInfo()
      .then((value) => {
        if (live) setInfo(value);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, []);
  async function check() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setAvailable(null);
    try {
      const value = await api.checkUpdate();
      setAvailable(value);
      if (!value) setMessage("現在のバージョンは最新です。");
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function backup() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setBackupPath(await api.createUpdateBackup());
      setMessage("バックアップを保存しました。");
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function install() {
    if (!available || lock.current) return;
    lock.current = true;
    setInstalling(true);
    setError("");
    setMessage("");
    const channel = new Channel<UpdateProgress>();
    channel.onmessage = (value) => {
      setProgress(value);
      if (value.backupPath) setBackupPath(value.backupPath);
    };
    try {
      const path = await api.installUpdate(available.version, channel);
      setBackupPath(path);
      setConfirm(false);
      setMessage("更新処理が完了しました。");
      setAvailable(null);
    } catch (e) {
      setError(String(e));
      setProgress(null);
    } finally {
      lock.current = false;
      setInstalling(false);
    }
  }
  const fraction = progress?.total
    ? Math.min(progress.downloaded / progress.total, 1)
    : undefined;
  return (
    <div className="page-content">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>アプリのアップデート</h2>
            <p>現在のバージョン：{info ? `v${info.version}` : "確認中…"}</p>
          </div>
          <ShieldCheck size={23} />
        </div>
        <div className="update-content">
          <p>
            更新内容を確認してからインストールできます。収支・メモは送信しません。
          </p>
          {info && !info.configured && (
            <p className="update-notice" data-testid="updater-unconfigured">
              このビルドは更新の配布準備中です。署名鍵を設定した配布版をインストールすると、アプリ内更新を利用できます。
            </p>
          )}
          <div className="button-group">
            <button
              className="button primary"
              disabled={!info?.configured || busy}
              onClick={() => void check()}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} />
              {busy ? "処理中…" : "更新を確認"}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void api.openReleasePage().catch((e) => setError(String(e)))
              }
            >
              <ExternalLink size={17} />
              ダウンロードページ
            </button>
          </div>
          {info && <p className="update-url">配布先：{info.releasesUrl}</p>}
          {available && (
            <div className="update-release" data-testid="available-update">
              <h3>v{available.version} に更新できます</h3>
              <pre>{available.notes || "この更新の説明はありません。"}</pre>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  setConfirm(true);
                  setError("");
                  setProgress(null);
                }}
              >
                <Download size={17} />
                更新する
              </button>
            </div>
          )}
          {message && (
            <p role="status" className="positive">
              {message}
            </p>
          )}
          {error && !confirm && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>更新前のバックアップ</h2>
            <p>
              更新時は自動で作成します。必要なときに手動で保存することもできます。
            </p>
          </div>
        </div>
        <div className="update-content">
          <p>
            バックアップが作成できなかった場合は、インストールを中止します。保存先は家計簿データと同じフォルダー内の
            backups です。
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void backup()}
          >
            今すぐバックアップ
          </button>
          {backupPath && (
            <p className="update-url" data-testid="update-backup-path">
              保存先：{backupPath}
            </p>
          )}
        </div>
      </section>
      {confirm && available && (
        <Modal
          title={`v${available.version} に更新しますか？`}
          onClose={() => setConfirm(false)}
          busy={installing}
        >
          <div className="confirm-body">
            <p>
              署名の確認と家計簿のバックアップ後、アプリを終了して更新します。インストール中は家計簿を操作できません。
            </p>
            {progress && (
              <div role="status">
                <p>{stages[progress.stage]}</p>
                {progress.stage === "download" && (
                  <>
                    <progress max={1} value={fraction} />
                    <p>
                      {fraction === undefined
                        ? `${Math.round(progress.downloaded / 1024)} KB`
                        : `${Math.round(fraction * 100)}%`}
                    </p>
                  </>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <div className="button-group justify-end">
              <button
                className="button secondary"
                disabled={installing}
                onClick={() => setConfirm(false)}
              >
                キャンセル
              </button>
              <button
                className="button primary"
                disabled={installing}
                onClick={() => void install()}
              >
                {installing ? "更新中…" : "バックアップして更新"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
