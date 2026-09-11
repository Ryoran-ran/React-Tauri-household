CREATE TABLE payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(length(trim(name)) BETWEEN 1 AND 40),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1))
);
CREATE UNIQUE INDEX payment_default ON payment_methods(is_default) WHERE is_default = 1;
INSERT INTO payment_methods(name) VALUES ('現金'), ('クレジットカード'), ('交通系IC'), ('銀行振込'), ('電子マネー');
ALTER TABLE entries ADD COLUMN payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL;
CREATE INDEX entries_payment_method ON entries(payment_method_id);
CREATE TABLE presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40),
    mode TEXT NOT NULL CHECK(mode IN ('quick', 'recurring')),
    amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount BETWEEN 1 AND 999999999),
    direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    memo TEXT NOT NULL DEFAULT '' CHECK(length(memo) <= 500),
    expense_kind TEXT,
    frequency TEXT CHECK(frequency IN ('weekly', 'monthly', 'yearly')),
    start_date TEXT,
    end_date TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    CHECK((direction = 'income' AND expense_kind IS NULL) OR
          (direction = 'expense' AND expense_kind IS NOT NULL AND expense_kind IN ('normal', 'special', 'transfer'))),
    CHECK((mode = 'quick' AND frequency IS NULL AND start_date IS NULL AND end_date IS NULL) OR
          (mode = 'recurring' AND frequency IS NOT NULL AND start_date IS NOT NULL AND length(start_date) = 10)),
    CHECK(end_date IS NULL OR (length(end_date) = 10 AND end_date >= start_date))
);
CREATE TABLE preset_occurrences (
    preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK(status IN ('recorded', 'skipped')),
    PRIMARY KEY (preset_id, scheduled_date)
);
PRAGMA user_version = 2;
