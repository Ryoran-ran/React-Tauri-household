ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE categories SET sort_order = id;
ALTER TABLE payment_methods ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE payment_methods SET sort_order = id;
PRAGMA user_version = 6;
