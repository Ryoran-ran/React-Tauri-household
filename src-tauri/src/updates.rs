use crate::{data_directory, Database};
use rusqlite::{Connection, DatabaseName};
use serde::Serialize;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    busy: AtomicBool,
    pending: Mutex<Option<Update>>,
}

struct BusyGuard<'a>(&'a AtomicBool);
impl<'a> BusyGuard<'a> {
    fn acquire(flag: &'a AtomicBool) -> Result<Self, String> {
        flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "更新処理が実行中です。".to_string())?;
        Ok(Self(flag))
    }
}
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    configured: bool,
    releases_url: String,
}
#[derive(Serialize)]
pub struct AvailableUpdate {
    version: String,
    notes: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    stage: &'static str,
    downloaded: u64,
    total: Option<u64>,
    backup_path: Option<String>,
}

fn config(app: &AppHandle) -> Result<tauri_plugin_updater::Config, String> {
    let value = app
        .config()
        .plugins
        .0
        .get("updater")
        .cloned()
        .ok_or("更新設定がありません。")?;
    let config = serde_json::from_value(value).map_err(|_| "更新設定を読み込めませんでした。")?;
    #[cfg(debug_assertions)]
    if std::env::var_os("HIBI_TEST_DATA_DIR").is_some() {
        if let Ok(path) = std::env::var("HIBI_TEST_UPDATER_CONFIG") {
            let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            let test: tauri_plugin_updater::Config =
                serde_json::from_str(&content).map_err(|e| e.to_string())?;
            if test
                .endpoints
                .iter()
                .all(|url| url.host_str() == Some("127.0.0.1"))
            {
                return Ok(test);
            }
            return Err("テスト更新先はループバックに限定されます。".into());
        }
    }
    Ok(config)
}

#[tauri::command]
pub fn update_info(app: AppHandle) -> Result<UpdateInfo, String> {
    let config = config(&app)?;
    let releases_url = config
        .endpoints
        .first()
        .and_then(|url| url.as_str().strip_suffix("/download/latest.json"))
        .unwrap_or("https://github.com/Ryoran-ran/React-Tauri-household/releases/latest")
        .to_string();
    Ok(UpdateInfo {
        version: app.package_info().version.to_string(),
        configured: !config.pubkey.trim().is_empty() && !config.endpoints.is_empty(),
        releases_url,
    })
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<AvailableUpdate>, String> {
    let state = app.state::<UpdateState>();
    let _busy = BusyGuard::acquire(&state.busy)?;
    *state
        .pending
        .lock()
        .map_err(|_| "更新状態を読み込めませんでした。")? = None;
    let config = config(&app)?;
    if config.pubkey.trim().is_empty() {
        return Err(
            "このビルドは更新の配布準備中です。署名鍵を設定した配布版をインストールしてください。"
                .into(),
        );
    }
    let update = app
        .updater_builder()
        .pubkey(config.pubkey)
        .endpoints(config.endpoints)
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| {
            format!("更新情報を取得できませんでした。通信状態と配布状況をご確認ください。\n{e}")
        })?;
    let result = update.as_ref().map(|update| AvailableUpdate {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
    });
    *state
        .pending
        .lock()
        .map_err(|_| "更新状態を保存できませんでした。")? = update;
    Ok(result)
}

pub fn backup_database(connection: &Connection, directory: &Path) -> Result<String, String> {
    let folder = directory.join("backups");
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("バックアップ先を作成できませんでした: {e}"))?;
    let path = folder.join(format!(
        "before-update-{}.sqlite3",
        chrono::Local::now().format("%Y%m%d-%H%M%S-%f")
    ));
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| format!("バックアップファイルを作成できませんでした: {e}"))?;
    let result = (|| {
        connection
            .backup(DatabaseName::Main, &path, None)
            .map_err(|e| format!("バックアップに失敗しました: {e}"))?;
        let saved = Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
            .map_err(|e| e.to_string())?;
        // Backups are standalone files; do not leave a WAL dependency in the copy.
        saved
            .pragma_update(None, "journal_mode", "DELETE")
            .map_err(|e| format!("バックアップの保存形式を確定できませんでした: {e}"))?;
        let integrity: String = saved
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if integrity != "ok" {
            return Err("バックアップの整合性確認に失敗しました。更新を中止しました。".into());
        }
        Ok(path.to_string_lossy().to_string())
    })();
    if result.is_err() {
        for suffix in ["", "-wal", "-shm", "-journal"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.to_string_lossy()));
        }
    }
    result
}

#[tauri::command]
pub fn create_update_backup(app: AppHandle) -> Result<String, String> {
    let db = app.state::<Database>();
    let connection =
        db.0.lock()
            .map_err(|_| "データベースを開けませんでした。")?;
    if db.1.load(Ordering::SeqCst) {
        return Err("更新処理中です。".into());
    }
    backup_database(&connection, &data_directory(&app)?)
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    version: String,
    on_progress: Channel<Progress>,
) -> Result<String, String> {
    let state = app.state::<UpdateState>();
    let _busy = BusyGuard::acquire(&state.busy)?;
    let mut update = state
        .pending
        .lock()
        .map_err(|_| "更新状態を読み込めませんでした。")?
        .clone()
        .ok_or("先に更新を確認してください。")?;
    if update.version != version {
        return Err("更新内容が変わりました。もう一度確認してください。".into());
    }
    #[cfg(not(debug_assertions))]
    if update.download_url.scheme() != "https" {
        return Err("更新ファイルのURLが不正です。".into());
    }
    let db = app.state::<Database>();
    let guard = {
        let _connection =
            db.0.lock()
                .map_err(|_| "データベースを開けませんでした。")?;
        BusyGuard::acquire(&db.1)?
    };
    let send = |stage, downloaded, total, backup_path| {
        let _ = on_progress.send(Progress {
            stage,
            downloaded,
            total,
            backup_path,
        });
    };
    send("download", 0, None, None);
    update.timeout = Some(Duration::from_secs(300));
    let mut downloaded = 0;
    // Tauri verifies the signature before this future returns any installable bytes.
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                send("download", downloaded, total, None);
            },
            || send("verify", 0, None, None),
        )
        .await
        .map_err(|e| {
            format!("更新ファイルの取得・署名検証に失敗しました。アプリは変更していません。\n{e}")
        })?;
    send("backup", 0, None, None);
    let path = {
        let connection =
            db.0.lock()
                .map_err(|_| "データベースを開けませんでした。")?;
        backup_database(&connection, &data_directory(&app)?)?
    };
    send("install", 0, None, Some(path.clone()));
    #[cfg(debug_assertions)]
    if std::env::var_os("HIBI_TEST_DATA_DIR").is_some()
        && std::env::var("HIBI_TEST_UPDATE_NO_INSTALL").as_deref() == Ok("1")
    {
        drop(guard);
        return Ok(path);
    }
    // Windows launches the installer and exits here. No writes can occur after the backup.
    update
        .install(bytes)
        .map_err(|e| format!("インストーラーを起動できませんでした。バックアップ: {path}\n{e}"))?;
    drop(guard);
    Ok(path)
}

#[tauri::command]
pub fn open_release_page(app: AppHandle) -> Result<(), String> {
    let url = update_info(app.clone())?.releases_url;
    if !url.starts_with("https://github.com/") {
        return Err("配布ページのURLが不正です。".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("配布ページを開けませんでした: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_includes_wal_data_and_preserves_source() {
        let dir = tempfile::tempdir().unwrap();
        let db = crate::db::open(&dir.path().join("ledger.sqlite3")).unwrap();
        db.execute("UPDATE categories SET name='変更後' WHERE id=1", [])
            .unwrap();
        let path = backup_database(&db, dir.path()).unwrap();
        assert_eq!(
            std::fs::read_dir(dir.path().join("backups"))
                .unwrap()
                .count(),
            1
        );
        db.execute("UPDATE categories SET name='その後の変更' WHERE id=1", [])
            .unwrap();
        let saved = Connection::open(path).unwrap();
        assert_eq!(
            saved
                .query_row("SELECT name FROM categories WHERE id=1", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "変更後"
        );
        assert_eq!(
            saved
                .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            6
        );
        assert!(backup_database(&db, dir.path()).is_ok());
        let bad = dir.path().join("not-a-folder");
        std::fs::write(&bad, b"file").unwrap();
        assert!(backup_database(&db, &bad).is_err());
        assert_eq!(
            db.query_row("SELECT name FROM categories WHERE id=1", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "その後の変更"
        );
    }
    #[test]
    fn busy_guard_releases_on_error_and_rejects_reentry() {
        let flag = AtomicBool::new(false);
        let guard = BusyGuard::acquire(&flag).unwrap();
        assert!(BusyGuard::acquire(&flag).is_err());
        drop(guard);
        assert!(BusyGuard::acquire(&flag).is_ok());
    }
}
