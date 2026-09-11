use crate::db::{self, sql_error, Entry, EntryInput};
use chrono::{Datelike, Duration, NaiveDate, Weekday};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[cfg(test)]
#[path = "routines_tests.rs"]
mod tests;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethod {
    pub id: i64,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    #[serde(default = "no_weekend_adjustment")]
    pub weekend_adjustment: String,
    pub id: Option<i64>,
    pub name: String,
    pub mode: String,
    pub amount: i64,
    pub direction: String,
    pub category_id: Option<i64>,
    pub payment_method_id: Option<i64>,
    pub memo: String,
    pub expense_kind: Option<String>,
    pub frequency: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub active: bool,
}

fn no_weekend_adjustment() -> String {
    "none".into()
}

#[cfg(test)]
fn adjusted_date(date: NaiveDate, adjustment: &str) -> Result<NaiveDate, String> {
    adjusted_with_holidays(date, adjustment, &HashSet::new())
}

pub(crate) fn adjusted_with_holidays(
    mut date: NaiveDate,
    adjustment: &str,
    holidays: &HashSet<NaiveDate>,
) -> Result<NaiveDate, String> {
    let step = match adjustment {
        "none" => return Ok(date),
        "previous" => -1,
        "next" => 1,
        _ => return Err("休日の扱いを選択してください。".into()),
    };
    while matches!(date.weekday(), Weekday::Sat | Weekday::Sun) || holidays.contains(&date) {
        date = date
            .checked_add_signed(Duration::days(step))
            .filter(|date| (1900..=9999).contains(&date.year()))
            .ok_or("調整後の日付が登録可能な範囲を超えています。")?;
    }
    Ok(date)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleStatus {
    pub preset_id: i64,
    pub due_date: Option<String>,
    pub next_date: Option<String>,
    pub due_count: usize,
}

pub fn payment_methods(connection: &Connection) -> Result<Vec<PaymentMethod>, String> {
    let mut query = connection
        .prepare("SELECT id, name, is_default FROM payment_methods ORDER BY sort_order, id")
        .map_err(sql_error)?;
    let rows = query
        .query_map([], |r| {
            Ok(PaymentMethod {
                id: r.get(0)?,
                name: r.get(1)?,
                is_default: r.get(2)?,
            })
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(rows)
}

pub fn save_payment_method(
    connection: &Connection,
    id: Option<i64>,
    name: String,
    is_default: bool,
) -> Result<PaymentMethod, String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("支払い方法名は1〜40文字で入力してください。".into());
    }
    let tx = connection.unchecked_transaction().map_err(sql_error)?;
    let existing = tx
        .query_row(
            "SELECT id FROM payment_methods WHERE name = ?1 COLLATE NOCASE",
            [&name],
            |r| r.get::<_, i64>(0),
        )
        .optional()
        .map_err(sql_error)?;
    if existing.is_some() && existing != id {
        return Err("同じ名前の支払い方法がすでにあります。".into());
    }
    if is_default {
        tx.execute("UPDATE payment_methods SET is_default = 0", [])
            .map_err(sql_error)?;
    }
    let id = if let Some(id) = id {
        if tx
            .execute(
                "UPDATE payment_methods SET name = ?1, is_default = ?2 WHERE id = ?3",
                params![name, is_default, id],
            )
            .map_err(sql_error)?
            == 0
        {
            return Err("支払い方法が見つかりません。".into());
        }
        id
    } else {
        tx.execute(
            "INSERT INTO payment_methods(name, is_default, sort_order) SELECT ?1, ?2, COALESCE(MAX(sort_order), -1) + 1 FROM payment_methods",
            params![name, is_default],
        )
        .map_err(sql_error)?;
        tx.last_insert_rowid()
    };
    tx.commit().map_err(sql_error)?;
    Ok(PaymentMethod {
        id,
        name,
        is_default,
    })
}

pub fn delete_payment_method(connection: &Connection, id: i64) -> Result<(), String> {
    if connection
        .execute("DELETE FROM payment_methods WHERE id = ?1", [id])
        .map_err(sql_error)?
        == 0
    {
        return Err("支払い方法が見つかりません。".into());
    }
    Ok(())
}

pub fn presets(connection: &Connection) -> Result<Vec<Preset>, String> {
    let mut query = connection.prepare("SELECT id, name, mode, amount, direction, category_id, payment_method_id, memo, expense_kind, frequency, start_date, end_date, active, weekend_adjustment FROM presets ORDER BY id").map_err(sql_error)?;
    let rows = query
        .query_map([], |r| {
            Ok(Preset {
                id: r.get(0)?,
                name: r.get(1)?,
                mode: r.get(2)?,
                amount: r.get(3)?,
                direction: r.get(4)?,
                category_id: r.get(5)?,
                payment_method_id: r.get(6)?,
                memo: r.get(7)?,
                expense_kind: r.get(8)?,
                frequency: r.get(9)?,
                start_date: r.get(10)?,
                end_date: r.get(11)?,
                active: r.get(12)?,
                weekend_adjustment: r.get(13)?,
            })
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(rows)
}

fn parse_date(value: &str) -> Result<NaiveDate, String> {
    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "有効な日付を入力してください。")?;
    if value.len() != 10 || date.year() < 1900 || date.format("%Y-%m-%d").to_string() != value {
        return Err("日付は1900年から9999年の範囲で入力してください。".into());
    }
    Ok(date)
}

pub fn save_preset(connection: &Connection, preset: Preset) -> Result<Preset, String> {
    let tx = connection.unchecked_transaction().map_err(sql_error)?;
    let old = presets(&tx)?.into_iter().find(|item| item.id == preset.id);
    let saved = save_preset_inner(&tx, preset)?;
    if let Some(old) = old.filter(|old| old.mode == "recurring" && old.frequency == saved.frequency)
    {
        let holidays = crate::holidays::date_set(&tx)?;
        if old.start_date != saved.start_date {
            reschedule_drafts(&tx, &old, &saved, &holidays)?;
        } else if old.end_date == saved.end_date {
            reconcile_drafts(&tx, &old, &saved, &holidays, &holidays)?;
        }
    }
    tx.commit().map_err(sql_error)?;
    Ok(saved)
}

// A monthly rule owns one occurrence per nominal month, even after its day changes.
// Use the original scheduled period, not the adjusted payment date (which may cross months).
fn period_key(date: NaiveDate, frequency: &str) -> String {
    match frequency {
        "monthly" => date.format("%Y-%m").to_string(),
        "yearly" => date.format("%Y").to_string(),
        "weekly" => format!("{}-{:02}", date.iso_week().year(), date.iso_week().week()),
        _ => date.to_string(),
    }
}

fn period_set(dates: HashSet<String>, frequency: &str) -> Result<HashSet<String>, String> {
    dates
        .into_iter()
        .map(|value| parse_date(&value).map(|date| period_key(date, frequency)))
        .collect()
}

fn target_in_period(preset: &Preset, old_date: NaiveDate) -> Result<Option<NaiveDate>, String> {
    let start = parse_date(preset.start_date.as_deref().ok_or("開始日がありません。")?)?;
    let frequency = preset
        .frequency
        .as_deref()
        .ok_or("繰り返し間隔がありません。")?;
    let index = match frequency {
        "monthly" => i64::from(
            (old_date.year() - start.year()) * 12 + old_date.month() as i32 - start.month() as i32,
        ),
        "yearly" => i64::from(old_date.year() - start.year()),
        "weekly" => {
            let old_monday =
                old_date - Duration::days(i64::from(old_date.weekday().num_days_from_monday()));
            let start_monday =
                start - Duration::days(i64::from(start.weekday().num_days_from_monday()));
            (old_monday - start_monday).num_days() / 7
        }
        _ => return Err("繰り返し間隔が不正です。".into()),
    };
    if index < 0 {
        return Ok(None);
    }
    Ok(
        occurrence_date(start, frequency, index as u32).filter(|date| {
            !preset
                .end_date
                .as_deref()
                .is_some_and(|end| date.to_string().as_str() > end)
        }),
    )
}

fn reschedule_drafts(
    connection: &Connection,
    old: &Preset,
    saved: &Preset,
    holidays: &HashSet<NaiveDate>,
) -> Result<(), String> {
    let mut query = connection.prepare("SELECT e.id, o.scheduled_date FROM entries e JOIN preset_occurrences o ON e.id=o.entry_id WHERE o.preset_id=?1 AND e.status='draft'").map_err(sql_error)?;
    let rows = query
        .query_map([saved.id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    for (id, original) in rows {
        let original_date = parse_date(&original)?;
        let Some(target) = target_in_period(saved, original_date)? else {
            continue;
        };
        let target = target.to_string();
        if target != original {
            let occupied: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM preset_occurrences WHERE preset_id=?1 AND scheduled_date=?2)", params![saved.id,target], |r| r.get(0)).map_err(sql_error)?;
            if occupied {
                return Err("同じ期間に別の予定があるため変更を保存できません。月ごとの収支で重複を確認してください。".into());
            }
        }
        let entry = db::get_entry(connection, id)?;
        let old_memo = if old.memo.is_empty() {
            &old.name
        } else {
            &old.memo
        };
        let untouched = entry.amount == old.amount
            && entry.direction == old.direction
            && entry.category_id == old.category_id
            && entry.payment_method_id == old.payment_method_id
            && entry.memo == *old_memo
            && entry.expense_kind == old.expense_kind
            && entry.date
                == adjusted_with_holidays(original_date, &old.weekend_adjustment, holidays)?
                    .to_string();
        if untouched {
            db::save_entry(
                connection,
                EntryInput {
                    id: Some(id),
                    date: adjusted_with_holidays(
                        parse_date(&target)?,
                        &saved.weekend_adjustment,
                        holidays,
                    )?
                    .to_string(),
                    amount: saved.amount,
                    direction: saved.direction.clone(),
                    category_id: saved.category_id,
                    payment_method_id: saved.payment_method_id,
                    memo: if saved.memo.is_empty() {
                        saved.name.clone()
                    } else {
                        saved.memo.clone()
                    },
                    expense_kind: saved.expense_kind.clone(),
                    status: "draft".into(),
                },
            )?;
        }
        // An individually edited draft keeps its contents while reserving the new scheduled date.
        connection.execute("UPDATE preset_occurrences SET scheduled_date=?1 WHERE preset_id=?2 AND scheduled_date=?3", params![target,saved.id,original]).map_err(sql_error)?;
    }
    Ok(())
}

fn reconcile_drafts(
    connection: &Connection,
    old: &Preset,
    saved: &Preset,
    old_holidays: &HashSet<NaiveDate>,
    new_holidays: &HashSet<NaiveDate>,
) -> Result<(), String> {
    let old_memo = if old.memo.is_empty() {
        &old.name
    } else {
        &old.memo
    };
    let new_memo = if saved.memo.is_empty() {
        &saved.name
    } else {
        &saved.memo
    };
    // Preserve individually edited drafts and all confirmed entries.
    let mut query = connection.prepare("SELECT e.id, e.date, o.scheduled_date FROM entries e JOIN preset_occurrences o ON o.entry_id=e.id WHERE e.status='draft' AND e.amount=?1 AND e.direction=?2 AND e.category_id IS ?3 AND e.payment_method_id IS ?4 AND e.memo=?5 AND e.expense_kind IS ?6 AND o.preset_id=?7").map_err(sql_error)?;
    let candidates = query
        .query_map(
            params![
                old.amount,
                old.direction,
                old.category_id,
                old.payment_method_id,
                old_memo,
                old.expense_kind,
                saved.id
            ],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    for (id, current_date, scheduled_date) in candidates {
        let anchor = parse_date(&scheduled_date)?;
        if current_date
            == adjusted_with_holidays(anchor, &old.weekend_adjustment, old_holidays)?.to_string()
        {
            let date = adjusted_with_holidays(anchor, &saved.weekend_adjustment, new_holidays)?
                .to_string();
            connection.execute("UPDATE entries SET amount=?1, direction=?2, category_id=?3, payment_method_id=?4, memo=?5, expense_kind=?6, date=?7 WHERE id=?8", params![saved.amount, saved.direction, saved.category_id, saved.payment_method_id, new_memo, saved.expense_kind, date, id]).map_err(sql_error)?;
        }
    }
    Ok(())
}

pub fn reapply_holidays(
    connection: &Connection,
    old_holidays: &HashSet<NaiveDate>,
    new_holidays: &HashSet<NaiveDate>,
) -> Result<(), String> {
    for preset in presets(connection)?
        .into_iter()
        .filter(|p| p.mode == "recurring" && p.weekend_adjustment != "none")
    {
        reconcile_drafts(connection, &preset, &preset, old_holidays, new_holidays)?;
    }
    Ok(())
}

fn save_preset_inner(connection: &Connection, mut preset: Preset) -> Result<Preset, String> {
    let holidays = crate::holidays::date_set(connection)?;
    preset.name = preset.name.trim().to_string();
    if preset.name.is_empty() || preset.name.chars().count() > 40 {
        return Err("名前は1〜40文字で入力してください。".into());
    }
    match preset.mode.as_str() {
        "quick" => {
            preset.weekend_adjustment = "none".into();
            preset.frequency = None;
            preset.start_date = None;
            preset.end_date = None;
        }
        "recurring" => {
            if !matches!(
                preset.frequency.as_deref(),
                Some("weekly" | "monthly" | "yearly")
            ) {
                return Err("繰り返し間隔を選択してください。".into());
            }
            let start = parse_date(
                preset
                    .start_date
                    .as_deref()
                    .ok_or("開始日を入力してください。")?,
            )?;
            adjusted_with_holidays(start, &preset.weekend_adjustment, &holidays)?;
            if let Some(end) = &preset.end_date {
                if parse_date(end)? < start {
                    return Err("終了日は開始日以降にしてください。".into());
                }
            }
        }
        _ => return Err("有効なテンプレートの種類を選択してください。".into()),
    }
    let mut input = EntryInput {
        id: None,
        date: preset
            .start_date
            .clone()
            .unwrap_or_else(|| "2000-01-01".into()),
        amount: preset.amount,
        direction: preset.direction.clone(),
        category_id: preset.category_id,
        payment_method_id: preset.payment_method_id,
        memo: preset.memo.clone(),
        expense_kind: preset.expense_kind.clone(),
        status: "draft".into(),
    };
    db::validate_entry(connection, &mut input)?;
    preset.memo = input.memo;
    preset.expense_kind = input.expense_kind;
    if let Some(id) = preset.id {
        let old_mode: Option<String> = connection
            .query_row("SELECT mode FROM presets WHERE id = ?1", [id], |r| r.get(0))
            .optional()
            .map_err(sql_error)?;
        if old_mode.as_deref() != Some(&preset.mode) {
            return Err("設定が見つからないか、種類が変更されています。".into());
        }
        connection.execute("UPDATE presets SET name=?1, mode=?2, amount=?3, direction=?4, category_id=?5, payment_method_id=?6, memo=?7, expense_kind=?8, frequency=?9, start_date=?10, end_date=?11, active=?12 WHERE id=?13", params![preset.name, preset.mode, preset.amount, preset.direction, preset.category_id, preset.payment_method_id, preset.memo, preset.expense_kind, preset.frequency, preset.start_date, preset.end_date, preset.active, id]).map_err(sql_error)?;
    } else {
        connection.execute("INSERT INTO presets(name, mode, amount, direction, category_id, payment_method_id, memo, expense_kind, frequency, start_date, end_date, active) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)", params![preset.name, preset.mode, preset.amount, preset.direction, preset.category_id, preset.payment_method_id, preset.memo, preset.expense_kind, preset.frequency, preset.start_date, preset.end_date, preset.active]).map_err(sql_error)?;
        preset.id = Some(connection.last_insert_rowid());
    }
    connection
        .execute(
            "UPDATE presets SET weekend_adjustment=?1 WHERE id=?2",
            params![preset.weekend_adjustment, preset.id],
        )
        .map_err(sql_error)?;
    Ok(preset)
}

pub fn delete_preset(connection: &Connection, id: i64) -> Result<(), String> {
    if connection
        .execute("DELETE FROM presets WHERE id = ?1", [id])
        .map_err(sql_error)?
        == 0
    {
        return Err("設定が見つかりません。".into());
    }
    Ok(())
}

// Always calculate from the original anchor. Jan 31 -> Feb 28 -> Mar 31.
fn occurrence_date(start: NaiveDate, frequency: &str, index: u32) -> Option<NaiveDate> {
    if frequency == "weekly" {
        return start
            .checked_add_signed(Duration::days(i64::from(index) * 7))
            .filter(|date| date.year() <= 9999);
    }
    let months = match frequency {
        "monthly" => index,
        "yearly" => index.checked_mul(12)?,
        _ => return None,
    };
    let absolute_month = start.year() as u32 * 12 + start.month0() + months;
    let year = (absolute_month / 12) as i32;
    if year > 9999 {
        return None;
    }
    let month = absolute_month % 12 + 1;
    (1..=start.day())
        .rev()
        .find_map(|day| NaiveDate::from_ymd_opt(year, month, day))
}

pub fn schedules(connection: &Connection, today: NaiveDate) -> Result<Vec<ScheduleStatus>, String> {
    let holidays = crate::holidays::date_set(connection)?;
    let mut result = Vec::new();
    for preset in presets(connection)?
        .into_iter()
        .filter(|preset| preset.mode == "recurring")
    {
        let id = preset.id.ok_or("定期設定のIDがありません。")?;
        let mut status = ScheduleStatus {
            preset_id: id,
            due_date: None,
            next_date: None,
            due_count: 0,
        };
        if preset.active {
            let start = parse_date(preset.start_date.as_deref().ok_or("開始日がありません。")?)?;
            let end = preset.end_date.as_deref().map(parse_date).transpose()?;
            let mut query = connection
                .prepare("SELECT o.scheduled_date FROM preset_occurrences o LEFT JOIN entries e ON e.id=o.entry_id WHERE o.preset_id = ?1 AND (e.id IS NULL OR e.status='confirmed')")
                .map_err(sql_error)?;
            let completed = query
                .query_map([id], |r| r.get::<_, String>(0))
                .map_err(sql_error)?
                .collect::<Result<HashSet<_>, _>>()
                .map_err(sql_error)?;
            let mut index = 0;
            let completed = period_set(completed, preset.frequency.as_deref().unwrap_or(""))?;
            while let Some(date) =
                occurrence_date(start, preset.frequency.as_deref().unwrap_or(""), index)
            {
                if end.is_some_and(|end| date > end) {
                    break;
                }
                let adjusted = adjusted_with_holidays(date, &preset.weekend_adjustment, &holidays)?;
                if !completed.contains(&period_key(date, preset.frequency.as_deref().unwrap_or("")))
                {
                    if adjusted > today {
                        status.next_date = Some(adjusted.to_string());
                        break;
                    }
                    if status.due_date.is_none() {
                        status.due_date = Some(adjusted.to_string());
                    }
                    status.due_count += 1;
                }
                index += 1;
            }
        }
        result.push(status);
    }
    Ok(result)
}

fn validate_occurrence(
    connection: &Connection,
    preset_id: i64,
    scheduled_date: &str,
    _today: NaiveDate,
) -> Result<(), String> {
    let date = parse_date(scheduled_date)?;
    let preset = presets(connection)?
        .into_iter()
        .find(|preset| preset.id == Some(preset_id) && preset.mode == "recurring" && preset.active)
        .ok_or("有効な定期設定が見つかりません。")?;
    let start = parse_date(preset.start_date.as_deref().ok_or("開始日がありません。")?)?;
    let index = match preset.frequency.as_deref() {
        Some("weekly") => (date - start).num_days() / 7,
        Some("monthly") => i64::from(
            (date.year() - start.year()) * 12 + date.month() as i32 - start.month() as i32,
        ),
        Some("yearly") => i64::from(date.year() - start.year()),
        _ => return Err("繰り返し設定が不正です。".into()),
    };
    if index < 0
        || occurrence_date(start, preset.frequency.as_deref().unwrap(), index as u32) != Some(date)
        || preset
            .end_date
            .as_deref()
            .is_some_and(|end| scheduled_date > end)
    {
        return Err("この日付は定期収支の予定日ではありません。".into());
    }
    let mut query = connection.prepare("SELECT o.scheduled_date FROM preset_occurrences o LEFT JOIN entries e ON e.id=o.entry_id WHERE o.preset_id=?1 AND (o.scheduled_date<>?2 OR e.id IS NULL OR e.status='confirmed')").map_err(sql_error)?;
    let occupied = query
        .query_map(params![preset_id, scheduled_date], |r| {
            r.get::<_, String>(0)
        })
        .map_err(sql_error)?
        .collect::<Result<HashSet<_>, _>>()
        .map_err(sql_error)?;
    if period_set(occupied, preset.frequency.as_deref().unwrap())?
        .contains(&period_key(date, preset.frequency.as_deref().unwrap()))
    {
        return Err("この予定はすでに記録またはスキップされています。".into());
    }
    Ok(())
}

pub fn record_occurrence(
    connection: &Connection,
    preset_id: i64,
    scheduled_date: String,
    mut input: EntryInput,
    today: NaiveDate,
) -> Result<Entry, String> {
    let tx = connection.unchecked_transaction().map_err(sql_error)?;
    validate_occurrence(&tx, preset_id, &scheduled_date, today)?;
    input.id = tx
        .query_row(
            "SELECT entry_id FROM preset_occurrences WHERE preset_id=?1 AND scheduled_date=?2",
            params![preset_id, scheduled_date],
            |r| r.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(sql_error)?
        .flatten();
    let entry = db::save_entry(&tx, input)?;
    tx.execute("INSERT INTO preset_occurrences(preset_id, scheduled_date, entry_id, status) VALUES (?1,?2,?3,'recorded') ON CONFLICT(preset_id,scheduled_date) DO UPDATE SET entry_id=excluded.entry_id", params![preset_id, scheduled_date, entry.id]).map_err(sql_error)?;
    tx.commit().map_err(sql_error)?;
    db::get_entry(connection, entry.id)
}

pub fn skip_occurrence(
    connection: &Connection,
    preset_id: i64,
    scheduled_date: String,
    today: NaiveDate,
) -> Result<(), String> {
    let tx = connection.unchecked_transaction().map_err(sql_error)?;
    validate_occurrence(&tx, preset_id, &scheduled_date, today)?;
    tx.execute("DELETE FROM entries WHERE status='draft' AND id IN (SELECT entry_id FROM preset_occurrences WHERE preset_id=?1 AND scheduled_date=?2)", params![preset_id, scheduled_date]).map_err(sql_error)?;
    tx.execute("INSERT INTO preset_occurrences(preset_id, scheduled_date, status) VALUES (?1,?2,'skipped') ON CONFLICT(preset_id,scheduled_date) DO UPDATE SET status='skipped', entry_id=NULL", params![preset_id, scheduled_date]).map_err(sql_error)?;
    tx.commit().map_err(sql_error)?;
    Ok(())
}

pub fn draft_through(today: NaiveDate) -> NaiveDate {
    let month = today.year() as u32 * 12 + today.month0() + 2;
    NaiveDate::from_ymd_opt((month / 12) as i32, month % 12 + 1, 1)
        .and_then(|date| date.pred_opt())
        .filter(|date| date.year() <= 9999)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(9999, 12, 31).unwrap())
}

pub fn sync_drafts(connection: &Connection, today: NaiveDate) -> Result<(), String> {
    let tx = connection.unchecked_transaction().map_err(sql_error)?;
    let horizon = draft_through(today);
    let holidays = crate::holidays::date_set(&tx)?;
    for preset in presets(&tx)?
        .into_iter()
        .filter(|preset| preset.mode == "recurring" && preset.active)
    {
        let id = preset.id.ok_or("定期設定のIDがありません。")?;
        let start = parse_date(preset.start_date.as_deref().ok_or("開始日がありません。")?)?;
        let end = preset.end_date.as_deref().map(parse_date).transpose()?;
        let mut query = tx
            .prepare("SELECT scheduled_date FROM preset_occurrences WHERE preset_id=?1")
            .map_err(sql_error)?;
        let processed = query
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(sql_error)?
            .collect::<Result<HashSet<_>, _>>()
            .map_err(sql_error)?;
        let mut index = 0;
        let processed = period_set(processed, preset.frequency.as_deref().unwrap_or(""))?;
        while let Some(date) =
            occurrence_date(start, preset.frequency.as_deref().unwrap_or(""), index)
        {
            let adjusted = adjusted_with_holidays(date, &preset.weekend_adjustment, &holidays)?;
            if end.is_some_and(|end| date > end) || (adjusted > horizon && index > 0) {
                break;
            }
            let period = period_key(date, preset.frequency.as_deref().unwrap_or(""));
            let date = date.to_string();
            if !processed.contains(&period) {
                let input = EntryInput {
                    id: None,
                    date: adjusted.to_string(),
                    amount: preset.amount,
                    direction: preset.direction.clone(),
                    category_id: preset.category_id,
                    payment_method_id: preset.payment_method_id,
                    memo: if preset.memo.is_empty() {
                        preset.name.clone()
                    } else {
                        preset.memo.clone()
                    },
                    expense_kind: preset.expense_kind.clone(),
                    status: "draft".into(),
                };
                let entry = db::save_entry(&tx, input)?;
                tx.execute("INSERT INTO preset_occurrences(preset_id,scheduled_date,entry_id,status) VALUES (?1,?2,?3,'recorded')", params![id,date,entry.id]).map_err(sql_error)?;
            }
            index += 1;
        }
    }
    tx.commit().map_err(sql_error)?;
    Ok(())
}
