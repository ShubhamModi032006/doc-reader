import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import path from 'path';
import { randomUUID } from 'crypto';
import { createDocument, listDocuments } from '@/lib/db/documents';
import { saveDocumentFile } from '@/lib/db/files';
import { processDocumentIngestion } from '@/lib/extract/ingest';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function GET() {
  try {
    const docs = await listDocuments();
    return NextResponse.json(docs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 });
    }

    const filename = file.name;
    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.pdf' && ext !== '.docx') {
      return NextResponse.json(
        { error: 'Invalid file type. Only .pdf and .docx files are allowed.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate magic header bytes
    const isPdfHeader = buffer.slice(0, 5).toString('utf8') === '%PDF-';
    const isZipHeader = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

    if (ext === '.pdf' && !isPdfHeader) {
      return NextResponse.json(
        { error: 'Corrupt or invalid PDF file (header mismatch)' },
        { status: 400 }
      );
    }

    if (ext === '.docx' && !isZipHeader) {
      return NextResponse.json(
        { error: 'Corrupt or invalid DOCX file (header mismatch)' },
        { status: 400 }
      );
    }

    const docId = randomUUID();

    // Store file in Postgres DB
    await saveDocumentFile(docId, 'original', buffer);
    if (ext === '.pdf') {
      await saveDocumentFile(docId, 'viewer_pdf', buffer);
    }

    const doc = await createDocument({
      id: docId,
      name: filename,
      file_type: ext === '.pdf' ? 'pdf' : 'docx',
      original_path: '',
      file_size: file.size,
    });

    // Asynchronously trigger processing without blocking response
    processDocumentIngestion(doc.id).catch((e) => console.error('Background ingestion error:', e));

    return NextResponse.json(doc, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
