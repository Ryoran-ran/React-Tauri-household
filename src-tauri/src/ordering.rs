use crate::db::sql_error;
use rusqlite::{params, Connection};
use std::collections::HashSet;

#[cfg(test)]
#[path = "ordering_tests.rs"]
mod tests;

pub enum OrderedList {
    Categories,
    PaymentMethods,
}

pub fn reorder(connection: &Connection, list: OrderedList, ids: Vec<i64>) -> Result<(), String> {
    // Table names are chosen internally; only IDs come from the UI.
    let table = match list {
        OrderedList::Categories => "categories",
        OrderedList::PaymentMethods => "payment_methods",
    };
    let tx = connection.unchecked_transaction().map_err(sql_error)?;
    let existing = tx
        .prepare(&format!("SELECT id FROM {table}"))
        .map_err(sql_error)?
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(sql_error)?
        .collect::<Result<HashSet<_>, _>>()
        .map_err(sql_error)?;
    let requested: HashSet<_> = ids.iter().copied().collect();
    if requested.len() != ids.len() || requested != existing {
        return Err("一覧が変更されています。画面を開き直してから並び替えてください。".into());
    }
    for (position, id) in ids.into_iter().enumerate() {
        tx.execute(
            &format!("UPDATE {table} SET sort_order=?1 WHERE id=?2"),
            params![position as i64, id],
        )
        .map_err(sql_error)?;
    }
    tx.commit().map_err(sql_error)
}
