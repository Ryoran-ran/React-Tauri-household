use super::*;
use std::path::Path;

fn rule() -> Preset {
    Preset {
        weekend_adjustment: "none".into(),
        id: None,
        name: "家賃".into(),
        mode: "recurring".into(),
        amount: 1000,
        direction: "expense".into(),
        category_id: Some(3),
        payment_method_id: Some(1),
        memo: "毎月の家賃".into(),
        expense_kind: Some("normal".into()),
        frequency: Some("monthly".into()),
        start_date: Some("2026-01-31".into()),
        end_date: None,
        active: true,
    }
}
fn actual(amount: i64) -> EntryInput {
    EntryInput {
        status: "confirmed".into(),
        id: None,
        date: "2026-02-01".into(),
        amount,
        direction: "expense".into(),
        category_id: Some(3),
        payment_method_id: Some(1),
        memo: "今月だけ変更".into(),
        expense_kind: Some("normal".into()),
    }
}
fn date(value: &str) -> NaiveDate {
    parse_date(value).unwrap()
}

#[test]
fn changed_payday_reuses_custom_draft_and_moves_untouched_future_month() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut preset = rule();
    preset.start_date = Some("2026-09-01".into());
    preset.end_date = Some("2026-10-31".into());
    preset.weekend_adjustment = "previous".into();
    let mut preset = save_preset(&connection, preset).unwrap();
    let today = date("2026-09-12");
    sync_drafts(&connection, today).unwrap();
    let september = db::snapshot(&connection)
        .unwrap()
        .entries
        .into_iter()
        .find(|e| e.date == "2026-09-01")
        .unwrap();
    connection
        .execute(
            "UPDATE entries SET date='2026-09-25', amount=1234 WHERE id=?1",
            [september.id],
        )
        .unwrap();
    preset.start_date = Some("2026-09-25".into());
    preset = save_preset(&connection, preset).unwrap();
    for _ in 0..3 {
        sync_drafts(&connection, today).unwrap();
    }
    let entries = db::snapshot(&connection).unwrap().entries;
    assert_eq!(entries.len(), 2);
    let kept = entries.iter().find(|e| e.id == september.id).unwrap();
    assert_eq!(
        (
            kept.date.as_str(),
            kept.amount,
            kept.scheduled_date.as_deref()
        ),
        ("2026-09-25", 1234, Some("2026-09-25"))
    );
    assert!(entries
        .iter()
        .any(|e| e.date == "2026-10-23" && e.scheduled_date.as_deref() == Some("2026-10-25")));
    // Moving the day back and forth must still preserve the edited record and its identity.
    preset.start_date = Some("2026-09-01".into());
    save_preset(&connection, preset).unwrap();
    sync_drafts(&connection, today).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 2);
    assert_eq!(
        db::get_entry(&connection, september.id).unwrap().amount,
        1234
    );
}

#[test]
fn changed_payday_does_not_recreate_confirmed_or_skipped_months() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut preset = rule();
    preset.start_date = Some("2026-09-01".into());
    let mut preset = save_preset(&connection, preset).unwrap();
    let today = date("2026-09-12");
    sync_drafts(&connection, today).unwrap();
    connection
        .execute(
            "UPDATE entries SET status='confirmed' WHERE date='2026-09-01'",
            [],
        )
        .unwrap();
    skip_occurrence(&connection, preset.id.unwrap(), "2026-10-01".into(), today).unwrap();
    preset.start_date = Some("2026-09-25".into());
    save_preset(&connection, preset.clone()).unwrap();
    sync_drafts(&connection, today).unwrap();
    let entries = db::snapshot(&connection).unwrap().entries;
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].date, "2026-09-01");
    assert_eq!(entries[0].status, "confirmed");
    assert_eq!(
        schedules(&connection, today).unwrap()[0]
            .next_date
            .as_deref(),
        Some("2026-11-25")
    );
    assert!(record_occurrence(
        &connection,
        preset.id.unwrap(),
        "2026-09-25".into(),
        actual(1000),
        today
    )
    .is_err());
    assert!(record_occurrence(
        &connection,
        preset.id.unwrap(),
        "2026-10-25".into(),
        actual(1000),
        today
    )
    .is_err());
}

#[test]
fn distinct_nominal_months_can_have_payment_dates_in_the_same_month() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut preset = rule();
    preset.start_date = Some("2026-07-01".into());
    preset.weekend_adjustment = "previous".into();
    save_preset(&connection, preset).unwrap();
    sync_drafts(&connection, date("2026-07-12")).unwrap();
    let entries = db::snapshot(&connection).unwrap().entries;
    assert_eq!(entries.len(), 2);
    assert!(entries.iter().any(|e| e.date == "2026-07-01"));
    assert!(entries
        .iter()
        .any(|e| e.date == "2026-07-31" && e.scheduled_date.as_deref() == Some("2026-08-01")));
}

#[test]
fn conflicting_legacy_drafts_roll_back_rule_change_without_losing_records() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut preset = rule();
    preset.start_date = Some("2026-09-01".into());
    let mut preset = save_preset(&connection, preset).unwrap();
    sync_drafts(&connection, date("2026-09-12")).unwrap();
    let extra = db::save_entry(
        &connection,
        EntryInput {
            status: "draft".into(),
            ..actual(999)
        },
    )
    .unwrap();
    connection.execute("INSERT INTO preset_occurrences(preset_id,scheduled_date,entry_id,status) VALUES (?1,'2026-09-25',?2,'recorded')", params![preset.id,extra.id]).unwrap();
    preset.start_date = Some("2026-09-25".into());
    assert!(save_preset(&connection, preset).is_err());
    assert_eq!(
        presets(&connection).unwrap()[0].start_date.as_deref(),
        Some("2026-09-01")
    );
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 3);
}

#[test]
fn weekends_shift_both_days_without_moving_weekdays() {
    for (original, previous, next) in [
        ("2026-09-12", "2026-09-11", "2026-09-14"),
        ("2026-09-13", "2026-09-11", "2026-09-14"),
        ("2026-09-14", "2026-09-14", "2026-09-14"),
        ("2022-01-01", "2021-12-31", "2022-01-03"),
        ("2022-12-31", "2022-12-30", "2023-01-02"),
    ] {
        assert_eq!(
            adjusted_date(date(original), "previous").unwrap(),
            date(previous)
        );
        assert_eq!(adjusted_date(date(original), "next").unwrap(), date(next));
        assert_eq!(
            adjusted_date(date(original), "none").unwrap(),
            date(original)
        );
    }
    assert!(adjusted_date(date("2026-09-14"), "invalid").is_err());
}

#[test]
fn weekend_settings_update_only_untouched_drafts_and_keep_identity() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut preset = save_preset(&connection, rule()).unwrap();
    let today = date("2026-02-01");
    sync_drafts(&connection, today).unwrap();
    let entries = db::snapshot(&connection).unwrap().entries;
    let january = entries
        .iter()
        .find(|e| e.scheduled_date.as_deref() == Some("2026-01-31"))
        .unwrap();
    let february = entries
        .iter()
        .find(|e| e.scheduled_date.as_deref() == Some("2026-02-28"))
        .unwrap();
    let march = entries
        .iter()
        .find(|e| e.scheduled_date.as_deref() == Some("2026-03-31"))
        .unwrap();
    let mut confirmed = actual(1000);
    confirmed.id = Some(january.id);
    confirmed.date = "2026-01-31".into();
    db::save_entry(&connection, confirmed).unwrap();
    let mut custom = actual(1200);
    custom.id = Some(march.id);
    custom.date = "2026-03-20".into();
    custom.status = "draft".into();
    db::save_entry(&connection, custom).unwrap();
    preset.weekend_adjustment = "next".into();
    save_preset(&connection, preset.clone()).unwrap();
    assert_eq!(
        db::get_entry(&connection, february.id).unwrap().date,
        "2026-03-02"
    );
    assert_eq!(
        db::get_entry(&connection, january.id).unwrap().date,
        "2026-01-31"
    );
    assert_eq!(
        db::get_entry(&connection, march.id).unwrap().date,
        "2026-03-20"
    );
    preset.weekend_adjustment = "previous".into();
    save_preset(&connection, preset).unwrap();
    assert_eq!(
        db::get_entry(&connection, february.id).unwrap().date,
        "2026-02-27"
    );
    sync_drafts(&connection, today).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 3);
    db::delete_entry(&connection, february.id).unwrap();
    sync_drafts(&connection, today).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 2);
}

#[test]
fn adjusted_horizon_and_end_date_use_stable_original_occurrences() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut preset = rule();
    preset.start_date = Some("2025-12-01".into());
    preset.end_date = Some("2026-02-01".into());
    preset.weekend_adjustment = "previous".into();
    save_preset(&connection, preset).unwrap();
    sync_drafts(&connection, date("2025-12-01")).unwrap();
    let entries = db::snapshot(&connection).unwrap().entries;
    assert_eq!(entries.len(), 3);
    assert!(entries
        .iter()
        .any(|e| e.date == "2026-01-30" && e.scheduled_date.as_deref() == Some("2026-02-01")));
    let schedule = schedules(&connection, date("2026-01-29")).unwrap();
    assert_eq!(schedule[0].next_date.as_deref(), Some("2026-01-30"));
    assert_eq!(
        schedules(&connection, date("2026-01-30")).unwrap()[0].due_count,
        3
    );
    sync_drafts(&connection, date("2026-03-01")).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 3);
}

#[test]
fn v3_migration_keeps_dates_and_defaults_to_no_adjustment() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v3.sqlite3");
    let connection = db::open(&path).unwrap();
    save_preset(&connection, rule()).unwrap();
    sync_drafts(&connection, date("2026-01-01")).unwrap();
    connection
        .execute_batch("ALTER TABLE presets DROP COLUMN weekend_adjustment; ALTER TABLE categories DROP COLUMN sort_order; ALTER TABLE payment_methods DROP COLUMN sort_order; DROP TABLE holidays; DROP TABLE holiday_metadata; PRAGMA user_version=3;")
        .unwrap();
    drop(connection);
    let connection = db::open(&path).unwrap();
    let mut preset = presets(&connection).unwrap().remove(0);
    assert_eq!(preset.weekend_adjustment, "none");
    assert!(db::snapshot(&connection)
        .unwrap()
        .entries
        .iter()
        .any(|e| e.date == "2026-01-31"));
    preset.weekend_adjustment = "previous".into();
    save_preset(&connection, preset).unwrap();
    drop(connection);
    let connection = db::open(&path).unwrap();
    assert_eq!(
        presets(&connection).unwrap()[0].weekend_adjustment,
        "previous"
    );
    assert!(db::snapshot(&connection)
        .unwrap()
        .entries
        .iter()
        .any(|e| e.date == "2026-01-30"));
}

#[test]
fn v1_migration_preserves_old_entries_and_does_not_reseed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("old.sqlite3");
    let old = Connection::open(&path).unwrap();
    old.execute_batch("CREATE TABLE categories(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE); CREATE TABLE entries(id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, amount INTEGER NOT NULL, direction TEXT NOT NULL, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, memo TEXT NOT NULL, expense_kind TEXT); INSERT INTO categories VALUES (1,'既存カテゴリ'); INSERT INTO entries VALUES (42,'2026-01-01',65000,'expense',1,'以前の記録','transfer'); PRAGMA user_version=1;").unwrap();
    drop(old);
    let connection = db::open(&path).unwrap();
    let data = db::snapshot(&connection).unwrap();
    assert_eq!(data.entries[0].id, 42);
    assert_eq!(data.entries[0].amount, 65000);
    assert_eq!(data.entries[0].memo, "以前の記録");
    assert_eq!(data.entries[0].status, "confirmed");
    assert_eq!(data.categories[0].name, "既存カテゴリ");
    assert!(data.entries[0].payment_method_id.is_none());
    assert_eq!(data.payment_methods.len(), 5);
    delete_payment_method(&connection, 1).unwrap();
    drop(connection);
    let connection = db::open(&path).unwrap();
    assert_eq!(payment_methods(&connection).unwrap().len(), 4);
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 1);
    assert_eq!(
        connection
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        6
    );
}

#[test]
fn monthly_yearly_and_weekly_dates_keep_the_original_anchor() {
    assert_eq!(
        occurrence_date(date("2026-01-31"), "monthly", 1),
        Some(date("2026-02-28"))
    );
    assert_eq!(
        occurrence_date(date("2026-01-31"), "monthly", 2),
        Some(date("2026-03-31"))
    );
    assert_eq!(
        occurrence_date(date("2024-02-29"), "yearly", 1),
        Some(date("2025-02-28"))
    );
    assert_eq!(
        occurrence_date(date("2024-02-29"), "yearly", 4),
        Some(date("2028-02-29"))
    );
    assert_eq!(
        occurrence_date(date("2026-12-31"), "weekly", 1),
        Some(date("2027-01-07"))
    );
    assert_eq!(occurrence_date(date("9999-12-31"), "monthly", 1), None);
}

#[test]
fn one_time_amount_change_is_atomic_and_never_double_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("recurring.sqlite3");
    let connection = db::open(&path).unwrap();
    let preset = save_preset(&connection, rule()).unwrap();
    let id = preset.id.unwrap();
    let today = date("2026-03-31");
    assert!(db::snapshot(&connection).unwrap().entries.is_empty());
    assert_eq!(schedules(&connection, today).unwrap()[0].due_count, 3);
    let entry =
        record_occurrence(&connection, id, "2026-01-31".into(), actual(1200), today).unwrap();
    assert_eq!(entry.amount, 1200);
    assert_eq!(entry.date, "2026-02-01");
    assert_eq!(presets(&connection).unwrap()[0].amount, 1000);
    assert!(record_occurrence(&connection, id, "2026-01-31".into(), actual(9000), today).is_err());
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 1);
    db::delete_entry(&connection, entry.id).unwrap();
    assert!(record_occurrence(&connection, id, "2026-01-31".into(), actual(9000), today).is_err());
    skip_occurrence(&connection, id, "2026-02-28".into(), today).unwrap();
    assert_eq!(
        schedules(&connection, today).unwrap()[0]
            .due_date
            .as_deref(),
        Some("2026-03-31")
    );
    assert_eq!(
        schedules(&connection, today).unwrap()[0]
            .next_date
            .as_deref(),
        Some("2026-04-30")
    );
    assert!(record_occurrence(&connection, id, "2026-04-30".into(), actual(1000), today).is_ok());
    assert!(record_occurrence(&connection, id, "2026-03-30".into(), actual(1000), today).is_err());
    assert!(record_occurrence(&connection, id, "2026-03-31".into(), actual(0), today).is_err());
    assert_eq!(schedules(&connection, today).unwrap()[0].due_count, 1);
    drop(connection);
    let connection = db::open(&path).unwrap();
    assert_eq!(schedules(&connection, today).unwrap()[0].due_count, 1);
    record_occurrence(&connection, id, "2026-03-31".into(), actual(1300), today).unwrap();
    delete_preset(&connection, id).unwrap();
    assert!(db::snapshot(&connection)
        .unwrap()
        .entries
        .iter()
        .any(|entry| entry.amount == 1300));
}

#[test]
fn drafts_are_persistent_editable_and_confirmable_before_their_date() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("drafts.sqlite3");
    let connection = db::open(&path).unwrap();
    let mut preset = save_preset(&connection, rule()).unwrap();
    let today = date("2026-02-01");
    sync_drafts(&connection, today).unwrap();
    let entries = db::snapshot(&connection).unwrap().entries;
    assert_eq!(entries.len(), 3);
    assert!(entries.iter().all(|entry| entry.status == "draft"));
    let february = entries
        .iter()
        .find(|entry| entry.date == "2026-02-28")
        .unwrap();
    let january = entries
        .iter()
        .find(|entry| entry.date == "2026-01-31")
        .unwrap();
    let mut input = actual(1200);
    input.id = Some(january.id);
    input.date = january.date.clone();
    input.status = "draft".into();
    db::save_entry(&connection, input).unwrap();
    let mut input = actual(1400);
    input.date = february.date.clone();
    let confirmed = record_occurrence(
        &connection,
        preset.id.unwrap(),
        february.date.clone(),
        input,
        today,
    )
    .unwrap();
    assert_eq!(confirmed.id, february.id);
    assert_eq!(confirmed.status, "confirmed");
    preset.amount = 2000;
    save_preset(&connection, preset.clone()).unwrap();
    let entries = db::snapshot(&connection).unwrap().entries;
    assert_eq!(
        entries
            .iter()
            .find(|e| e.date == "2026-03-31")
            .unwrap()
            .amount,
        2000
    );
    assert_eq!(
        entries.iter().find(|e| e.id == january.id).unwrap().amount,
        1200
    );
    assert_eq!(
        entries.iter().find(|e| e.id == february.id).unwrap().amount,
        1400
    );
    db::delete_entry(&connection, january.id).unwrap();
    sync_drafts(&connection, today).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 2);
    drop(connection);
    let connection = db::open(&path).unwrap();
    sync_drafts(&connection, today).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 2);
    preset.active = false;
    save_preset(&connection, preset).unwrap();
    sync_drafts(&connection, date("2026-12-31")).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 2);
}

#[test]
fn first_distant_occurrence_is_available_and_draft_horizon_crosses_years() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut preset = rule();
    preset.start_date = Some("2028-06-30".into());
    save_preset(&connection, preset).unwrap();
    sync_drafts(&connection, date("2026-12-01")).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 1);
    assert_eq!(draft_through(date("2026-12-01")), date("2027-01-31"));
}

#[test]
fn defaults_and_deleted_references_preserve_money() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    save_payment_method(&connection, Some(1), "現金".into(), true).unwrap();
    save_payment_method(&connection, Some(2), "メインカード".into(), true).unwrap();
    assert_eq!(
        payment_methods(&connection)
            .unwrap()
            .iter()
            .filter(|method| method.is_default)
            .count(),
        1
    );
    assert!(save_payment_method(&connection, None, " 現金 ".into(), true).is_err());
    assert!(payment_methods(&connection).unwrap()[1].is_default);
    let mut quick = rule();
    quick.mode = "quick".into();
    let quick = save_preset(&connection, quick).unwrap();
    assert!(quick.start_date.is_none());
    assert!(schedules(&connection, date("2026-03-31"))
        .unwrap()
        .is_empty());
    db::save_entry(&connection, actual(1000)).unwrap();
    delete_payment_method(&connection, 1).unwrap();
    db::delete_category(&connection, 3).unwrap();
    let data = db::snapshot(&connection).unwrap();
    assert!(data.entries[0].payment_method_id.is_none());
    assert!(data.presets[0].payment_method_id.is_none());
    assert!(data.presets[0].category_id.is_none());
    assert_eq!(data.entries[0].amount, 1000);
}

#[test]
fn end_date_pause_and_validation() {
    let connection = db::open(Path::new(":memory:")).unwrap();
    let mut value = rule();
    value.end_date = Some("2026-02-28".into());
    let mut saved = save_preset(&connection, value).unwrap();
    let today = date("2026-03-31");
    assert_eq!(schedules(&connection, today).unwrap()[0].due_count, 2);
    assert!(schedules(&connection, today).unwrap()[0]
        .next_date
        .is_none());
    saved.active = false;
    save_preset(&connection, saved.clone()).unwrap();
    assert_eq!(schedules(&connection, today).unwrap()[0].due_count, 0);
    assert!(record_occurrence(
        &connection,
        saved.id.unwrap(),
        "2026-01-31".into(),
        actual(1000),
        today
    )
    .is_err());
    saved.active = true;
    saved.amount = 2000;
    save_preset(&connection, saved).unwrap();
    assert_eq!(schedules(&connection, today).unwrap()[0].due_count, 2);
    let mut bad = rule();
    bad.start_date = Some("2026-02-30".into());
    assert!(save_preset(&connection, bad).is_err());
    let mut bad = rule();
    bad.end_date = Some("2026-01-01".into());
    assert!(save_preset(&connection, bad).is_err());
    let mut bad = rule();
    bad.payment_method_id = Some(999);
    assert!(save_preset(&connection, bad).is_err());
}
