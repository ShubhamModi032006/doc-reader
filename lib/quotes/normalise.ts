export interface NormaliseResult {
  normalised: string;
  indexMap: number[];
}

export function normaliseText(raw: string): NormaliseResult {
  if (!raw) return { normalised: '', indexMap: [] };

  // 1. Unicode NFKC
  const nfkc = raw.normalize('NFKC');

  const charArray: string[] = [];
  const indexMap: number[] = [];

  let i = 0;
  while (i < nfkc.length) {
    const char = nfkc[i];

    // Check zero-width chars and soft hyphens
    if (
      char === '\u00AD' ||
      char === '\u200B' ||
      char === '\u200C' ||
      char === '\u200D' ||
      char === '\uFEFF'
    ) {
      i++;
      continue;
    }

    // Check hyphenated line breaks: letter + '-' + newline(s)/spaces + letter
    if (
      char === '-' &&
      i > 0 &&
      /[a-zA-Z]/.test(nfkc[i - 1]) &&
      i + 1 < nfkc.length
    ) {
      let j = i + 1;
      while (j < nfkc.length && /[\r\n\s]/.test(nfkc[j])) {
        j++;
      }
      if (j < nfkc.length && /[a-zA-Z]/.test(nfkc[j])) {
        // Skip the hyphen and all whitespace up to next letter
        i = j;
        continue;
      }
    }

    // Whitespace collapsing (space, newline, tab, NBSP)
    if (/[\s\u00A0\r\n\t]/.test(char)) {
      const startIdx = i;
      while (i < nfkc.length && /[\s\u00A0\r\n\t]/.test(nfkc[i])) {
        i++;
      }
      charArray.push(' ');
      indexMap.push(startIdx);
      continue;
    }

    // Smart quotes and dashes normalization
    let cleanChar = char;
    if (char === '“' || char === '”' || char === '″') cleanChar = '"';
    else if (char === '‘' || char === '’' || char === '′') cleanChar = "'";
    else if (char === '—' || char === '–') cleanChar = '-';

    charArray.push(cleanChar.toLowerCase());
    indexMap.push(i);
    i++;
  }

  return {
    normalised: charArray.join(''),
    indexMap,
  };
}
