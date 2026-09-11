use crate::{db::sql_error, routines};
use chrono::{Datelike, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashSet},
    io::Read,
    time::Duration,
};

pub const SOURCE_URL: &str = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";
#[cfg(test)]
#[path = "holidays_tests.rs"]
mod tests;
const MAX_BYTES: u64 = 512 * 1024;

#[derive(Debug, Serialize)]
pub struct Holiday {
    pub date: String,
    pub name: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HolidayInfo {
    pub fetched_at: Option<String>,
    pub first_year: Option<i32>,
    pub last_year: Option<i32>,
    pub count: usize,
}
#[derive(Serialize)]
pub struct Calendar {
    pub info: HolidayInfo,
    pub holidays: Vec<Holiday>,
}

pub fn list(connection: &Connection) -> Result<Vec<Holiday>, String> {
    let mut query = connection
        .prepare("SELECT date, name FROM holidays ORDER BY date")
        .map_err(sql_error)?;
    let rows = query
        .query_map([], |r| {
            Ok(Holiday {
                date: r.get(0)?,
                name: r.get(1)?,
            })
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(rows)
}
pub fn date_set(connection: &Connection) -> Result<HashSet<NaiveDate>, String> {
    list(connection)?
        .into_iter()
        .map(|h| {
            NaiveDate::parse_from_str(&h.date, "%Y-%m-%d")
                .map_err(|_| "保存済みの祝日データが不正です。".into())
        })
        .collect()
}
pub fn info(connection: &Connection) -> Result<HolidayInfo, String> {
    let fetched_at = connection
        .query_row(
            "SELECT fetched_at FROM holiday_metadata WHERE id=1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(sql_error)?;
    let (first_year, last_year, count) = connection.query_row("SELECT CAST(substr(min(date),1,4) AS INTEGER), CAST(substr(max(date),1,4) AS INTEGER), count(*) FROM holidays", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(sql_error)?;
    Ok(HolidayInfo {
        fetched_at,
        first_year,
        last_year,
        count,
    })
}
pub fn calendar(connection: &Connection) -> Result<Calendar, String> {
    Ok(Calendar {
        info: info(connection)?,
        holidays: list(connection)?,
    })
}

pub fn parse_csv(bytes: &[u8]) -> Result<Vec<Holiday>, String> {
    if bytes.len() as u64 > MAX_BYTES {
        return Err("祝日データのサイズが大きすぎます。".into());
    }
    let (text, invalid) = encoding_rs::SHIFT_JIS.decode_without_bom_handling(bytes);
    if invalid {
        return Err("祝日CSVの文字コードを読み取れませんでした。".into());
    }
    let mut reader = csv::Reader::from_reader(text.as_bytes());
    let header = reader
        .headers()
        .map_err(|_| "祝日CSVのヘッダーを読み取れませんでした。")?;
    if header.len() != 2
        || header.get(0) != Some("国民の祝日・休日月日")
        || header.get(1) != Some("国民の祝日・休日名称")
    {
        return Err("取得先のデータ形式が変わっています。保存済みの祝日を維持します。".into());
    }
    let mut result = Vec::new();
    let mut dates = HashSet::new();
    let mut years = BTreeMap::<i32, usize>::new();
    for row in reader.records() {
        let row = row.map_err(|_| "祝日CSVに読み取れない行があります。")?;
        let date = NaiveDate::parse_from_str(row.get(0).unwrap_or(""), "%Y/%m/%d")
            .map_err(|_| "祝日CSVの日付が不正です。")?;
        let name = row.get(1).unwrap_or("").trim();
        if !(1955..=9999).contains(&date.year())
            || name.is_empty()
            || name.chars().count() > 80
            || !dates.insert(date)
        {
            return Err("祝日CSVに不正な内容または重複があります。".into());
        }
        *years.entry(date.year()).or_default() += 1;
        result.push(Holiday {
            date: date.to_string(),
            name: name.into(),
        });
    }
    if result.len() < 100 || years.is_empty() {
        return Err("祝日データが不足しています。保存済みの祝日を維持します。".into());
    }
    let first = *years.keys().next().unwrap();
    let last = *years.keys().next_back().unwrap();
    for year in first..=last {
        if !dates.contains(&NaiveDate::from_ymd_opt(year, 1, 1).unwrap())
            || !dates.contains(&NaiveDate::from_ymd_opt(year, 11, 23).unwrap())
        {
            return Err("祝日CSVが途中で欠けています。保存済みの祝日を維持します。".into());
        }
    }
    result.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(result)
}

pub fn download() -> Result<Vec<Holiday>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("HIBI-Kakeibo holiday-calendar")
        .build()
        .map_err(|e| format!("祝日の取得を開始できませんでした: {e}"))?;
    let response = client.get(SOURCE_URL).send().and_then(|r| r.error_for_status()).map_err(|e| format!("祝日を取得できませんでした。通信を確認して再試行してください。保存済みの祝日は維持されます。 {e}"))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err("祝日の取得先から正常な応答がありませんでした。".into());
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("祝日データの受信に失敗しました: {e}"))?;
    parse_csv(&bytes)
}

pub fn replace(connection: &Connection, rows: &[Holiday]) -> Result<HolidayInfo, String> {
    if rows.is_empty() {
        return Err("祝日データが空です。".into());
    }
    let tx = connection.unchecked_transaction().map_err(sql_error)?;
    let old_dates = date_set(&tx)?;
    let old_info = info(&tx)?;
    let new_dates: HashSet<_> = rows
        .iter()
        .map(|r| {
            NaiveDate::parse_from_str(&r.date, "%Y-%m-%d")
                .map_err(|_| "祝日の日付が不正です。".to_string())
        })
        .collect::<Result<_, _>>()?;
    let first = new_dates.iter().map(|d| d.year()).min().unwrap();
    let last = new_dates.iter().map(|d| d.year()).max().unwrap();
    if old_info.first_year.is_some_and(|y| first > y)
        || old_info.last_year.is_some_and(|y| last < y)
    {
        return Err(
            "取得した祝日の収録期間が短くなっています。保存済みの祝日を維持します。".into(),
        );
    }
    tx.execute("DELETE FROM holidays", []).map_err(sql_error)?;
    for row in rows {
        tx.execute(
            "INSERT INTO holidays(date,name) VALUES (?1,?2)",
            params![row.date, row.name],
        )
        .map_err(sql_error)?;
    }
    tx.execute("INSERT INTO holiday_metadata(id,fetched_at) VALUES (1,?1) ON CONFLICT(id) DO UPDATE SET fetched_at=excluded.fetched_at", [chrono::Utc::now().to_rfc3339()]).map_err(sql_error)?;
    routines::reapply_holidays(&tx, &old_dates, &new_dates)?;
    tx.commit().map_err(sql_error)?;
    info(connection)
}
