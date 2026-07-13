-- First-come lock: only 1 acknowledgement per document (system-wide, no unack)
-- Step 1: dedup existing rows (keep the earliest per document)
DELETE FROM acknowledgements a1
 USING acknowledgements a2
 WHERE a1.document_id = a2.document_id
   AND (a1.acknowledged_at > a2.acknowledged_at
        OR (a1.acknowledged_at = a2.acknowledged_at AND a1.id > a2.id));

-- Step 2: drop old per-user uniqueness, add per-document uniqueness
DROP INDEX IF EXISTS uq_acknowledgements_version_user;
CREATE UNIQUE INDEX IF NOT EXISTS uq_acknowledgements_document
    ON acknowledgements (document_id);
