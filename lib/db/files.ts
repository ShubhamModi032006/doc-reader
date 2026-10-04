import { query } from './pool';

export type FileKind = 'original' | 'viewer_pdf' | string;

export async function saveDocumentFile(
  documentId: string,
  kind: FileKind,
  data: Buffer
): Promise<void> {
  const sql = `
    INSERT INTO document_files (document_id, kind, data, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (document_id, kind)
    DO UPDATE SET data = EXCLUDED.data, created_at = NOW();
  `;
  await query(sql, [documentId, kind, data]);
}

export async function getDocumentFile(
  documentId: string,
  kind: FileKind
): Promise<Buffer | null> {
  const sql = `
    SELECT data FROM document_files
    WHERE document_id = $1 AND kind = $2;
  `;
  const res = await query<{ data: Buffer }>(sql, [documentId, kind]);
  if (res.rows.length === 0) {
    return null;
  }
  return res.rows[0].data;
}

export async function getDocumentFileByKind(
  kind: FileKind
): Promise<Buffer | null> {
  const sql = `
    SELECT data FROM document_files
    WHERE kind = $1
    LIMIT 1;
  `;
  const res = await query<{ data: Buffer }>(sql, [kind]);
  if (res.rows.length === 0) {
    return null;
  }
  return res.rows[0].data;
}

export async function deleteDocumentFiles(documentId: string): Promise<void> {
  const sql = `DELETE FROM document_files WHERE document_id = $1;`;
  await query(sql, [documentId]);
}
