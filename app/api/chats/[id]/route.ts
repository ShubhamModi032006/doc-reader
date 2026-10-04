import { NextRequest, NextResponse } from 'next/server';
import { getChatById, deleteChatById } from '@/lib/db/chats';
import { listMessagesByChatId } from '@/lib/db/messages';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const chat = await getChatById(params.id);
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }
    const messages = await listMessagesByChatId(params.id);
    return NextResponse.json({ ...chat, messages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteChatById(params.id);
    return NextResponse.json({ success: true, id: params.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
