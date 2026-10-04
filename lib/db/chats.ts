import { query } from './pool';

export interface ChatRow {
  id: string;
  title: string;
  document_ids: string[];
  created_at: Date;
  updated_at: Date;
}

export async function createChat(data: { title?: string; documentIds: string[] }): Promise<ChatRow> {
  const title = data.title || 'New Chat';
  const sql = `
    INSERT INTO chats (title, document_ids)
    VALUES ($1, $2::jsonb)
    RETURNING *;
  `;
  const res = await query<ChatRow>(sql, [title, JSON.stringify(data.documentIds)]);
  return res.rows[0];
}

export async function getChatById(id: string): Promise<ChatRow | null> {
  const res = await query<ChatRow>('SELECT * FROM chats WHERE id = $1', [id]);
  return res.rows[0] || null;
}

export async function listChats(): Promise<ChatRow[]> {
  const res = await query<ChatRow>('SELECT * FROM chats ORDER BY updated_at DESC');
  return res.rows;
}

export async function deleteChatById(id: string): Promise<void> {
  await query('DELETE FROM chats WHERE id = $1', [id]);
}
