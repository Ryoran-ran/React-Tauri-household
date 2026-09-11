CREATE TABLE holidays (date TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE holiday_metadata (id INTEGER PRIMARY KEY CHECK(id=1), fetched_at TEXT NOT NULL);
PRAGMA user_version = 5;
