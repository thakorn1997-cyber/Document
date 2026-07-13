-- Positions (ระดับงาน) master
CREATE TABLE
IF NOT EXISTS positions
(
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid
(),
    code      VARCHAR
(32) UNIQUE NOT NULL,
    name      VARCHAR
(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW
()
);

INSERT INTO positions
    (code, name)
VALUES
    ('DEV', 'Developer'),
    ('PM', 'Project Manager'),
    ('BA', 'Business Analyst'),
    ('QA', 'Quality Assurance'),
    ('MGR', 'Manager'),
    ('OTHER', 'อื่น ๆ')
ON CONFLICT
(code) DO NOTHING;

-- Link user to a position (nullable)
ALTER TABLE users
    ADD COLUMN
IF NOT EXISTS position_id UUID REFERENCES positions
(id);
