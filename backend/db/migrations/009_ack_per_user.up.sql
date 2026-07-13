-- Per-user acknowledgement (was per-department in old model)
ALTER TABLE acknowledgements DROP CONSTRAINT IF EXISTS acknowledgements_version_id_department_id_key;
ALTER TABLE acknowledgements ALTER COLUMN department_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_acknowledgements_version_user
    ON acknowledgements (version_id, user_id);
CREATE INDEX IF NOT EXISTS idx_acknowledgements_document
    ON acknowledgements (document_id, acknowledged_at DESC);
