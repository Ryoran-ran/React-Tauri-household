use super::*;
use crate::{db, routines};

fn ids(connection: &Connection, list: &str) -> Vec<i64> {
    connection
        .prepare(&format!("SELECT id FROM {list} ORDER BY sort_order,id"))
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

#[test]
fn v5_migration_reordering_editing_adding_and_reopening_preserve_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("ordering.sqlite3");
    let connection = db::open(&path).unwrap();
    routines::save_payment_method(&connection, Some(2), "メインカード".into(), true).unwrap();
    let entry = db::save_entry(
        &connection,
        db::EntryInput {
            id: None,
            date: "2026-09-12".into(),
            amount: 500,
            direction: "expense".into(),
            category_id: Some(1),
            payment_method_id: Some(2),
            memo: "記録を保持".into(),
            expense_kind: Some("normal".into()),
            status: "confirmed".into(),
        },
    )
    .unwrap();
    connection.execute_batch("ALTER TABLE categories DROP COLUMN sort_order; ALTER TABLE payment_methods DROP COLUMN sort_order; PRAGMA user_version=5;").unwrap();
    drop(connection);
    let connection = db::open(&path).unwrap();
    let original = db::snapshot(&connection).unwrap();
    assert_eq!(
        original.categories.iter().map(|x| x.id).collect::<Vec<_>>(),
        (1..=14).collect::<Vec<_>>()
    );
    assert_eq!(
        original
            .payment_methods
            .iter()
            .map(|x| x.id)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 5]
    );
    let mut categories = ids(&connection, "categories");
    categories.reverse();
    let methods = vec![5, 3, 1, 4, 2];
    reorder(&connection, OrderedList::Categories, categories.clone()).unwrap();
    reorder(&connection, OrderedList::PaymentMethods, methods.clone()).unwrap();
    db::save_category(&connection, Some(1), "食事".into()).unwrap();
    routines::save_payment_method(&connection, Some(2), "カード変更".into(), true).unwrap();
    assert_eq!(ids(&connection, "categories"), categories);
    assert_eq!(ids(&connection, "payment_methods"), methods);
    categories.push(
        db::save_category(&connection, None, "新カテゴリ".into())
            .unwrap()
            .id,
    );
    let mut methods = methods;
    methods.push(
        routines::save_payment_method(&connection, None, "新しい方法".into(), false)
            .unwrap()
            .id,
    );
    db::delete_category(&connection, 13).unwrap();
    categories.retain(|id| *id != 13);
    routines::delete_payment_method(&connection, 4).unwrap();
    methods.retain(|id| *id != 4);
    drop(connection);
    let connection = db::open(&path).unwrap();
    let saved = db::snapshot(&connection).unwrap();
    assert_eq!(
        saved.categories.iter().map(|x| x.id).collect::<Vec<_>>(),
        categories
    );
    assert_eq!(
        saved
            .payment_methods
            .iter()
            .map(|x| x.id)
            .collect::<Vec<_>>(),
        methods
    );
    assert_eq!(
        saved
            .payment_methods
            .iter()
            .find(|x| x.is_default)
            .unwrap()
            .id,
        2
    );
    assert_eq!(format!("{:?}", saved.entries[0]), format!("{:?}", entry));
}

#[test]
fn invalid_or_stale_orders_are_rejected_atomically_for_both_lists() {
    let connection = db::open(std::path::Path::new(":memory:")).unwrap();
    for table in ["categories", "payment_methods"] {
        let original = ids(&connection, table);
        let mut duplicate = original.clone();
        duplicate[0] = duplicate[1];
        let mut unknown = original.clone();
        unknown[0] = 99999;
        for invalid in [vec![], original[1..].to_vec(), duplicate, unknown] {
            let list = if table == "categories" {
                OrderedList::Categories
            } else {
                OrderedList::PaymentMethods
            };
            assert!(reorder(&connection, list, invalid).is_err());
            assert_eq!(ids(&connection, table), original);
        }
    }
}
