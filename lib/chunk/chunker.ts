export interface ChunkInput {
  text: string;
  heading?: string;
  startPage: number;
  endPage: number;
  startChar: number;
  endChar: number;
}

export interface DocumentPageInput {
  page_number: number;
  text: string;
}

export function createChunksFromText(
  pages: DocumentPageInput[],
  targetChunkChars = 1200,
  overlapChars = 150
): ChunkInput[] {
  let fullText = '';
  const pageOffsets: { pageNumber: number; startChar: number; endChar: number }[] = [];

  for (const page of pages) {
    const pageStart = fullText.length;
    fullText += (fullText ? '\n\n' : '') + page.text;
    const pageEnd = fullText.length;
    pageOffsets.push({ pageNumber: page.page_number, startChar: pageStart, endChar: pageEnd });
  }

  if (!fullText.trim()) return [];

  function getPageForOffset(offset: number): number {
    for (const p of pageOffsets) {
      if (offset >= p.startChar && offset <= p.endChar) {
        return p.pageNumber;
      }
    }
    return pageOffsets[pageOffsets.length - 1]?.pageNumber || 1;
  }

  // Split by paragraph breaks or heading patterns
  const sectionSplitter = /(?:\n{2,}|\n(?=(?:Section|Article|Part|What to|Evaluation|Submission|Deadline|Rule|Note|\d+[\.\)])\b))/i;

  const rawBlocks = fullText.split(sectionSplitter);
  const sections: { text: string; startChar: number; endChar: number }[] = [];

  let searchIndex = 0;
  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const startPos = fullText.indexOf(trimmed, searchIndex);
    const actualStart = startPos !== -1 ? startPos : searchIndex;
    const actualEnd = actualStart + trimmed.length;
    searchIndex = actualEnd;

    sections.push({ text: trimmed, startChar: actualStart, endChar: actualEnd });
  }

  const rawChunks: { text: string; startChar: number; endChar: number }[] = [];
  let currentBuffer = '';
  let bufferStart = 0;
  let bufferEnd = 0;

  for (const sec of sections) {
    if (!currentBuffer) {
      currentBuffer = sec.text;
      bufferStart = sec.startChar;
      bufferEnd = sec.endChar;
    } else if (currentBuffer.length + sec.text.length + 2 <= targetChunkChars) {
      currentBuffer += '\n\n' + sec.text;
      bufferEnd = sec.endChar;
    } else {
      rawChunks.push({ text: currentBuffer, startChar: bufferStart, endChar: bufferEnd });
      currentBuffer = sec.text;
      bufferStart = sec.startChar;
      bufferEnd = sec.endChar;
    }
  }
  if (currentBuffer) {
    rawChunks.push({ text: currentBuffer, startChar: bufferStart, endChar: bufferEnd });
  }

  return rawChunks.map((c) => {
    const lines = c.text.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || '';
    const heading = firstLine.length < 100 && !firstLine.endsWith('.') ? firstLine : undefined;

    return {
      text: c.text,
      heading,
      startPage: getPageForOffset(c.startChar),
      endPage: getPageForOffset(c.endChar),
      startChar: c.startChar,
      endChar: c.endChar,
    };
  });
}
