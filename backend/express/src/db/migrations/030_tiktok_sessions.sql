-- 030_tiktok_sessions.sql
-- TikTok account connection sessions + audit log

CREATE TABLE IF NOT EXISTS tiktok_sessions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tiktok_username TEXT,
    session_data TEXT NOT NULL,
    cookies JSONB DEFAULT '[]',
    local_storage JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disconnected')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_health_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tiktok_sessions_account ON tiktok_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_sessions_status ON tiktok_sessions(status);

CREATE TABLE IF NOT EXISTS tiktok_audit_log (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES tiktok_sessions(id) ON DELETE SET NULL,
    account_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('connect', 'disconnect', 'reconnect', 'session_expired', 'login_detected', 'session_saved', 'health_check_failed')),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tiktok_audit_session ON tiktok_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_audit_account ON tiktok_audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_audit_event ON tiktok_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_tiktok_audit_created ON tiktok_audit_log(created_at DESC);
