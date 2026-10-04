import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { createDocument, getDocumentById, deleteDocumentById } from '../lib/db/documents';
import { saveDocumentFile, getDocumentFile } from '../lib/db/files';
import { processDocumentIngestion } from '../lib/extract/ingest';
import { pool } from '../lib/db/pool';

describe('Postgres Bytea Storage & Ingestion Verification', () => {
  const testDocId = randomUUID();
  const pdfFixturePath = path.join(process.cwd(), 'fixtures', 'big_contract.pdf');
  const pdfBuffer = fs.readFileSync(pdfFixturePath);

  afterAll(async () => {
    await deleteDocumentById(testDocId);
    await pool.end();
  });

  it('1. Creates document and stores/retrieves raw BYTEA file buffers in document_files table', async () => {
    const doc = await createDocument({
      id: testDocId,
      name: 'test_contract.pdf',
      file_type: 'pdf',
      original_path: '',
      file_size: pdfBuffer.length,
    });
    expect(doc.id).toBe(testDocId);

    await saveDocumentFile(testDocId, 'original', pdfBuffer);
    const retrieved = await getDocumentFile(testDocId, 'original');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.length).toBe(pdfBuffer.length);
    expect(Buffer.compare(retrieved!, pdfBuffer)).toBe(0);
  });

  it('2. Ingests PDF document from DB without disk storage dependency', async () => {
    await processDocumentIngestion(testDocId);

    const updatedDoc = await getDocumentById(testDocId);
    expect(updatedDoc?.status).toBe('ready');
    expect(updatedDoc?.page_count).toBeGreaterThan(0);

    const viewerPdf = await getDocumentFile(testDocId, 'viewer_pdf');
    expect(viewerPdf).not.toBeNull();
    expect(viewerPdf?.length).toBe(pdfBuffer.length);
  });

  it('3. Cleans up document_files table rows when document is deleted (ON DELETE CASCADE)', async () => {
    await deleteDocumentById(testDocId);
    const fileAfterDelete = await getDocumentFile(testDocId, 'original');
    expect(fileAfterDelete).toBeNull();
  });
});
