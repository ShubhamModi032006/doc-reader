import { NextRequest, NextResponse } from 'next/server';
import { createMessage, updateMessage } from '@/lib/db/messages';
import { getChatById } from '@/lib/db/chats';
import { getDocumentById } from '@/lib/db/documents';
import { searchChunksFTS, getAllChunksForDocument, countChunksForDocuments } from '@/lib/db/chunks';
import { getLLMProvider } from '@/lib/llm';
import { verifyQuote, computePageOffsetMaps } from '@/lib/quotes/verify';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const chatId = params.id;
    const chat = await getChatById(chatId);
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const body = await req.json();
    const { question, simulateBadQuote, isScanAll } = body;
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const documentIds: string[] = chat.document_ids || [];
    if (documentIds.length === 0) {
      return NextResponse.json({ error: 'No documents attached to chat' }, { status: 400 });
    }

    // Save user message
    await createMessage({
      chatId,
      role: 'user',
      content: question,
      status: 'completed',
    });

    // Create placeholder assistant message
    const assistantMsg = await createMessage({
      chatId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    });

    // Load documents data for coverage and verification
    const docs = await Promise.all(documentIds.map((id) => getDocumentById(id)));
    const validDocs = docs.filter(Boolean) as any[];

    // Retrieve chunks
    let chunks: any[] = [];
    if (isScanAll) {
      // Scan all chunks for "does X exist?" questions
      for (const d of validDocs) {
        const cList = await getAllChunksForDocument(d.id);
        chunks.push(...cList);
      }
    } else {
      chunks = await searchChunksFTS(documentIds, question, 5);
    }

    const totalChunksCount = await countChunksForDocuments(documentIds);
    const totalPagesCount = validDocs.reduce((acc, d) => acc + (d.page_count || 1), 0);

    const searchedPagesSet = new Set<number>();
    chunks.forEach((c) => {
      for (let p = c.start_page; p <= c.end_page; p++) searchedPagesSet.add(p);
    });

    const coverage = {
      searchedChunks: chunks.length,
      totalChunks: totalChunksCount,
      searchedPages: searchedPagesSet.size,
      totalPages: totalPagesCount,
      isPartial: !isScanAll && chunks.length < totalChunksCount,
    };

    // Prepare LLM documents format
    const llmDocs = validDocs.map((d) => ({
      id: d.id,
      name: d.name,
      fullText: d.full_text,
      totalPages: d.page_count,
      chunks: chunks
        .filter((c) => c.document_id === d.id)
        .map((c) => ({
          id: c.id,
          text: c.text,
          startPage: c.start_page,
          endPage: c.end_page,
        })),
    }));

    const provider = getLLMProvider();

    // Prepare SSE stream
    const encoder = new TextEncoder();
    let accumulatedText = '';
    const rawQuotes: Array<{ documentId: string; text: string }> = [];

    let providerUsed = (process.env.LLM_PROVIDER || 'manual').toLowerCase() === 'groq' ? 'groq' : 'manual';
    let fallbackReason: string | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        let isAborted = false;
        let isInterrupted = false;

        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        // Send initial coverage event
        sendEvent('coverage', coverage);

        try {
          await provider.streamAnswer(
            {
              question,
              documents: llmDocs,
              coverage,
              signal: req.signal,
              simulateBadQuote: !!simulateBadQuote,
              isScanAll: !!isScanAll,
              onMeta: (meta) => {
                providerUsed = meta.providerUsed;
                fallbackReason = meta.fallbackReason || null;
                sendEvent('meta', meta);
              },
            },
            (token) => {
              if (token.type === 'text') {
                accumulatedText += token.delta;
                sendEvent('text', { delta: token.delta, accumulated: accumulatedText });
              } else if (token.type === 'quote') {
                rawQuotes.push({ documentId: token.documentId, text: token.text });
              }
            }
          );
        } catch (err: any) {
          if (err.name === 'AbortError' || req.signal.aborted) {
            isAborted = true;
          } else if (err.isInterrupted) {
            isInterrupted = true;
            sendEvent('interrupted', { message: 'Stream interrupted mid-generation' });
          } else {
            console.error('Streaming error:', err);
            sendEvent('error', { message: err.message || 'Stream error' });
          }
        }

        // Verify quotes
        const verifiedQuotesList: any[] = [];
        for (const q of rawQuotes) {
          const targetDoc = validDocs.find((d) => d.id === q.documentId) || validDocs[0];
          if (targetDoc && targetDoc.full_text) {
            const vRes = verifyQuote(q.text, targetDoc.full_text, [], targetDoc.id);
            verifiedQuotesList.push(vRes);
          } else {
            verifiedQuotesList.push({
              quoteText: q.text,
              documentId: q.documentId,
              status: 'unverified',
              similarity: 0,
              occurrences: [],
              message: 'Document text missing',
            });
          }
        }

        sendEvent('quotes', verifiedQuotesList);

        const finalStatus = isAborted ? 'stopped' : isInterrupted ? 'interrupted' : 'completed';

        // Update assistant message in database
        await updateMessage({
          id: assistantMsg.id,
          content: accumulatedText,
          status: finalStatus,
          quotes: verifiedQuotesList,
          coverage,
          providerUsed,
          fallbackReason,
        });

        sendEvent('done', {
          status: finalStatus,
          messageId: assistantMsg.id,
          providerUsed,
          fallbackReason,
        });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
