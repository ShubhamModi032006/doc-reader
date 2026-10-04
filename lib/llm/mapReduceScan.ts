import { StreamAnswerParams, StreamToken } from './types';
import { callGroqAPI } from './groqClient';
import { QuoteParser } from './quoteParser';
import { MAP_SCAN_SYSTEM_PROMPT, REDUCE_SCAN_SYSTEM_PROMPT } from './prompts';

export async function mapReduceScan(
  params: StreamAnswerParams,
  onToken: (token: StreamToken) => void
): Promise<void> {
  const docMap: Record<string, string> = {};
  const allFormattedEntries: Array<{ label: string; text: string }> = [];

  params.documents.forEach((doc, idx) => {
    const label = `D${idx + 1}`;
    docMap[label] = doc.id;
    for (const chunk of doc.chunks) {
      if (!chunk.text || !chunk.text.trim()) continue;
      const pageRange =
        chunk.startPage && chunk.endPage
          ? chunk.startPage === chunk.endPage
            ? `p. ${chunk.startPage}`
            : `pp. ${chunk.startPage}-${chunk.endPage}`
          : 'p. 1';

      allFormattedEntries.push({
        label,
        text: `[${label} ${pageRange}] ${chunk.text.trim()}`,
      });
    }
  });

  const batches: string[][] = [];
  const batchSize = 10;
  for (let i = 0; i < allFormattedEntries.length; i += batchSize) {
    batches.push(allFormattedEntries.slice(i, i + batchSize).map((e) => e.text));
  }

  let anyBatchFailed = false;
  const extractedQuotes: string[] = [];

  let batchIndex = 0;
  const workers = [0, 1].map(async () => {
    while (batchIndex < batches.length) {
      const i = batchIndex++;
      const batchText = batches[i].join('\n\n');
      const userPrompt = `Target Topic: ${params.question}\n\nExcerpts:\n${batchText}`;

      let retries = 0;
      let delay = 1000;
      let success = false;

      while (retries <= 3) {
        try {
          const res = await callGroqAPI({
            messages: [
              { role: 'system', content: MAP_SCAN_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            signal: params.signal,
          });

          const trimmed = res.trim();
          if (trimmed && !trimmed.toUpperCase().includes('NONE')) {
            extractedQuotes.push(trimmed);
          }
          success = true;
          break;
        } catch (err: any) {
          if (params.signal?.aborted || err.name === 'AbortError') throw err;
          if (err.name === 'RateLimitError' && retries < 3) {
            retries++;
            await new Promise((r) => setTimeout(r, delay));
            delay *= 2;
            continue;
          }
          break;
        }
      }

      if (!success) {
        anyBatchFailed = true;
      }
    }
  });

  await Promise.all(workers);

  const isPartial = params.coverage.isPartial || anyBatchFailed;

  const parser = new QuoteParser({
    docMap,
    isPartialCoverage: isPartial,
  });

  if (extractedQuotes.length === 0) {
    parser.feed('NOT_FOUND', onToken);
    parser.flush(onToken);
    return;
  }

  const reducePrompt = `Question: ${params.question}\n\nGathered Verbatim Quotes:\n${extractedQuotes.join('\n\n')}`;
  await callGroqAPI({
    messages: [
      { role: 'system', content: REDUCE_SCAN_SYSTEM_PROMPT },
      { role: 'user', content: reducePrompt },
    ],
    stream: true,
    temperature: 0.1,
    signal: params.signal,
    onChunk: (delta) => parser.feed(delta, onToken),
  });

  parser.flush(onToken);
}
