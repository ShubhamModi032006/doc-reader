import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getDocumentById } from '@/lib/db/documents';
import { getDocumentFile, saveDocumentFile } from '@/lib/db/files';
import { runPythonScript } from '@/lib/extract/runPython';

export async function POST(req: NextRequest) {
  const tempFiles: string[] = [];

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

    const originalBuffer = await getDocumentFile(documentId, 'original');
    if (!originalBuffer) {
      return NextResponse.json({ error: 'Original DOCX file not found in database' }, { status: 404 });
    }

    const tempDir = os.tmpdir();
    const redlinedId = randomUUID();
    const tempInputPath = path.join(tempDir, `redline_in_${documentId}_${redlinedId}.docx`);
    const tempOutputPath = path.join(tempDir, `redlined_${redlinedId}.docx`);

    fs.writeFileSync(tempInputPath, originalBuffer);
    tempFiles.push(tempInputPath);
    tempFiles.push(tempOutputPath);

    const editsJson = JSON.stringify(edits);

    const result = await runPythonScript('redline_docx.py', [
      tempInputPath,
      editsJson,
      tempOutputPath,
    ]);

    if (!result.success || !fs.existsSync(tempOutputPath)) {
      return NextResponse.json({ error: 'Failed to generate redlined DOCX' }, { status: 500 });
    }

    const redlinedBuffer = fs.readFileSync(tempOutputPath);
    const kindKey = `redline_${redlinedId}`;
    await saveDocumentFile(documentId, kindKey, redlinedBuffer);

    return NextResponse.json({
      success: true,
      downloadUrl: `/api/redline/download?file=redlined_${redlinedId}.docx`,
      editsApplied: result.edits_applied,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (_) {}
      }
    }
  }
}
