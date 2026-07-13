-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Users, Roles, Departments
-- ============================================================

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(64)  UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE departments (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code      VARCHAR(32) UNIQUE NOT NULL,
    name_th   VARCHAR(255) NOT NULL,
    name_en   VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role    VARCHAR(32) NOT NULL,
    PRIMARY KEY (user_id, role)
);

CREATE TABLE user_departments (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, department_id)
);

-- ============================================================
-- Master Data: Document Types
-- ============================================================

CREATE TABLE document_types (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(32) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    require_acknowledge BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_mime_types  TEXT[] NOT NULL DEFAULT ARRAY['application/pdf']::TEXT[],
    max_file_size_mb    INT NOT NULL DEFAULT 20,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- Documents
-- ============================================================

CREATE TABLE documents (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                  VARCHAR(64) UNIQUE NOT NULL,
    title                 VARCHAR(255) NOT NULL,
    document_type_id      UUID NOT NULL REFERENCES document_types(id),
    source_department_id  UUID NOT NULL REFERENCES departments(id),
    owner_user_id         UUID NOT NULL REFERENCES users(id),
    status                VARCHAR(32) NOT NULL DEFAULT 'Draft',
    current_version_no    INT NOT NULL DEFAULT 0,
    due_date              TIMESTAMPTZ,
    note                  TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_source_status ON documents (source_department_id, status, created_at DESC);

CREATE TABLE document_versions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id        UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_no         INT NOT NULL,
    original_file_name VARCHAR(500) NOT NULL,
    stored_file_name   VARCHAR(500) NOT NULL,
    file_path          VARCHAR(1000) NOT NULL,
    file_size_bytes    BIGINT NOT NULL,
    mime_type          VARCHAR(255) NOT NULL,
    sha256             VARCHAR(64) NOT NULL,
    uploaded_by        UUID NOT NULL REFERENCES users(id),
    uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, version_no)
);

CREATE TABLE document_recipients (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_department_id UUID NOT NULL REFERENCES departments(id),
    received_status      VARCHAR(32) NOT NULL DEFAULT 'PendingDownload',
    first_downloaded_at  TIMESTAMPTZ,
    acknowledged_at      TIMESTAMPTZ,
    acknowledged_by      UUID REFERENCES users(id),
    UNIQUE (document_id, target_department_id)
);

CREATE INDEX idx_recipients_target ON document_recipients (target_department_id, received_status);

CREATE TABLE download_logs (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id               UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id                UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    downloaded_by             UUID NOT NULL REFERENCES users(id),
    downloaded_department_id  UUID REFERENCES departments(id),
    downloaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address                VARCHAR(64),
    user_agent                TEXT
);

CREATE INDEX idx_download_logs_doc ON download_logs (document_id, version_id);

CREATE TABLE acknowledgements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id      UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    department_id   UUID NOT NULL REFERENCES departments(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version_id, department_id)
);

-- ============================================================
-- Audit Log
-- ============================================================

CREATE TABLE audit_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id  UUID NOT NULL REFERENCES users(id),
    action         VARCHAR(64) NOT NULL,
    target_type    VARCHAR(64) NOT NULL,
    target_id      VARCHAR(255) NOT NULL,
    detail_json    JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id);

-- ============================================================
-- Refresh Tokens
-- ============================================================

CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id, expires_at);
CREATE UNIQUE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);
