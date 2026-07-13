CREATE TABLE IF NOT EXISTS notifications (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- recipient
    kind           VARCHAR(32) NOT NULL,                                    -- e.g. 'document_created', 'document_acknowledged'
    document_id    UUID REFERENCES documents(id) ON DELETE CASCADE,
    actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    payload_json   JSONB NOT NULL DEFAULT '{}',
    read_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
    ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;
