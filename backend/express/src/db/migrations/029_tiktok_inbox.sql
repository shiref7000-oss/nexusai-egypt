-- 029_tiktok_inbox.sql
-- TikTok DM Inbox MVP — conversations and messages

CREATE TABLE IF NOT EXISTS tiktok_conversations (
    id SERIAL PRIMARY KEY,
    tiktok_user_id TEXT NOT NULL,
    tiktok_username TEXT NOT NULL,
    tiktok_avatar_url TEXT,
    last_message_text TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_conv_user_id ON tiktok_conversations(tiktok_user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_conv_status ON tiktok_conversations(status);
CREATE INDEX IF NOT EXISTS idx_tiktok_conv_last_msg ON tiktok_conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS tiktok_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES tiktok_conversations(id) ON DELETE CASCADE,
    tiktok_message_id TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    ai_suggestion TEXT,
    ai_suggestion_approved BOOLEAN,
    approved_by INTEGER REFERENCES users(id),
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_msg_tiktok_id ON tiktok_messages(tiktok_message_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_msg_conv_id ON tiktok_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_msg_direction ON tiktok_messages(direction);
CREATE INDEX IF NOT EXISTS idx_tiktok_msg_created ON tiktok_messages(created_at DESC);

-- Worker state table for tracking ingestion progress
CREATE TABLE IF NOT EXISTS tiktok_worker_state (
    id SERIAL PRIMARY KEY,
    last_poll_at TIMESTAMP WITH TIME ZONE,
    session_valid BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
