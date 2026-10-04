import { query } from './pool';

export interface DocumentRow {
  id: string;
  name: string;
  file_type: 'pdf' | 'docx';
  original_path: string;
  converted_pdf_path?: string | null;
  file_size: number;
  page_count: number;
  status: 'uploading' | 'extracting' | 'chunking' | 'ready' | 'failed' | 'needs_ocr';
  error_message?: string | null;
  full_text?: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createDocument(doc: {
  id: string;
  name: string;
  file_type: 'pdf' | 'docx';
  original_path: string;
  file_size: number;
}): Promise<DocumentRow> {
  const sql = `
    INSERT INTO documents (id, name, file_type, original_path, file_size, status)
    VALUES ($1, $2, $3, $4, $5, 'uploading')
    RETURNING *;
  `;
  const res = await query<DocumentRow>(sql, [doc.id, doc.name, doc.file_type, doc.original_path, doc.file_size]);
  return res.rows[0];
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentRow['status'],
  errorMessage?: string
): Promise<void> {
  const sql = `
    UPDATE documents
    SET status = $2, error_message = $3, updated_at = NOW()
    WHERE id = $1;
  `;
  await query(sql, [id, status, errorMessage || null]);
}

export async function updateDocumentExtractedData(
  id: string,
  data: {
    page_count: number;
    full_text: string;
    converted_pdf_path?: string;
    status: DocumentRow['status'];
  }
): Promise<void> {
  const sql = `
    UPDATE documents
    SET page_count = $2, full_text = $3, converted_pdf_path = $4, status = $5, updated_at = NOW()
    WHERE id = $1;
  `;
  await query(sql, [id, data.page_count, data.full_text, data.converted_pdf_path || null, data.status]);
}

export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  const res = await query<DocumentRow>('SELECT * FROM documents WHERE id = $1', [id]);
  return res.rows[0] || null;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const res = await query<DocumentRow>('SELECT * FROM documents ORDER BY created_at DESC');
  return res.rows;
}

export async function deleteDocumentById(id: string): Promise<DocumentRow | null> {
  const res = await query<DocumentRow>('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

export async function saveDocumentPages(
  documentId: string,
  pages: Array<{ page_number: number; text: string; words: any[] }>
): Promise<void> {
  for (const p of pages) {
    await query(
      `INSERT INTO document_pages (document_id, page_number, text, words_json)
       VALUES ($1, $2, $3, $4)`,
      [documentId, p.page_number, p.text, JSON.stringify(p.words)]
    );
  }
}
