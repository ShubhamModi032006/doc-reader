import { ScoredDiff } from './score';
import { getLLMProvider } from '../llm';

export interface CompareSummaryResult {
  totalChanges: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  overviewBanner: string;
  diffs: Array<ScoredDiff & { summary: string }>;
}

export function summariseDiffs(scoredDiffs: ScoredDiff[]): CompareSummaryResult {
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  const diffsWithSummaries = scoredDiffs.map((d) => {
    let summary = '';

    if (d.type === 'unchanged') {
      summary = 'Unchanged';
    } else if (d.type === 'added') {
      summary = `New clause added: "${d.title}"`;
      mediumCount++;
    } else if (d.type === 'removed') {
      summary = `Clause removed: "${d.title}"`;
      if (d.significance === 'HIGH') highCount++;
      else mediumCount++;
    } else if (d.type === 'moved') {
      summary = `Clause "${d.title}" was renumbered or moved`;
      mediumCount++;
    } else {
      // Modified
      if (d.significance === 'HIGH') highCount++;
      else if (d.significance === 'MEDIUM') mediumCount++;
      else lowCount++;

      const numsA = d.textA?.match(/\b(?:\$\s*|AED\s*)?\d+(?:,\d{3})*(?:\.\d+)?%?\b/g) || [];
      const numsB = d.textB?.match(/\b(?:\$\s*|AED\s*)?\d+(?:,\d{3})*(?:\.\d+)?%?\b/g) || [];

      // Find first differing number pair
      let changedPair: { from: string; to: string } | undefined = undefined;
      const maxLen = Math.max(numsA.length, numsB.length);
      for (let i = 0; i < maxLen; i++) {
        if (numsA[i] !== numsB[i]) {
          changedPair = { from: numsA[i] || 'none', to: numsB[i] || 'none' };
          break;
        }
      }

      if (changedPair) {
        summary = `${d.title} changed from ${changedPair.from} to ${changedPair.to}`;
      } else if (d.reasons.some((r) => r.includes('Modal'))) {
        summary = `${d.title} obligation level changed (${d.reasons.find((r) => r.includes('Modal'))})`;
      } else if (d.reasons.some((r) => r.includes('Negation'))) {
        summary = `${d.title} condition negated/reversed (${d.reasons.find((r) => r.includes('Negation'))})`;
      } else {
        summary = `${d.title}: Wording change only`;
      }
    }

    return { ...d, summary };
  });

  const totalChanges = highCount + mediumCount + lowCount;
  const overviewBanner = `${totalChanges} change${totalChanges === 1 ? '' : 's'}: ${highCount} high, ${mediumCount} medium, ${lowCount} low`;

  return {
    totalChanges,
    highCount,
    mediumCount,
    lowCount,
    overviewBanner,
    diffs: diffsWithSummaries,
  };
}

export async function summariseDiffsWithLLM(scoredDiffs: ScoredDiff[]): Promise<CompareSummaryResult> {
  const base = summariseDiffs(scoredDiffs);
  const provider = getLLMProvider();

  if (!provider.summariseChanges) return base;

  const changedDiffs = base.diffs.filter((d) => d.type !== 'unchanged');
  if (changedDiffs.length === 0) return base;

  try {
    const aiSummaries = await provider.summariseChanges(changedDiffs);
    let aiIdx = 0;
    const updatedDiffs = base.diffs.map((d) => {
      if (d.type === 'unchanged') return d;
      const aiSummary = aiSummaries[aiIdx++];
      return {
        ...d,
        summary: aiSummary || d.summary,
      };
    });
    return { ...base, diffs: updatedDiffs };
  } catch (e) {
    return base;
  }
}
