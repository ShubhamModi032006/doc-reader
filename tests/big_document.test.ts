import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { runPythonScript } from '../lib/extract/runPython';
import { createChunksFromText } from '../lib/chunk/chunker';

describe('150-Page Large Document Processing', () => {
  it('extracts and chunks 150-page PDF fixture correctly', async () => {
    const pdfPath = path.join(process.cwd(), 'fixtures', 'big_contract.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const result = await runPythonScript('extract_pdf.py', [pdfPath]);
    expect(result.page_count).toBe(150);
    expect(result.is_scanned).toBe(false);
    expect(result.pages.length).toBe(150);

    const chunks = createChunksFromText(result.pages);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[chunks.length - 1].endPage).toBe(150);
  });

  it('extracts and chunks 150-page DOCX fixture correctly', async () => {
    const docxPath = path.join(process.cwd(), 'fixtures', 'big_contract.docx');
    expect(fs.existsSync(docxPath)).toBe(true);

    const result = await runPythonScript('extract_docx.py', [docxPath]);
    expect(result.page_count).toBeGreaterThan(0);
    expect(result.full_text).toContain('Master Services Provision');
  });
});
