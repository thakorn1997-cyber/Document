-- App-wide settings (key/value)
CREATE TABLE IF NOT EXISTS app_settings (
    key        VARCHAR(64) PRIMARY KEY,
    value_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- Default: non-admin users see Dashboard + Document
INSERT INTO app_settings (key, value_json) VALUES
    ('menu_visibility', '{"dashboard": true, "document": true}')
ON CONFLICT (key) DO NOTHING;
