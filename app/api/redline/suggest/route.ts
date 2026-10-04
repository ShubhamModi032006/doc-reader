import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getDocumentById } from '@/lib/db/documents';
import { getLLMProvider } from '@/lib/llm';

function validateFindText(find: string, docText: string): boolean {
  if (!find || !find.trim()) return false;
  if (docText.includes(find)) return true;
  const normDoc = docText.replace(/\s+/g, ' ');
  const normFind = find.replace(/\s+/g, ' ');
  return normFind.length >= 3 && normDoc.includes(normFind);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, instruction } = body;

    if (!documentId || !instruction) {
      return NextResponse.json({ error: 'documentId and instruction are required' }, { status: 400 });
    }

    const doc = await getDocumentById(documentId);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const docText = doc.full_text || '';
    const provider = getLLMProvider();

    if (!provider.suggestEdits) {
      return NextResponse.json({
        validEdits: [],
        rejectedCount: 0,
        rejectedEdits: [],
        aiUnavailable: true,
      });
    }

    const rawEdits = await provider.suggestEdits(instruction, docText);

    if (!rawEdits || rawEdits.length === 0) {
      return NextResponse.json({
        validEdits: [],
        rejectedCount: 0,
        rejectedEdits: [],
        aiUnavailable: false,
      });
    }

    const validEdits: Array<{ find_text: string; replace_text: string }> = [];
    const rejectedEdits: Array<{ find: string; replace: string; reason: string }> = [];

    for (const edit of rawEdits) {
      if (validateFindText(edit.find, docText)) {
        validEdits.push({ find_text: edit.find, replace_text: edit.replace });
      } else {
        rejectedEdits.push({
          find: edit.find,
          replace: edit.replace,
          reason: 'Text not found verbatim in document',
        });
      }
    }

    return NextResponse.json({
      validEdits,
      rejectedCount: rejectedEdits.length,
      rejectedEdits,
      aiUnavailable: false,
      providerUsed: provider.name || 'groq',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
