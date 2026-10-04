import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getDocumentById, deleteDocumentById } from '@/lib/db/documents';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await getDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await deleteDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: params.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
