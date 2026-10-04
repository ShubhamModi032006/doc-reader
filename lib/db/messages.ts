import { query } from './pool';

export interface MessageRow {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'completed' | 'stopped' | 'failed' | 'interrupted';
  quotes: any[];
  coverage: any;
  provider_used?: string;
  fallback_reason?: string | null;
  created_at: Date;
}

export async function createMessage(data: {
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  status?: MessageRow['status'];
  quotes?: any[];
  coverage?: any;
  providerUsed?: string;
  fallbackReason?: string | null;
}): Promise<MessageRow> {
  try {
    const sql = `
      INSERT INTO messages (chat_id, role, content, status, quotes, coverage, provider_used, fallback_reason)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
      RETURNING *;
    `;
    const res = await query<MessageRow>(sql, [
      data.chatId,
      data.role,
      data.content,
      data.status || 'completed',
      JSON.stringify(data.quotes || []),
      JSON.stringify(data.coverage || {}),
      data.providerUsed || 'manual',
      data.fallbackReason || null,
    ]);
    return res.rows[0];
  } catch (err: any) {
    if (err.code === '42703' || err.message?.includes('provider_used')) {
      const sqlFallback = `
        INSERT INTO messages (chat_id, role, content, status, quotes, coverage)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        RETURNING *;
      `;
      const resFallback = await query<MessageRow>(sqlFallback, [
        data.chatId,
        data.role,
        data.content,
        data.status || 'completed',
        JSON.stringify(data.quotes || []),
        JSON.stringify(data.coverage || {}),
      ]);
      return resFallback.rows[0];
    }
    throw err;
  }
}

export async function updateMessage(data: {
  id: string;
  content: string;
  status: MessageRow['status'];
  quotes?: any[];
  coverage?: any;
  providerUsed?: string;
  fallbackReason?: string | null;
}): Promise<MessageRow> {
  try {
    const sql = `
      UPDATE messages
      SET content = $2, status = $3, quotes = $4::jsonb, coverage = $5::jsonb,
          provider_used = COALESCE($6, provider_used), fallback_reason = COALESCE($7, fallback_reason)
      WHERE id = $1
      RETURNING *;
    `;
    const res = await query<MessageRow>(sql, [
      data.id,
      data.content,
      data.status,
      JSON.stringify(data.quotes || []),
      JSON.stringify(data.coverage || {}),
      data.providerUsed || null,
      data.fallbackReason || null,
    ]);
    return res.rows[0];
  } catch (err: any) {
    if (err.code === '42703' || err.message?.includes('provider_used')) {
      const sqlFallback = `
        UPDATE messages
        SET content = $2, status = $3, quotes = $4::jsonb, coverage = $5::jsonb
        WHERE id = $1
        RETURNING *;
      `;
      const resFallback = await query<MessageRow>(sqlFallback, [
        data.id,
        data.content,
        data.status,
        JSON.stringify(data.quotes || []),
        JSON.stringify(data.coverage || {}),
      ]);
      return resFallback.rows[0];
    }
    throw err;
  }
}

export async function listMessagesByChatId(chatId: string): Promise<MessageRow[]> {
  const res = await query<MessageRow>(
    'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
    [chatId]
  );
  return res.rows;
}
