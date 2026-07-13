-- Add employee ID (optional, unique when set)
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_id
    ON users (employee_id) WHERE employee_id IS NOT NULL;
