import { NextRequest, NextResponse } from 'next/server';
import { getDocumentFileByKind } from '@/lib/db/files';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('file');

    if (!filename || !filename.startsWith('redlined_') || !filename.endsWith('.docx')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const redlineId = filename.replace('.docx', '');
    const buffer = await getDocumentFileByKind(redlineId);

    if (!buffer) {
      return NextResponse.json({ error: 'File not found in database' }, { status: 404 });
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
