-- Company master — stores just the name (used as a suggestion source for the
-- document "ชื่อบริษัท" field; documents still store the name as free text).
CREATE TABLE IF NOT EXISTS companies (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) UNIQUE NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
