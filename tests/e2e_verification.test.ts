import { describe, it, expect, vi } from 'vitest';
import { QuoteParser } from '../lib/llm/quoteParser';
import { verifyQuote } from '../lib/quotes/verify';

describe('End-to-End Verification with Groq Output', () => {
  it('marks invented quote from Groq as unverified', async () => {
    const docText = 'Section 1. Payment Terms. The Client shall pay all invoices within 30 days of receipt.';
    const docMap = { D1: 'doc-123' };

    const parser = new QuoteParser({ docMap });
    const rawQuotes: Array<{ documentId: string | null; text: string }> = [];

    // Mocked Groq response containing an invented quote and a real quote
    const mockedGroqResponse = 'According to the agreement <quote doc="D1">The penalty for late payment shall be 1,000,000 USD</quote>, payment is required.';

    parser.feed(mockedGroqResponse, (token) => {
      if (token.type === 'quote') {
        rawQuotes.push({ documentId: token.documentId, text: token.text });
      }
    });
    parser.flush((token) => {
      if (token.type === 'quote') {
        rawQuotes.push({ documentId: token.documentId, text: token.text });
      }
    });

    expect(rawQuotes.length).toBe(1);
    expect(rawQuotes[0].text).toBe('The penalty for late payment shall be 1,000,000 USD');

    // Verification step (same as in route.ts)
    const verificationResult = verifyQuote(rawQuotes[0].text, docText, [], 'doc-123');

    expect(verificationResult.status).toBe('unverified');
    expect(verificationResult.similarity).toBeLessThan(0.7);
    expect(verificationResult.occurrences.length).toBe(0);
  });

  it('marks exact quote from Groq as verified', async () => {
    const docText = 'Section 1. Payment Terms. The Client shall pay all invoices within 30 days of receipt.';
    const docMap = { D1: 'doc-123' };

    const parser = new QuoteParser({ docMap });
    const rawQuotes: Array<{ documentId: string | null; text: string }> = [];

    const mockedGroqResponse = 'As stated in the clause, <quote doc="D1">The Client shall pay all invoices within 30 days of receipt.</quote>';

    parser.feed(mockedGroqResponse, (token) => {
      if (token.type === 'quote') {
        rawQuotes.push({ documentId: token.documentId, text: token.text });
      }
    });
    parser.flush((token) => {
      if (token.type === 'quote') {
        rawQuotes.push({ documentId: token.documentId, text: token.text });
      }
    });

    expect(rawQuotes.length).toBe(1);
    const verificationResult = verifyQuote(rawQuotes[0].text, docText, [], 'doc-123');

    expect(verificationResult.status).toBe('verified');
    expect(verificationResult.occurrences.length).toBeGreaterThan(0);
  });
});
