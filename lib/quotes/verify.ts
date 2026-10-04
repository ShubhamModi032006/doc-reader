import { normaliseText } from './normalise';

export interface QuoteOccurrence {
  startChar: number;
  endChar: number;
  pageNumbers: number[];
  matchedText: string;
}

export interface VerifiedQuoteResult {
  quoteText: string;
  documentId?: string;
  status: 'verified' | 'approximate' | 'unverified' | 'too_short';
  similarity: number;
  occurrences: QuoteOccurrence[];
  message?: string;
}

export interface PageOffsetMap {
  pageNumber: number;
  startChar: number;
  endChar: number;
}

export function computePageOffsetMaps(
  pages: Array<{ page_number: number; text: string }>
): { fullText: string; pageMaps: PageOffsetMap[] } {
  let fullText = '';
  const pageMaps: PageOffsetMap[] = [];

  for (const p of pages) {
    const startChar = fullText.length;
    fullText += (fullText ? '\n\n' : '') + p.text;
    const endChar = fullText.length;
    pageMaps.push({ pageNumber: p.page_number, startChar, endChar });
  }

  return { fullText, pageMaps };
}

export function findPagesForOffsetRange(
  startChar: number,
  endChar: number,
  pageMaps: PageOffsetMap[]
): number[] {
  const pages: number[] = [];
  for (const pm of pageMaps) {
    if (startChar <= pm.endChar && endChar >= pm.startChar) {
      pages.push(pm.pageNumber);
    }
  }
  return pages.length > 0 ? pages : [1];
}

// Calculate similarity ratio using Bigrams / Jaccard
function calcSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }

  const totalBigrams = (s1.length - 1) + (s2.length - 1);
  return (2.0 * intersection) / totalBigrams;
}

export function verifyQuote(
  quoteText: string,
  rawDocumentText: string,
  pageMaps: PageOffsetMap[] = [],
  documentId?: string
): VerifiedQuoteResult {
  const words = quoteText.trim().split(/\s+/).filter(Boolean);

  if (words.length < 5) {
    return {
      quoteText,
      documentId,
      status: 'too_short',
      similarity: 0,
      occurrences: [],
      message: 'Too short to verify (< 5 words)',
    };
  }

  const normQuote = normaliseText(quoteText);
  const normDoc = normaliseText(rawDocumentText);

  if (!normQuote.normalised || !normDoc.normalised) {
    return {
      quoteText,
      documentId,
      status: 'unverified',
      similarity: 0,
      occurrences: [],
      message: 'Unverified - empty quote or document text',
    };
  }

  const occurrences: QuoteOccurrence[] = [];
  let pos = 0;

  // Search exact occurrences in normalised text
  while ((pos = normDoc.normalised.indexOf(normQuote.normalised, pos)) !== -1) {
    const startNormIdx = pos;
    const endNormIdx = pos + normQuote.normalised.length - 1;

    const startChar = normDoc.indexMap[startNormIdx] ?? 0;
    // Include full character of endNormIdx
    const nextNormIdx = endNormIdx + 1 < normDoc.indexMap.length ? normDoc.indexMap[endNormIdx + 1] : rawDocumentText.length;
    const endChar = Math.min(rawDocumentText.length, nextNormIdx);

    const pages = findPagesForOffsetRange(startChar, endChar, pageMaps);
    const matchedText = rawDocumentText.substring(startChar, endChar);

    occurrences.push({
      startChar,
      endChar,
      pageNumbers: pages,
      matchedText,
    });

    pos += Math.max(1, normQuote.normalised.length);
  }

  if (occurrences.length > 0) {
    return {
      quoteText,
      documentId,
      status: 'verified',
      similarity: 1.0,
      occurrences,
      message: `Verified (${occurrences.length} match${occurrences.length > 1 ? 'es' : ''})`,
    };
  }

  // Sliding window conservative fuzzy match (similarity >= 0.95)
  const windowLen = normQuote.normalised.length;
  let bestSim = 0;
  let bestPos = -1;

  for (let i = 0; i <= normDoc.normalised.length - windowLen; i += 3) {
    const windowText = normDoc.normalised.substring(i, i + windowLen);
    const sim = calcSimilarity(normQuote.normalised, windowText);
    if (sim > bestSim) {
      bestSim = sim;
      bestPos = i;
    }
  }

  if (bestSim >= 0.95 && bestPos !== -1) {
    const startChar = normDoc.indexMap[bestPos] ?? 0;
    const endChar = normDoc.indexMap[bestPos + windowLen - 1] ?? rawDocumentText.length;
    const pages = findPagesForOffsetRange(startChar, endChar, pageMaps);

    return {
      quoteText,
      documentId,
      status: 'approximate',
      similarity: Math.round(bestSim * 100) / 100,
      occurrences: [
        {
          startChar,
          endChar,
          pageNumbers: pages,
          matchedText: rawDocumentText.substring(startChar, endChar),
        },
      ],
      message: 'Approximate match',
    };
  }

  return {
    quoteText,
    documentId,
    status: 'unverified',
    similarity: 0,
    occurrences: [],
    message: 'Unverified - not found in document',
  };
}
