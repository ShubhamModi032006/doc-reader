import { LLMProvider, StreamAnswerParams, StreamToken } from './types';
import { extractKeywords } from '../db/chunks';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from',
  'how', 'i', 'in', 'is', 'it', 'many', 'need', 'of', 'on', 'or', 'that',
  'the', 'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who', 'will', 'with',
  'should', 'would', 'could', 'about', 'get', 'give', 'given'
]);

const SYNONYMS: Record<string, string[]> = {
  submit: ['submit', 'submission', 'deliverables', 'github', 'repo'],
  submitting: ['submit', 'submission', 'deliverables', 'github', 'repo'],
  requirements: ['requirements', 'requirement', 'need', 'must', 'should', 'build', 'part'],
  requirement: ['requirements', 'requirement', 'need', 'must', 'should', 'build', 'part'],
  deadline: ['deadline', 'days', 'due', 'duration', 'time'],
  days: ['days', 'day', 'duration', 'deadline', 'time'],
  day: ['days', 'day', 'duration', 'deadline', 'time'],
  extras: ['extras', 'extra', 'optional', 'bonus'],
  extra: ['extras', 'extra', 'optional', 'bonus'],
  optional: ['optional', 'extras', 'extra', 'bonus'],
  project: ['project', 'assignment', 'app', 'system'],
  assignment: ['assignment', 'project', 'app'],
};

export function splitIntoSentences(text: string): string[] {
  // Split on double newlines or punctuation followed by space and capital letter, avoiding list numbers (1.) and abbreviations
  const rawBlocks = text.split(/\n{2,}/);
  const candidateSentences: string[] = [];

  for (const block of rawBlocks) {
    const rawUnits = block.split(/(?<=[.!?])\s+(?=[A-Z"'\d])/);
    let buffer = '';

    for (const unit of rawUnits) {
      const trimmed = unit.trim();
      if (!trimmed) continue;

      const words = trimmed.split(/\s+/).filter(Boolean);
      const isListMarker = /^(?:\d+[\.\)]|[A-Z][\.\)]|Part\s+[A-Z]|Section\s+\d+|What to \w+)$/i.test(trimmed);

      if (isListMarker || words.length < 5) {
        buffer += (buffer ? ' ' : '') + trimmed;
      } else {
        if (buffer) {
          candidateSentences.push(buffer + ' ' + trimmed);
          buffer = '';
        } else {
          candidateSentences.push(trimmed);
        }
      }
    }

    if (buffer) {
      if (candidateSentences.length > 0 && candidateSentences[candidateSentences.length - 1].length < 200) {
        candidateSentences[candidateSentences.length - 1] += ' ' + buffer;
      } else {
        candidateSentences.push(buffer);
      }
    }
  }

  return candidateSentences.map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 4);
}

export class ManualProvider implements LLMProvider {
  public name = 'manual';

  async streamAnswer(
    params: StreamAnswerParams,
    onToken: (token: StreamToken) => void
  ): Promise<void> {
    const { question, documents, coverage, signal, simulateBadQuote } = params;

    const keywords = extractKeywords(question);
    const expandedTerms = new Set<string>();

    keywords.forEach((k) => {
      expandedTerms.add(k);
      (SYNONYMS[k] || []).forEach((syn) => expandedTerms.add(syn));
    });

    const candidateSentences: Array<{
      docId: string;
      docName: string;
      sentence: string;
      score: number;
      index: number;
    }> = [];

    let overallIdx = 0;
    for (const doc of documents) {
      for (const chunk of doc.chunks) {
        if (!chunk.text || !chunk.text.trim()) continue;
        const sentences = splitIntoSentences(chunk.text);

        for (const s of sentences) {
          const lower = s.toLowerCase();
          let score = 0;

          expandedTerms.forEach((term) => {
            if (lower.includes(term)) {
              score += keywords.includes(term) ? 3 : 1.5;
            }
          });

          // Heading / Section title match bonus
          if (/^(?:what to|section|part|article|requirement|deadline)/i.test(s)) {
            keywords.forEach((k) => {
              if (lower.includes(k)) score += 5;
            });
          }

          if (score > 0) {
            candidateSentences.push({
              docId: doc.id,
              docName: doc.name,
              sentence: s,
              score,
              index: overallIdx++,
            });
          }
        }
      }
    }

    // Filter out low scores and duplicates
    const topScored = candidateSentences.sort((a, b) => b.score - a.score);
    const maxScore = topScored[0]?.score || 0;

    // Minimum threshold check
    if (maxScore < 2) {
      const negativeAnswer = coverage.isPartial
        ? 'Not found in the sections reviewed.'
        : 'This is not stated in the document.';
      await this.streamText(negativeAnswer, onToken, signal);
      return;
    }

    // Select top unique sentences (deduplicated)
    const selected: typeof candidateSentences = [];
    const seenTexts = new Set<string>();

    for (const c of topScored) {
      const norm = c.sentence.toLowerCase().slice(0, 40);
      if (seenTexts.has(norm)) continue;
      seenTexts.add(norm);
      selected.push(c);
      if (selected.length >= 5) break;
    }

    // Sort selected sentences by document order
    selected.sort((a, b) => a.index - b.index);

    // Build lead-in phrase based on question topic
    const qLower = question.toLowerCase();
    let leadIn = 'Based on the contract provisions:\n\n';
    if (qLower.includes('submit') || qLower.includes('submission')) {
      leadIn = 'The document specifies the following submission items:\n\n';
    } else if (qLower.includes('day') || qLower.includes('deadline') || qLower.includes('time') || qLower.includes('due')) {
      leadIn = 'The document specifies the following timeline and deadline details:\n\n';
    } else if (qLower.includes('require') || qLower.includes('build') || qLower.includes('project')) {
      leadIn = 'The document outlines the following requirements:\n\n';
    } else if (qLower.includes('extra') || qLower.includes('optional') || qLower.includes('bonus')) {
      leadIn = 'The document lists the following optional extras:\n\n';
    }

    await this.streamText(leadIn, onToken, signal);

    for (const item of selected) {
      await this.streamText(`"${item.sentence}" `, onToken, signal);
      onToken({ type: 'quote', documentId: item.docId, text: item.sentence });
    }

    // Dev Simulation flag
    if (simulateBadQuote) {
      const primaryDocId = documents[0]?.id || 'doc-1';
      await this.streamText('\n\n[Dev Simulation]: ', onToken, signal);
      const paraphrased = 'The agreement might be terminated if both parties agree in writing.';
      await this.streamText(`"${paraphrased}" `, onToken, signal);
      onToken({ type: 'quote', documentId: primaryDocId, text: paraphrased });
    }
  }

  private async streamText(
    text: string,
    onToken: (token: StreamToken) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const words = text.split(/(\s+)/);
    const delay = process.env.NODE_ENV === 'test' ? 1 : 15;
    for (const w of words) {
      if (signal?.aborted) {
        throw new Error('Streaming aborted by user');
      }
      onToken({ type: 'text', delta: w });
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  async summariseChanges(changes: any[]): Promise<string[]> {
    return changes.map((c) => `${c.type.toUpperCase()}: ${c.description || 'Clause modified'}`);
  }
}
