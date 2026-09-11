ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('draft', 'confirmed'));
CREATE INDEX entries_status ON entries(status);
CREATE INDEX occurrence_entry ON preset_occurrences(entry_id);
PRAGMA user_version = 3;
