import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDocumentById } from '@/lib/db/documents';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await getDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const filePath = doc.converted_pdf_path && fs.existsSync(doc.converted_pdf_path)
      ? doc.converted_pdf_path
      : doc.original_path;

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found on server disk' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const contentType = filePath.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${doc.name}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
