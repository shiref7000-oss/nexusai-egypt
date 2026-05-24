import { pool } from '../config/db_pg';
import { logger } from '../config/logger';

export interface TikTokConversation {
  id: number;
  tiktok_user_id: string;
  tiktok_username: string;
  tiktok_avatar_url: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TikTokMessage {
  id: number;
  conversation_id: number;
  tiktok_message_id: string | null;
  direction: 'incoming' | 'outgoing';
  content: string;
  read: boolean;
  ai_suggestion: string | null;
  ai_suggestion_approved: boolean | null;
  approved_by: number | null;
  sent: boolean;
  created_at: string;
}

// ── Conversations ──

export async function getOrCreateConversation(
  tiktokUserId: string,
  tiktokUsername: string,
  tiktokAvatarUrl?: string
): Promise<TikTokConversation> {
  const result = await pool.query<TikTokConversation>(
    `INSERT INTO tiktok_conversations (tiktok_user_id, tiktok_username, tiktok_avatar_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (tiktok_user_id) DO UPDATE SET
       tiktok_username = EXCLUDED.tiktok_username,
       tiktok_avatar_url = COALESCE(EXCLUDED.tiktok_avatar_url, tiktok_conversations.tiktok_avatar_url),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [tiktokUserId, tiktokUsername, tiktokAvatarUrl || null]
  );
  return result.rows[0];
}

export async function updateConversationLastMessage(
  conversationId: number,
  text: string,
  incrementUnread: boolean = false
): Promise<void> {
  await pool.query(
    `UPDATE tiktok_conversations
     SET last_message_text = $1,
         last_message_at = CURRENT_TIMESTAMP,
         unread_count = CASE WHEN $2 THEN unread_count + 1 ELSE unread_count END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [text, incrementUnread, conversationId]
  );
}

export async function getConversations(): Promise<TikTokConversation[]> {
  const result = await pool.query<TikTokConversation>(
    `SELECT * FROM tiktok_conversations
     WHERE status = 'active'
     ORDER BY last_message_at DESC NULLS LAST`
  );
  return result.rows;
}

export async function markConversationRead(conversationId: number): Promise<void> {
  await pool.query(
    `UPDATE tiktok_conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [conversationId]
  );
}

// ── Messages ──

export async function insertMessage(
  conversationId: number,
  direction: 'incoming' | 'outgoing',
  content: string,
  tiktokMessageId?: string
): Promise<TikTokMessage> {
  const result = await pool.query<TikTokMessage>(
    `INSERT INTO tiktok_messages (conversation_id, tiktok_message_id, direction, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tiktok_message_id) DO NOTHING
     RETURNING *`,
    [conversationId, tiktokMessageId || null, direction, content]
  );
  return result.rows[0] || (await getMessageByTikTokId(tiktokMessageId!))!;
}

async function getMessageByTikTokId(tiktokMessageId: string): Promise<TikTokMessage | null> {
  const result = await pool.query<TikTokMessage>(
    `SELECT * FROM tiktok_messages WHERE tiktok_message_id = $1`,
    [tiktokMessageId]
  );
  return result.rows[0] || null;
}

export async function getMessages(conversationId: number): Promise<TikTokMessage[]> {
  const result = await pool.query<TikTokMessage>(
    `SELECT * FROM tiktok_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );
  return result.rows;
}

export async function markMessageRead(messageId: number): Promise<void> {
  await pool.query(
    `UPDATE tiktok_messages SET read = TRUE WHERE id = $1`,
    [messageId]
  );
}

export async function saveAiSuggestion(
  messageId: number,
  suggestion: string
): Promise<void> {
  await pool.query(
    `UPDATE tiktok_messages SET ai_suggestion = $1 WHERE id = $2`,
    [suggestion, messageId]
  );
}

export async function approveAiSuggestion(
  messageId: number,
  approvedBy: number
): Promise<void> {
  await pool.query(
    `UPDATE tiktok_messages
     SET ai_suggestion_approved = TRUE, approved_by = $1
     WHERE id = $2`,
    [approvedBy, messageId]
  );
}

export async function markMessageSent(messageId: number): Promise<void> {
  await pool.query(
    `UPDATE tiktok_messages SET sent = TRUE WHERE id = $1`,
    [messageId]
  );
}

export async function getUnreadCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COALESCE(SUM(unread_count), 0) as count FROM tiktok_conversations WHERE status = 'active'`
  );
  return parseInt(result.rows[0].count, 10);
}

// ── Worker State ──

export async function updateWorkerPollState(error?: string): Promise<void> {
  await pool.query(
    `INSERT INTO tiktok_worker_state (last_poll_at, session_valid, error_message, updated_at)
     VALUES (CURRENT_TIMESTAMP, $1, $2, CURRENT_TIMESTAMP)`,
    [!error, error || null]
  );
}

export async function getWorkerState(): Promise<{
  lastPollAt: string | null;
  sessionValid: boolean;
  errorMessage: string | null;
}> {
  const result = await pool.query<{
    last_poll_at: string;
    session_valid: boolean;
    error_message: string | null;
  }>(
    `SELECT last_poll_at, session_valid, error_message
     FROM tiktok_worker_state
     ORDER BY id DESC LIMIT 1`
  );
  if (!result.rows[0]) {
    return { lastPollAt: null, sessionValid: false, errorMessage: null };
  }
  return {
    lastPollAt: result.rows[0].last_poll_at,
    sessionValid: result.rows[0].session_valid,
    errorMessage: result.rows[0].error_message,
  };
}

logger.info('TikTok inbox DB service initialized');
