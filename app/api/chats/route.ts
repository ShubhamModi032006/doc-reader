import { NextRequest, NextResponse } from 'next/server';
import { createChat, listChats } from '@/lib/db/chats';

export async function GET() {
  try {
    const chats = await listChats();
    return NextResponse.json(chats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentIds, title } = body;
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json({ error: 'At least one document ID is required' }, { status: 400 });
    }

    const chat = await createChat({ title, documentIds });
    return NextResponse.json(chat, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
