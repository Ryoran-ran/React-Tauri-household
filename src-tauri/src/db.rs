use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};

#[derive(Debug, Serialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryInput {
    pub id: Option<i64>,
    pub date: String,
    pub amount: i64,
    pub direction: String,
    pub category_id: Option<i64>,
    pub memo: String,
    pub expense_kind: Option<String>,
    pub payment_method_id: Option<i64>,
    #[serde(default = "confirmed_status")]
    pub status: String,
}

fn confirmed_status() -> String {
    "confirmed".into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: i64,
    pub date: String,
    pub amount: i64,
    pub direction: String,
    pub category_id: Option<i64>,
    pub memo: String,
    pub expense_kind: Option<String>,
    pub payment_method_id: Option<i64>,
    pub status: String,
    pub preset_id: Option<i64>,
    pub scheduled_date: Option<String>,
}

#[derive(Serialize)]
pub struct Snapshot {
    #[serde(rename = "holidayInfo")]
    pub holiday_info: crate::holidays::HolidayInfo,
    pub entries: Vec<Entry>,
    pub categories: Vec<Category>,
    #[serde(rename = "paymentMethods")]
    pub payment_methods: Vec<crate::routines::PaymentMethod>,
    pub presets: Vec<crate::routines::Preset>,
    pub schedules: Vec<crate::routines::ScheduleStatus>,
    #[serde(rename = "draftThrough")]
    pub draft_through: String,
}

pub(crate) fn sql_error(error: rusqlite::Error) -> String {
    format!("データを保存・読み込みできませんでした: {error}")
}

pub fn open(path: &Path) -> Result<Connection, String> {
    let mut connection = Connection::open(path).map_err(sql_error)?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(sql_error)?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
        )
        .map_err(sql_error)?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(sql_error)?;
    if version > 6 {
        return Err(
            "このデータは新しいバージョンのアプリで作成されています。アプリを更新してください。"
                .into(),
        );
    }
    if version == 0 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction.execute_batch(
            "CREATE TABLE categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(length(trim(name)) BETWEEN 1 AND 40)
            );
            CREATE TABLE entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL CHECK(length(date) = 10),
                amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount BETWEEN 1 AND 999999999),
                direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                memo TEXT NOT NULL DEFAULT '' CHECK(length(memo) <= 500),
                expense_kind TEXT,
                CHECK((direction = 'income' AND expense_kind IS NULL) OR
                      (direction = 'expense' AND expense_kind IS NOT NULL AND expense_kind IN ('normal', 'special', 'transfer')))
            );
            CREATE INDEX entries_date ON entries(date);
            CREATE INDEX entries_category ON entries(category_id);
            INSERT INTO categories(name) VALUES ('食費'), ('日用品'), ('住居費'), ('水道・光熱費'), ('通信費'), ('交通費'), ('医療費'), ('娯楽費'), ('給与'), ('副収入'), ('税金'), ('特別支出'), ('投資'), ('貯蓄');
            PRAGMA user_version = 1;"
        ).map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    if version < 2 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(include_str!("migration_v2.sql"))
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    if version < 3 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(include_str!("migration_v3.sql"))
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    if version < 4 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(include_str!("migration_v4.sql"))
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    if version < 5 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(include_str!("migration_v5.sql"))
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    if version < 6 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(include_str!("migration_v6.sql"))
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    Ok(connection)
}

const ENTRY_SELECT: &str = "SELECT e.id, e.date, e.amount, e.direction, e.category_id, e.memo, e.expense_kind, e.payment_method_id, e.status, o.preset_id, o.scheduled_date FROM entries e LEFT JOIN preset_occurrences o ON o.entry_id = e.id";

pub(crate) fn get_entry(connection: &Connection, id: i64) -> Result<Entry, String> {
    connection
        .query_row(
            &format!("{ENTRY_SELECT} WHERE e.id = ?1"),
            [id],
            entry_from_row,
        )
        .map_err(sql_error)
}

fn entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    Ok(Entry {
        id: row.get(0)?,
        date: row.get(1)?,
        amount: row.get(2)?,
        direction: row.get(3)?,
        category_id: row.get(4)?,
        memo: row.get(5)?,
        expense_kind: row.get(6)?,
        payment_method_id: row.get(7)?,
        status: row.get(8)?,
        preset_id: row.get(9)?,
        scheduled_date: row.get(10)?,
    })
}

pub fn snapshot(connection: &Connection) -> Result<Snapshot, String> {
    let mut query = connection
        .prepare(&format!("{ENTRY_SELECT} ORDER BY e.date DESC, e.id DESC"))
        .map_err(sql_error)?;
    let entries = query
        .query_map([], entry_from_row)
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    let mut query = connection
        .prepare("SELECT id, name FROM categories ORDER BY sort_order, id")
        .map_err(sql_error)?;
    let categories = query
        .query_map([], |r| {
            Ok(Category {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(Snapshot {
        holiday_info: crate::holidays::info(connection)?,
        entries,
        categories,
        payment_methods: crate::routines::payment_methods(connection)?,
        presets: crate::routines::presets(connection)?,
        schedules: crate::routines::schedules(connection, chrono::Local::now().date_naive())?,
        draft_through: crate::routines::draft_through(chrono::Local::now().date_naive())
            .to_string(),
    })
}

pub(crate) fn validate_entry(
    connection: &Connection,
    input: &mut EntryInput,
) -> Result<(), String> {
    if !matches!(input.status.as_str(), "draft" | "confirmed") {
        return Err("仮入力または確定を選択してください。".into());
    }
    let date = NaiveDate::parse_from_str(&input.date, "%Y-%m-%d")
        .map_err(|_| "有効な日付を入力してください。")?;
    if date.format("%Y-%m-%d").to_string() != input.date
        || input.date < "1900-01-01".to_string()
        || input.date.len() != 10
    {
        return Err("日付は1900年から9999年の範囲で入力してください。".into());
    }
    if !(1..=999_999_999).contains(&input.amount) {
        return Err("金額は1〜999,999,999円の整数で入力してください。".into());
    }
    match input.direction.as_str() {
        "income" => input.expense_kind = None,
        "expense"
            if matches!(
                input.expense_kind.as_deref(),
                Some("normal" | "special" | "transfer")
            ) =>
        {
            ()
        }
        _ => return Err("収入・支出と支出の種類を選択してください。".into()),
    }
    input.memo = input.memo.trim().to_string();
    if input.memo.chars().count() > 500 {
        return Err("メモは500文字以内で入力してください。".into());
    }
    if let Some(id) = input.category_id {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(sql_error)?;
        if !exists {
            return Err("カテゴリが見つかりません。選択し直してください。".into());
        }
    }
    if let Some(id) = input.payment_method_id {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM payment_methods WHERE id = ?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(sql_error)?;
        if !exists {
            return Err("支払い方法が見つかりません。選択し直してください。".into());
        }
    }
    Ok(())
}

pub fn save_entry(connection: &Connection, mut input: EntryInput) -> Result<Entry, String> {
    validate_entry(connection, &mut input)?;
    let arguments = params![
        input.date,
        input.amount,
        input.direction,
        input.category_id,
        input.memo,
        input.expense_kind,
        input.payment_method_id,
        input.status
    ];
    let id = if let Some(id) = input.id {
        let changed = connection.execute("UPDATE entries SET date = ?1, amount = ?2, direction = ?3, category_id = ?4, memo = ?5, expense_kind = ?6, payment_method_id = ?7, status = ?8 WHERE id = ?9", params![input.date, input.amount, input.direction, input.category_id, input.memo, input.expense_kind, input.payment_method_id, input.status, id]).map_err(sql_error)?;
        if changed == 0 {
            return Err("編集する記録が見つかりません。".into());
        }
        id
    } else {
        connection.execute("INSERT INTO entries(date, amount, direction, category_id, memo, expense_kind, payment_method_id, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", arguments).map_err(sql_error)?;
        connection.last_insert_rowid()
    };
    get_entry(connection, id)
}

pub fn delete_entry(connection: &Connection, id: i64) -> Result<(), String> {
    if connection
        .execute("DELETE FROM entries WHERE id = ?1", [id])
        .map_err(sql_error)?
        == 0
    {
        return Err("削除する記録が見つかりません。".into());
    }
    Ok(())
}

pub fn save_category(
    connection: &Connection,
    id: Option<i64>,
    name: String,
) -> Result<Category, String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("カテゴリ名は1〜40文字で入力してください。".into());
    }
    let existing = connection
        .query_row(
            "SELECT id FROM categories WHERE name = ?1 COLLATE NOCASE",
            [&name],
            |r| r.get::<_, i64>(0),
        )
        .optional()
        .map_err(sql_error)?;
    if existing.is_some() && existing != id {
        return Err("同じ名前のカテゴリがすでにあります。".into());
    }
    let id = if let Some(id) = id {
        if connection
            .execute(
                "UPDATE categories SET name = ?1 WHERE id = ?2",
                params![name, id],
            )
            .map_err(sql_error)?
            == 0
        {
            return Err("編集するカテゴリが見つかりません。".into());
        }
        id
    } else {
        connection
            .execute("INSERT INTO categories(name, sort_order) SELECT ?1, COALESCE(MAX(sort_order), -1) + 1 FROM categories", [&name])
            .map_err(sql_error)?;
        connection.last_insert_rowid()
    };
    Ok(Category { id, name })
}

pub fn delete_category(connection: &Connection, id: i64) -> Result<(), String> {
    if connection
        .execute("DELETE FROM categories WHERE id = ?1", [id])
        .map_err(sql_error)?
        == 0
    {
        return Err("削除するカテゴリが見つかりません。".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> EntryInput {
        EntryInput {
            id: None,
            date: "2026-09-01".into(),
            amount: 65000,
            direction: "expense".into(),
            category_id: Some(13),
            memo: "証券口座へ".into(),
            expense_kind: Some("transfer".into()),
            payment_method_id: None,
            status: "confirmed".into(),
        }
    }

    #[test]
    fn persistence_edit_delete_and_no_reseeding() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("test.sqlite3");
        let connection = open(&path).unwrap();
        let entry = save_entry(&connection, input()).unwrap();
        drop(connection);
        let connection = open(&path).unwrap();
        let data = snapshot(&connection).unwrap();
        assert_eq!(data.entries[0].amount, 65000);
        assert_eq!(data.entries[0].expense_kind.as_deref(), Some("transfer"));
        assert_eq!(data.categories.len(), 14);
        let mut edited = input();
        edited.id = Some(entry.id);
        edited.amount = 70000;
        edited.direction = "income".into();
        assert!(save_entry(&connection, edited)
            .unwrap()
            .expense_kind
            .is_none());
        delete_entry(&connection, entry.id).unwrap();
        assert!(snapshot(&connection).unwrap().entries.is_empty());
        assert!(delete_entry(&connection, entry.id).is_err());
        delete_category(&connection, 1).unwrap();
        drop(connection);
        let connection = open(&path).unwrap();
        assert_eq!(snapshot(&connection).unwrap().categories.len(), 13);
    }

    #[test]
    fn deleting_category_preserves_entries_and_amounts() {
        let connection = open(Path::new(":memory:")).unwrap();
        save_entry(&connection, input()).unwrap();
        delete_category(&connection, 13).unwrap();
        let data = snapshot(&connection).unwrap();
        assert_eq!(data.entries.len(), 1);
        assert_eq!(data.entries[0].amount, 65000);
        assert!(data.entries[0].category_id.is_none());
    }

    #[test]
    fn validates_dates_amounts_kinds_and_categories() {
        let connection = open(Path::new(":memory:")).unwrap();
        for date in [
            "2025-02-29",
            "2026-13-01",
            "2026-9-1",
            "1899-12-31",
            "invalid",
        ] {
            let mut value = input();
            value.date = date.into();
            assert!(save_entry(&connection, value).is_err(), "{date}");
        }
        for amount in [0, -1, 1_000_000_000] {
            let mut value = input();
            value.amount = amount;
            assert!(save_entry(&connection, value).is_err());
        }
        let mut value = input();
        value.expense_kind = None;
        assert!(save_entry(&connection, value).is_err());
        let mut value = input();
        value.expense_kind = Some("other".into());
        assert!(save_entry(&connection, value).is_err());
        let mut value = input();
        value.category_id = Some(900);
        assert!(save_entry(&connection, value).is_err());
        let mut value = input();
        value.id = Some(999);
        assert!(save_entry(&connection, value).is_err());
        assert!(save_category(&connection, None, " 食費 ".into()).is_err());
        assert!(save_category(&connection, None, " ".into()).is_err());
        assert!(save_category(&connection, Some(999), "新規".into()).is_err());
        let category = save_category(&connection, None, "学習費".into()).unwrap();
        assert_eq!(
            save_category(&connection, Some(category.id), " 書籍 ".into())
                .unwrap()
                .name,
            "書籍"
        );
        let mut leap_day = input();
        leap_day.date = "2024-02-29".into();
        assert!(save_entry(&connection, leap_day).is_ok());
    }
}
