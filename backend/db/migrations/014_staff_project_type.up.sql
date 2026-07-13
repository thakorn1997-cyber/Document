-- Staff Master (separate from users)
CREATE TABLE IF NOT EXISTS staff_master (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   VARCHAR(64) UNIQUE NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    department_id UUID REFERENCES departments(id),
    position_id   UUID REFERENCES positions(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_dept ON staff_master (department_id);

-- Project Type (Standard / Modify / Add-on) — the "ประเภท" dropdown
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS project_type VARCHAR(16) NOT NULL DEFAULT 'Standard';

-- Owner project now points to staff_master (not users)
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS owner_project_staff_id UUID REFERENCES staff_master(id);

-- Clear old owner_project_user_id (user asked to reset to NULL)
UPDATE documents SET owner_project_user_id = NULL;

-- Revert UAT/UAI status default → 'Pending'
ALTER TABLE documents ALTER COLUMN uat_status SET DEFAULT 'Pending';
ALTER TABLE documents ALTER COLUMN uai_status SET DEFAULT 'Pending';

-- Migrate existing rows (Standard/Modify/Add-on values → Pending)
UPDATE documents SET uat_status = 'Pending'
 WHERE uat_status IN ('Standard', 'Modify', 'Add-on');
UPDATE documents SET uai_status = 'Pending'
 WHERE uai_status IN ('Standard', 'Modify', 'Add-on');
