import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getDocumentById } from '@/lib/db/documents';
import { parseClauses } from '@/lib/compare/parseClauses';
import { alignClauses } from '@/lib/compare/align';
import { scoreSignificance } from '@/lib/compare/score';
import { summariseDiffsWithLLM } from '@/lib/compare/summarise';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { docAId, docBId } = body;

    if (!docAId || !docBId) {
      return NextResponse.json({ error: 'Both docAId and docBId are required' }, { status: 400 });
    }

    const docA = await getDocumentById(docAId);
    const docB = await getDocumentById(docBId);

    if (!docA || !docB) {
      return NextResponse.json({ error: 'One or both documents not found' }, { status: 404 });
    }

    const clausesA = parseClauses(docA.full_text || '');
    const clausesB = parseClauses(docB.full_text || '');

    const aligned = alignClauses(clausesA, clausesB);
    const scored = aligned.map(scoreSignificance);
    const result = await summariseDiffsWithLLM(scored);

    return NextResponse.json({
      docA: { id: docA.id, name: docA.name },
      docB: { id: docB.id, name: docB.name },
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
