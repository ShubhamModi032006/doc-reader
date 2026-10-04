import { describe, it, expect } from 'vitest';
import { normaliseText } from '../lib/quotes/normalise';
import { verifyQuote, computePageOffsetMaps } from '../lib/quotes/verify';

describe('Quote Normalisation & Verification', () => {
  it('normalises smart quotes, dashes, soft hyphens, and whitespace', () => {
    const raw = '“Hello—World!”\tThis is\u00A0a  test\u00ADwith smart’s quotes.';
    const res = normaliseText(raw);
    expect(res.normalised).toBe('"hello-world!" this is a testwith smart\'s quotes.');
  });

  it('verifies quote with extra spaces and line break mid-quote', () => {
    const rawDoc = 'This Agreement is entered into by and between Party A\nand Party B on January 1st, 2026.';
    const quote = 'This   Agreement is entered  into by and between Party A and Party B';
    const res = verifyQuote(quote, rawDoc);
    expect(res.status).toBe('verified');
    expect(res.occurrences.length).toBe(1);
  });

  it('verifies quote with hyphenation across line breaks', () => {
    const rawDoc = 'The recipient shall keep all confiden-\ntial information strictly secret.';
    const quote = 'keep all confidential information strictly secret';
    const res = verifyQuote(quote, rawDoc);
    expect(res.status).toBe('verified');
  });

  it('verifies quote with smart quotes', () => {
    const rawDoc = 'The term “Confidential Information” shall mean all proprietary technical data.';
    const quote = 'The term "Confidential Information" shall mean all proprietary technical data.';
    const res = verifyQuote(quote, rawDoc);
    expect(res.status).toBe('verified');
  });

  it('verifies quote across a page break', () => {
    const pages = [
      { page_number: 1, text: 'This Agreement shall remain in effect for five years' },
      { page_number: 2, text: 'unless terminated earlier by mutual written consent.' }
    ];
    const { fullText, pageMaps } = computePageOffsetMaps(pages);
    const quote = 'effect for five years unless terminated earlier by mutual';
    const res = verifyQuote(quote, fullText, pageMaps);
    expect(res.status).toBe('verified');
    expect(res.occurrences[0].pageNumbers).toEqual([1, 2]);
  });

  it('handles duplicate quote occurrences with 1 of N reporting', () => {
    const rawDoc = 'Party A agrees to pay. Party A agrees to pay. Section 5 states Party A agrees to pay.';
    const quote = 'Party A agrees to pay.';
    const res = verifyQuote(quote, rawDoc);
    expect(res.status).toBe('verified');
    expect(res.occurrences.length).toBe(3);
  });

  it('rejects invented quotes as unverified', () => {
    const rawDoc = 'The Recipient shall protect the disclosing party data.';
    const quote = 'The Recipient shall pay a penalty of one million dollars immediately upon breach.';
    const res = verifyQuote(quote, rawDoc);
    expect(res.status).toBe('unverified');
    expect(res.occurrences.length).toBe(0);
  });

  it('flags paraphrased quote as approximate or unverified', () => {
    const rawDoc = 'Neither party may assign this contract without prior written consent.';
    const quote = 'Neither party can transfer this agreement without previous written permission.';
    const res = verifyQuote(quote, rawDoc);
    expect(['approximate', 'unverified']).toContain(res.status);
  });

  it('flags quotes under 5 words as too_short', () => {
    const rawDoc = 'Party A agrees to pay.';
    const quote = 'Party A agrees';
    const res = verifyQuote(quote, rawDoc);
    expect(res.status).toBe('too_short');
    expect(res.message).toContain('Too short');
  });

  it('fails verification when quote from Doc A is checked against Doc B', () => {
    const docBText = 'This is Document B with unrelated governance provisions.';
    const quoteFromDocA = 'The indemnification limit under Section 10 shall be ten million dollars.';
    const res = verifyQuote(quoteFromDocA, docBText, [], 'doc-b-id');
    expect(res.status).toBe('unverified');
    expect(res.documentId).toBe('doc-b-id');
  });
});
