import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getDocumentById } from '@/lib/db/documents';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await getDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const progressMap: Record<string, number> = {
      uploading: 15,
      extracting: 45,
      chunking: 80,
      ready: 100,
      failed: 0,
      needs_ocr: 0,
    };

    return NextResponse.json({
      id: doc.id,
      name: doc.name,
      status: doc.status,
      stage: doc.status,
      progress: progressMap[doc.status] || 0,
      pageCount: doc.page_count,
      errorMessage: doc.error_message,
      updatedAt: doc.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
