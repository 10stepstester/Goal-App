ALTER TABLE subtasks ADD COLUMN proposed_for_daily_at TIMESTAMPTZ NULL;
ALTER TABLE subtasks ADD COLUMN daily_response TEXT NULL;
