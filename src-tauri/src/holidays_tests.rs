use super::*;
use crate::{
    db,
    routines::{self, Preset},
};

fn fixture() -> Vec<Holiday> {
    parse_csv(include_bytes!("../../tests/fixtures/syukujitsu.csv")).unwrap()
}
fn date(value: &str) -> NaiveDate {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
}

#[test]
fn official_csv_decodes_japanese_and_includes_substitute_holidays() {
    let rows = fixture();
    assert!(rows.len() > 1000);
    assert!(rows
        .iter()
        .any(|h| h.date == "2026-09-23" && h.name == "秋分の日"));
    assert!(rows
        .iter()
        .any(|h| h.date == "2026-05-06" && h.name == "休日"));
    assert!(rows
        .iter()
        .any(|h| h.date == "2026-09-22" && h.name == "休日"));
    assert!(parse_csv(b"<html>unavailable</html>").is_err());
    assert!(parse_csv(&include_bytes!("../../tests/fixtures/syukujitsu.csv")[..500]).is_err());
    let mut duplicate = include_bytes!("../../tests/fixtures/syukujitsu.csv").to_vec();
    duplicate.extend_from_slice(b"\r\n2026/1/1,duplicate\r\n");
    assert!(parse_csv(&duplicate).is_err());
}

#[test]
fn calendar_reflows_only_untouched_drafts_and_survives_restarts() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holidays.sqlite3");
    let connection = db::open(&path).unwrap();
    let base = Preset {
        id: None,
        name: "給与".into(),
        mode: "recurring".into(),
        amount: 250000,
        direction: "income".into(),
        category_id: None,
        payment_method_id: None,
        memo: "".into(),
        expense_kind: None,
        frequency: Some("monthly".into()),
        start_date: Some("2026-09-23".into()),
        end_date: Some("2026-09-23".into()),
        active: true,
        weekend_adjustment: "previous".into(),
    };
    for _ in 0..3 {
        routines::save_preset(&connection, base.clone()).unwrap();
    }
    routines::sync_drafts(&connection, date("2026-09-01")).unwrap();
    let rows = db::snapshot(&connection).unwrap().entries;
    let untouched = rows[0].id;
    let confirmed = rows[1].id;
    let custom = rows[2].id;
    connection
        .execute(
            "UPDATE entries SET status='confirmed' WHERE id=?1",
            [confirmed],
        )
        .unwrap();
    connection
        .execute("UPDATE entries SET amount=260000 WHERE id=?1", [custom])
        .unwrap();
    let parsed = fixture();
    let saved = replace(&connection, &parsed).unwrap();
    assert_eq!(saved.last_year, Some(2027));
    assert_eq!(
        db::get_entry(&connection, untouched).unwrap().date,
        "2026-09-18"
    );
    assert_eq!(
        db::get_entry(&connection, confirmed).unwrap().date,
        "2026-09-23"
    );
    assert_eq!(
        db::get_entry(&connection, custom).unwrap().date,
        "2026-09-23"
    );
    replace(&connection, &parsed).unwrap();
    assert_eq!(db::snapshot(&connection).unwrap().entries.len(), 3);
    assert!(replace(&connection, &[]).is_err());
    assert!(replace(
        &connection,
        &[Holiday {
            date: "2026-01-01".into(),
            name: "元日".into()
        }]
    )
    .is_err());
    assert_eq!(info(&connection).unwrap().count, parsed.len());
    drop(connection);
    let connection = db::open(&path).unwrap();
    assert_eq!(info(&connection).unwrap().count, parsed.len());
    assert!(info(&connection).unwrap().fetched_at.is_some());
    assert_eq!(
        db::get_entry(&connection, untouched).unwrap().date,
        "2026-09-18"
    );
    let dates = date_set(&connection).unwrap();
    assert_eq!(
        routines::adjusted_with_holidays(date("2026-09-19"), "next", &dates).unwrap(),
        date("2026-09-24")
    );
    assert_eq!(
        routines::adjusted_with_holidays(date("2026-05-03"), "next", &dates).unwrap(),
        date("2026-05-07")
    );
    assert_eq!(
        routines::adjusted_with_holidays(date("2026-01-01"), "previous", &dates).unwrap(),
        date("2025-12-31")
    );
}
