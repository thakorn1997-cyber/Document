-- Unselected UAT/UAI status must stay unset (NULL, shown as "—"), not default to Pending.
-- Existing rows keep their current values (Pending stays Pending).
ALTER TABLE documents ALTER COLUMN uat_status DROP DEFAULT;
ALTER TABLE documents ALTER COLUMN uat_status DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN uai_status DROP DEFAULT;
ALTER TABLE documents ALTER COLUMN uai_status DROP NOT NULL;
