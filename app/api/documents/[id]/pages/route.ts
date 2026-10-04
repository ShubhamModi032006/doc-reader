import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { query } from '@/lib/db/pool';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await query(
      'SELECT id, document_id, page_number, text, words_json FROM document_pages WHERE document_id = $1 ORDER BY page_number ASC',
      [params.id]
    );
    return NextResponse.json(res.rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
