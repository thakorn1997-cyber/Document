-- Support the global "ORDER BY created_at DESC" list/dashboard queries and the
-- audit-log "recent edits" lookup, which had no covering index.
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_logs (action, target_type, created_at DESC);
