-- Project-specific fields on documents
ALTER TABLE documents
    ADD COLUMN company_name           VARCHAR(255),
    ADD COLUMN work_order             VARCHAR(64),
    ADD COLUMN owner_project_user_id  UUID REFERENCES users(id),
    ADD COLUMN install_date           DATE,
    ADD COLUMN uat_status             VARCHAR(16) NOT NULL DEFAULT 'Standard',
    ADD COLUMN uat_date               TIMESTAMPTZ,
    ADD COLUMN uai_status             VARCHAR(16) NOT NULL DEFAULT 'Standard',
    ADD COLUMN uai_date               TIMESTAMPTZ,
    ADD COLUMN current_uat_version_no INT NOT NULL DEFAULT 0,
    ADD COLUMN current_uai_version_no INT NOT NULL DEFAULT 0;

CREATE INDEX idx_documents_work_order ON documents (work_order);
CREATE INDEX idx_documents_company    ON documents (company_name);

-- Add kind (UAT/UAI/MAIN) to versions so a document can have separate UAT and UAI files
ALTER TABLE document_versions
    ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'MAIN';

ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS document_versions_document_id_version_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_kind
    ON document_versions (document_id, kind, version_no);
