import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById } from '@/lib/db/documents';
import { getDocumentFile } from '@/lib/db/files';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await getDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const buffer = (await getDocumentFile(params.id, 'viewer_pdf')) || (await getDocumentFile(params.id, 'original'));

    if (!buffer) {
      return NextResponse.json({ error: 'File data not found in database' }, { status: 404 });
    }

    const contentType = doc.file_type === 'pdf' || (await getDocumentFile(params.id, 'viewer_pdf'))
      ? 'application/pdf'
      : 'application/octet-stream';

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
