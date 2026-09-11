ALTER TABLE presets ADD COLUMN weekend_adjustment TEXT NOT NULL DEFAULT 'none'
    CHECK(weekend_adjustment IN ('none', 'previous', 'next'));
PRAGMA user_version = 4;
