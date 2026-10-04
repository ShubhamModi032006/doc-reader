import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getDocumentById } from '@/lib/db/documents';
import { runPythonScript } from '@/lib/extract/runPython';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, edits } = body;

    if (!documentId || !edits || !Array.isArray(edits) || edits.length === 0) {
      return NextResponse.json({ error: 'documentId and edits array are required' }, { status: 400 });
    }

    const doc = await getDocumentById(documentId);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.file_type !== 'docx') {
      return NextResponse.json({ error: 'Tracked-change redlining is supported for DOCX files only.' }, { status: 400 });
    }

    const storageDir = path.join(process.cwd(), 'storage');
    const redlinedId = randomUUID();
    const outputFilename = `redlined_${redlinedId}.docx`;
    const outputPath = path.join(storageDir, outputFilename);

    const editsJson = JSON.stringify(edits);

    const result = await runPythonScript('redline_docx.py', [
      doc.original_path,
      editsJson,
      outputPath,
    ]);

    if (!result.success || !fs.existsSync(outputPath)) {
      return NextResponse.json({ error: 'Failed to generate redlined DOCX' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/redline/download?file=${outputFilename}`,
      editsApplied: result.edits_applied,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
