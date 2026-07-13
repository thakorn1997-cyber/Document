-- Revert: restore NOT NULL + default 'Pending' (backfilling NULLs first).
UPDATE documents SET uat_status = 'Pending' WHERE uat_status IS NULL;
UPDATE documents SET uai_status = 'Pending' WHERE uai_status IS NULL;
ALTER TABLE documents ALTER COLUMN uat_status SET DEFAULT 'Pending';
ALTER TABLE documents ALTER COLUMN uat_status SET NOT NULL;
ALTER TABLE documents ALTER COLUMN uai_status SET DEFAULT 'Pending';
ALTER TABLE documents ALTER COLUMN uai_status SET NOT NULL;
