import { describe, it, expect } from 'vitest';
import { QuoteParser } from '../lib/llm/quoteParser';
import { StreamToken } from '../lib/llm/types';

describe('quoteParser', () => {
  const docMap = { D1: 'doc-id-1', D2: 'doc-id-2' };

  it('parses inline quotes and text correctly', () => {
    const parser = new QuoteParser({ docMap });
    const tokens: StreamToken[] = [];

    const input = 'According to <quote doc="D1">exact words from document</quote>, the fee is 10%.';
    parser.feed(input, (t) => tokens.push(t));
    parser.flush((t) => tokens.push(t));

    const textDeltas = tokens.filter((t) => t.type === 'text').map((t: any) => t.delta).join('');
    const quotes = tokens.filter((t) => t.type === 'quote');

    expect(textDeltas).toBe('According to , the fee is 10%.');
    expect(quotes).toEqual([
      { type: 'quote', documentId: 'doc-id-1', text: 'exact words from document' },
    ]);
  });

  it('handles tags split across stream chunks', () => {
    const parser = new QuoteParser({ docMap });
    const tokens: StreamToken[] = [];

    const chunks = [
      'According to <quo',
      'te doc="D1">exact words from ',
      'document</quot',
      'e>, the fee is 10%.',
    ];

    for (const chunk of chunks) {
      parser.feed(chunk, (t) => tokens.push(t));
    }
    parser.flush((t) => tokens.push(t));

    const textDeltas = tokens.filter((t) => t.type === 'text').map((t: any) => t.delta).join('');
    const quotes = tokens.filter((t) => t.type === 'quote');

    expect(textDeltas).toBe('According to , the fee is 10%.');
    expect(quotes).toEqual([
      { type: 'quote', documentId: 'doc-id-1', text: 'exact words from document' },
    ]);
  });

  it('handles unknown document label with documentId null', () => {
    const parser = new QuoteParser({ docMap });
    const tokens: StreamToken[] = [];

    const input = 'See <quote doc="D99">invented label quote</quote> for details.';
    parser.feed(input, (t) => tokens.push(t));
    parser.flush((t) => tokens.push(t));

    const quotes = tokens.filter((t) => t.type === 'quote');
    expect(quotes).toEqual([
      { type: 'quote', documentId: null, text: 'invented label quote' },
    ]);
  });

  it('handles nested or garbled tags gracefully', () => {
    const parser = new QuoteParser({ docMap });
    const tokens: StreamToken[] = [];

    const input = 'Check <quote doc="D1">first <quote doc="D2">nested</quote> quote</quote>.';
    parser.feed(input, (t) => tokens.push(t));
    parser.flush((t) => tokens.push(t));

    const quotes = tokens.filter((t) => t.type === 'quote');
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes[0].text).toContain('nested');
  });

  it('handles unclosed tag at the end of stream', () => {
    const parser = new QuoteParser({ docMap });
    const tokens: StreamToken[] = [];

    const input = 'According to <quote doc="D1">unclosed quote text';
    parser.feed(input, (t) => tokens.push(t));
    parser.flush((t) => tokens.push(t));

    const quotes = tokens.filter((t) => t.type === 'quote');
    expect(quotes).toEqual([
      { type: 'quote', documentId: 'doc-id-1', text: 'unclosed quote text' },
    ]);
  });

  it('handles NOT_FOUND for full and partial coverage', () => {
    // Full coverage
    const parserFull = new QuoteParser({ docMap, isPartialCoverage: false });
    const tokensFull: StreamToken[] = [];
    parserFull.feed('NOT_FOUND', (t) => tokensFull.push(t));
    parserFull.flush((t) => tokensFull.push(t));
    expect(tokensFull).toEqual([
      { type: 'text', delta: 'This is not stated in the document.' },
    ]);

    // Partial coverage
    const parserPartial = new QuoteParser({ docMap, isPartialCoverage: true });
    const tokensPartial: StreamToken[] = [];
    parserPartial.feed('NOT_FOUND', (t) => tokensPartial.push(t));
    parserPartial.flush((t) => tokensPartial.push(t));
    expect(tokensPartial).toEqual([
      { type: 'text', delta: 'Not found in the sections reviewed.' },
    ]);
  });
});
