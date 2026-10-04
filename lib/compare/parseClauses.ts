export interface ClauseItem {
  id: string;
  number?: string;
  title?: string;
  text: string;
}

export function parseClauses(fullText: string): ClauseItem[] {
  if (!fullText || !fullText.trim()) return [];

  // Match clause headers like "Section 1. Title", "Article 2", "1.1 Title", "12. Definitions"
  const regex = /(?:^|\n)(?=(?:Section|Article|\d+(?:\.\d+)*)\b)/gi;
  const rawSections = fullText.split(regex).map((s) => s.trim()).filter(Boolean);

  const clauses: ClauseItem[] = [];

  rawSections.forEach((sec, idx) => {
    const lines = sec.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || '';

    let clauseNumber: string | undefined = undefined;
    let title: string | undefined = undefined;

    const match = firstLine.match(/^(?:Section|Article)?\s*(\d+(?:\.\d+)*)[:.]?\s*(.*)$/i);
    if (match) {
      clauseNumber = match[1];
      title = match[2] || undefined;
    } else if (firstLine.length < 60) {
      title = firstLine;
    }

    clauses.push({
      id: `clause-${idx + 1}`,
      number: clauseNumber,
      title: title || (clauseNumber ? `Clause ${clauseNumber}` : `Section ${idx + 1}`),
      text: sec,
    });
  });

  return clauses;
}
