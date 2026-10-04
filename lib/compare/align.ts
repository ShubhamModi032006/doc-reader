import { ClauseItem } from './parseClauses';

export interface ClauseDiff {
  id: string;
  clauseNumber?: string;
  title: string;
  type: 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';
  textA?: string;
  textB?: string;
  similarity: number;
}

export function calcTokenJaccard(t1: string, t2: string): number {
  if (t1 === t2) return 1.0;
  const set1 = new Set(t1.toLowerCase().split(/\W+/).filter(Boolean));
  const set2 = new Set(t2.toLowerCase().split(/\W+/).filter(Boolean));

  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  set1.forEach((w) => {
    if (set2.has(w)) intersection++;
  });

  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

export function alignClauses(clausesA: ClauseItem[], clausesB: ClauseItem[]): ClauseDiff[] {
  const result: ClauseDiff[] = [];
  const usedB = new Set<string>();

  for (let idxA = 0; idxA < clausesA.length; idxA++) {
    const cA = clausesA[idxA];

    // First try exact clause number match
    let matchB = cA.number
      ? clausesB.find((cB) => !usedB.has(cB.id) && cB.number === cA.number)
      : undefined;
    let idxB = matchB ? clausesB.indexOf(matchB) : -1;

    // Fallback to highest text similarity match
    if (!matchB) {
      let bestSim = 0;
      let bestIdx = -1;

      for (let i = 0; i < clausesB.length; i++) {
        if (usedB.has(clausesB[i].id)) continue;
        const sim = calcTokenJaccard(cA.text, clausesB[i].text);
        if (sim > bestSim && sim >= 0.3) {
          bestSim = sim;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        matchB = clausesB[bestIdx];
        idxB = bestIdx;
      }
    }

    if (matchB) {
      usedB.add(matchB.id);
      const sim = calcTokenJaccard(cA.text, matchB.text);
      const isMoved = idxA !== idxB && cA.number !== matchB.number;

      let type: ClauseDiff['type'] = 'unchanged';
      if (sim < 0.99) {
        type = isMoved ? 'moved' : 'modified';
      } else if (isMoved) {
        type = 'moved';
      }

      result.push({
        id: `diff-${result.length + 1}`,
        clauseNumber: cA.number || matchB.number,
        title: cA.title || matchB.title || 'Clause',
        type,
        textA: cA.text,
        textB: matchB.text,
        similarity: sim,
      });
    } else {
      // Removed in B
      result.push({
        id: `diff-${result.length + 1}`,
        clauseNumber: cA.number,
        title: cA.title || 'Clause',
        type: 'removed',
        textA: cA.text,
        similarity: 0,
      });
    }
  }

  // Any remaining unmatched clauses in B are Added
  for (const cB of clausesB) {
    if (!usedB.has(cB.id)) {
      result.push({
        id: `diff-${result.length + 1}`,
        clauseNumber: cB.number,
        title: cB.title || 'Clause',
        type: 'added',
        textB: cB.text,
        similarity: 0,
      });
    }
  }

  return result;
}
