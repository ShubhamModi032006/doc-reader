import { describe, it, expect } from 'vitest';
import { createChunksFromText } from '../lib/chunk/chunker';

describe('Chunker Logic', () => {
  it('chunks text cleanly into sections and headings', () => {
    const pages = [
      { page_number: 1, text: 'Section 1. Definitions\n\n1.1 Confidential Information means all proprietary code and documentation.' },
      { page_number: 2, text: 'Section 2. Obligations\n\n2.1 The Recipient shall maintain strict confidentiality.' }
    ];

    const chunks = createChunksFromText(pages, 500, 50);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[chunks.length - 1].endPage).toBe(2);
    expect(chunks.some((c) => c.text.includes('Confidential Information'))).toBe(true);
  });
});
