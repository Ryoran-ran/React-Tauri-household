mod db;
mod holidays;
mod ordering;
mod routines;
mod updates;

use db::{Category, Entry, EntryInput, Snapshot};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Manager, State};

struct Database(Mutex<rusqlite::Connection>, AtomicBool);

fn data_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // Debug integration tests use an isolated database, never the personal ledger.
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("HIBI_TEST_DATA_DIR") {
        return Ok(std::path::PathBuf::from(path));
    }
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn access<T>(
    state: State<'_, Database>,
    operation: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let connection = state.0.lock().map_err(|_| {
        "データベースにアクセスできません。アプリを再起動してください。".to_string()
    })?;
    if state.1.load(Ordering::SeqCst) {
        return Err("アップデート中は収支を変更できません。".into());
    }
    operation(&connection)
}

#[tauri::command]
fn load_holidays(state: State<'_, Database>) -> Result<holidays::Calendar, String> {
    access(state, holidays::calendar)
}

#[tauri::command]
async fn refresh_holidays(state: State<'_, Database>) -> Result<holidays::HolidayInfo, String> {
    let rows = tauri::async_runtime::spawn_blocking(holidays::download)
        .await
        .map_err(|e| format!("祝日の取得処理に失敗しました: {e}"))??;
    access(state, |connection| holidays::replace(connection, &rows))
}

#[tauri::command]
fn load_data(state: State<'_, Database>) -> Result<Snapshot, String> {
    access(state, |connection| {
        routines::sync_drafts(connection, chrono::Local::now().date_naive())?;
        db::snapshot(connection)
    })
}

#[tauri::command]
fn save_entry(state: State<'_, Database>, input: EntryInput) -> Result<Entry, String> {
    access(state, |connection| db::save_entry(connection, input))
}

#[tauri::command]
fn delete_entry(state: State<'_, Database>, id: i64) -> Result<(), String> {
    access(state, |connection| db::delete_entry(connection, id))
}

#[tauri::command]
fn save_category(
    state: State<'_, Database>,
    id: Option<i64>,
    name: String,
) -> Result<Category, String> {
    access(state, |connection| db::save_category(connection, id, name))
}

#[tauri::command]
fn reorder_categories(state: State<'_, Database>, ids: Vec<i64>) -> Result<(), String> {
    access(state, |connection| {
        ordering::reorder(connection, ordering::OrderedList::Categories, ids)
    })
}

#[tauri::command]
fn reorder_payment_methods(state: State<'_, Database>, ids: Vec<i64>) -> Result<(), String> {
    access(state, |connection| {
        ordering::reorder(connection, ordering::OrderedList::PaymentMethods, ids)
    })
}

#[tauri::command]
fn delete_category(state: State<'_, Database>, id: i64) -> Result<(), String> {
    access(state, |connection| db::delete_category(connection, id))
}

#[tauri::command]
fn save_payment_method(
    state: State<'_, Database>,
    id: Option<i64>,
    name: String,
    is_default: bool,
) -> Result<routines::PaymentMethod, String> {
    access(state, |connection| {
        routines::save_payment_method(connection, id, name, is_default)
    })
}
#[tauri::command]
fn delete_payment_method(state: State<'_, Database>, id: i64) -> Result<(), String> {
    access(state, |connection| {
        routines::delete_payment_method(connection, id)
    })
}
#[tauri::command]
fn save_preset(
    state: State<'_, Database>,
    preset: routines::Preset,
) -> Result<routines::Preset, String> {
    access(state, |connection| {
        routines::save_preset(connection, preset)
    })
}
#[tauri::command]
fn delete_preset(state: State<'_, Database>, id: i64) -> Result<(), String> {
    access(state, |connection| routines::delete_preset(connection, id))
}
#[tauri::command]
fn record_occurrence(
    state: State<'_, Database>,
    preset_id: i64,
    scheduled_date: String,
    input: EntryInput,
) -> Result<Entry, String> {
    access(state, |connection| {
        routines::record_occurrence(
            connection,
            preset_id,
            scheduled_date,
            input,
            chrono::Local::now().date_naive(),
        )
    })
}
#[tauri::command]
fn skip_occurrence(
    state: State<'_, Database>,
    preset_id: i64,
    scheduled_date: String,
) -> Result<(), String> {
    access(state, |connection| {
        routines::skip_occurrence(
            connection,
            preset_id,
            scheduled_date,
            chrono::Local::now().date_naive(),
        )
    })
}

#[tauri::command]
fn data_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_directory(&app)?
        .join("kakeibo.sqlite3")
        .to_string_lossy()
        .into_owned())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::Builder::new().build())
        .manage(updates::UpdateState::default())
        .setup(|app| {
            let directory = data_directory(app.handle()).map_err(std::io::Error::other)?;
            std::fs::create_dir_all(&directory)?;
            let connection =
                db::open(&directory.join("kakeibo.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(connection), AtomicBool::new(false)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            updates::update_info,
            updates::check_update,
            updates::install_update,
            updates::create_update_backup,
            updates::open_release_page,
            load_holidays,
            refresh_holidays,
            load_data,
            save_entry,
            delete_entry,
            save_category,
            reorder_categories,
            reorder_payment_methods,
            delete_category,
            save_payment_method,
            delete_payment_method,
            save_preset,
            delete_preset,
            record_occurrence,
            skip_occurrence,
            data_path
        ])
        .run(tauri::generate_context!())
        .expect("家計簿を起動できませんでした");
}
