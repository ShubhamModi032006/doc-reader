import { LLMProvider, StreamAnswerParams, StreamToken } from './types';
import { callGroqAPI } from './groqClient';
import { QuoteParser } from './quoteParser';
import { mapReduceScan } from './mapReduceScan';
import {
  ANSWER_SYSTEM_PROMPT,
  buildAnswerUserPrompt,
  SUMMARISE_CHANGES_SYSTEM_PROMPT,
  SUGGEST_EDITS_SYSTEM_PROMPT,
} from './prompts';

export class GroqProvider implements LLMProvider {
  public name = 'groq';

  async streamAnswer(
    params: StreamAnswerParams,
    onToken: (token: StreamToken) => void
  ): Promise<void> {
    if (params.isScanAll) {
      return mapReduceScan(params, onToken);
    }

    const maxChars = parseInt(process.env.LLM_MAX_CONTEXT_CHARS || '24000', 10);
    const docMap: Record<string, string> = {};
    const formattedChunks: string[] = [];

    const numDocs = params.documents.length;
    const perDocBudget = numDocs > 0 ? Math.floor(maxChars / numDocs) : maxChars;

    params.documents.forEach((doc, idx) => {
      const label = `D${idx + 1}`;
      docMap[label] = doc.id;

      let docChars = 0;
      for (const chunk of doc.chunks) {
        if (!chunk.text || !chunk.text.trim()) continue;
        const pageRange =
          chunk.startPage && chunk.endPage
            ? chunk.startPage === chunk.endPage
              ? `p. ${chunk.startPage}`
              : `pp. ${chunk.startPage}-${chunk.endPage}`
            : 'p. 1';

        const prefix = `[${label} ${pageRange}] `;
        const entry = `${prefix}${chunk.text.trim()}`;

        if (docChars + entry.length > perDocBudget) break;
        formattedChunks.push(entry);
        docChars += entry.length;
      }
    });

    const docExcerpts = formattedChunks.join('\n\n');
    const coverageInfo = params.coverage.isPartial
      ? `Sections provided: ${params.coverage.searchedChunks} of ${params.coverage.totalChunks} chunks searched.`
      : undefined;

    const userPrompt = buildAnswerUserPrompt({
      question: params.question,
      docExcerpts,
      coverageInfo,
    });

    const parser = new QuoteParser({
      docMap,
      isPartialCoverage: params.coverage.isPartial,
    });

    await callGroqAPI({
      messages: [
        { role: 'system', content: ANSWER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: 0.1,
      signal: params.signal,
      onChunk: (delta) => parser.feed(delta, onToken),
    });

    parser.flush(onToken);
  }

  async summariseChanges(changes: any[]): Promise<string[]> {
    if (!changes || changes.length === 0) return [];

    const results: string[] = new Array(changes.length);

    const getFallbackSummary = (c: any) => {
      if (c.type === 'unchanged') return 'Unchanged';
      if (c.type === 'added') return `New clause added: "${c.title || 'Clause'}"`;
      if (c.type === 'removed') return `Clause removed: "${c.title || 'Clause'}"`;
      if (c.type === 'moved') return `Clause "${c.title || 'Clause'}" was renumbered or moved`;

      const numsA = c.textA?.match(/\b(?:\$\s*|AED\s*)?\d+(?:,\d{3})*(?:\.\d+)?%?\b/g) || [];
      const numsB = c.textB?.match(/\b(?:\$\s*|AED\s*)?\d+(?:,\d{3})*(?:\.\d+)?%?\b/g) || [];
      let changedPair: { from: string; to: string } | undefined = undefined;
      const maxLen = Math.max(numsA.length, numsB.length);
      for (let i = 0; i < maxLen; i++) {
        if (numsA[i] !== numsB[i]) {
          changedPair = { from: numsA[i] || 'none', to: numsB[i] || 'none' };
          break;
        }
      }
      if (changedPair) return `${c.title || 'Clause'} changed from ${changedPair.from} to ${changedPair.to}`;
      if (c.reasons?.some((r: string) => r.includes('Modal'))) return `${c.title || 'Clause'} obligation level changed`;
      if (c.reasons?.some((r: string) => r.includes('Negation'))) return `${c.title || 'Clause'} condition negated/reversed`;
      return `${c.title || 'Clause'}: Wording change only`;
    };

    changes.forEach((c, idx) => {
      results[idx] = getFallbackSummary(c);
    });

    const batchSize = 10;
    for (let i = 0; i < changes.length; i += batchSize) {
      const batch = changes.slice(i, i + batchSize);
      const batchInput = batch.map((c, idx) => ({
        id: `c_${i + idx}`,
        title: c.title,
        type: c.type,
        oldText: c.textA || '',
        newText: c.textB || '',
        reasons: c.reasons || [],
      }));

      try {
        const responseText = await callGroqAPI({
          messages: [
            { role: 'system', content: SUMMARISE_CHANGES_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(batchInput) },
          ],
          jsonMode: true,
          temperature: 0.1,
        });

        const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const summaries = parsed.summaries || parsed;

        if (Array.isArray(summaries)) {
          for (const item of summaries) {
            if (item.id && typeof item.text === 'string' && item.text.trim()) {
              const matchIdx = parseInt(item.id.replace('c_', ''), 10);
              if (!isNaN(matchIdx) && matchIdx >= 0 && matchIdx < changes.length) {
                const originalChange = changes[matchIdx];
                if (originalChange.type === 'modified' && originalChange.significance === 'LOW' && !item.text.includes('Wording change only')) {
                  results[matchIdx] = `${originalChange.title || 'Clause'}: Wording change only (${item.text.trim()})`;
                } else {
                  results[matchIdx] = item.text.trim();
                }
              }
            }
          }
        }
      } catch (e) {
        // Fallbacks already populated
      }
    }

    return results;
  }

  async suggestEdits(instruction: string, documentText: string): Promise<Array<{ find: string; replace: string }>> {
    const maxChars = parseInt(process.env.LLM_MAX_CONTEXT_CHARS || '24000', 10);
    const truncatedText = documentText.length > maxChars ? documentText.slice(0, maxChars) : documentText;

    const userPrompt = `Document Text:\n"""\n${truncatedText}\n"""\n\nInstruction: ${instruction}`;

    try {
      const responseText = await callGroqAPI({
        messages: [
          { role: 'system', content: SUGGEST_EDITS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        jsonMode: true,
        temperature: 0.1,
      });

      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const edits = parsed.edits || parsed;

      if (Array.isArray(edits)) {
        return edits
          .filter((e) => typeof e.find === 'string' && typeof e.replace === 'string' && e.find.trim())
          .map((e) => ({ find: e.find.trim(), replace: e.replace.trim() }));
      }
    } catch (e) {
      // Return empty on failure
    }

    return [];
  }
}
