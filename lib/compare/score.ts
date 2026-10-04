import { ClauseDiff } from './align';

export type SignificanceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScoredDiff extends ClauseDiff {
  significance: SignificanceLevel;
  reasons: string[];
}

const HIGH_KEYWORDS = /liability|indemnify|indemnity|terminate|termination|governing law|jurisdiction|payment|fee|interest|penalty|default|breach|confidential/i;
const MEDIUM_KEYWORDS = /notice|party|parties|definition|defined|represent|warrant|assignment/i;
const MODAL_REGEX = /\b(shall|may|must|will|should|can)\b/i;
const NEGATION_REGEX = /\b(not|no|never|neither|nor|without)\b/i;
const NUMBER_REGEX = /\b(?:\$\s*)?\d+(?:,\d{3})*(?:\.\d+)?%?\b/g;

export function scoreSignificance(diff: ClauseDiff): ScoredDiff {
  const reasons: string[] = [];

  if (diff.type === 'unchanged') {
    return { ...diff, significance: 'LOW', reasons: ['No text changes'] };
  }

  const textA = diff.textA || '';
  const textB = diff.textB || '';

  // 1. Check numbers/amounts/percentages/currency changes
  const numsA = textA.match(NUMBER_REGEX) || [];
  const numsB = textB.match(NUMBER_REGEX) || [];
  if (JSON.stringify(numsA) !== JSON.stringify(numsB)) {
    reasons.push(`Number/amount changed (${numsA.join(', ') || 'none'} → ${numsB.join(', ') || 'none'})`);
  }

  // 2. Check modal flips (may -> shall -> must)
  const modalsA = Array.from(textA.matchAll(new RegExp(MODAL_REGEX, 'gi'))).map((m) => m[0].toLowerCase());
  const modalsB = Array.from(textB.matchAll(new RegExp(MODAL_REGEX, 'gi'))).map((m) => m[0].toLowerCase());
  if (JSON.stringify(modalsA) !== JSON.stringify(modalsB)) {
    reasons.push(`Modal flip detected (${modalsA.join('/')} → ${modalsB.join('/')})`);
  }

  // 3. Check negation added or removed
  const negA = NEGATION_REGEX.test(textA);
  const negB = NEGATION_REGEX.test(textB);
  if (negA !== negB) {
    reasons.push(negB ? 'Negation added' : 'Negation removed');
  }

  // 4. Check high risk subject matter
  const isHighDomain = HIGH_KEYWORDS.test(diff.title) || HIGH_KEYWORDS.test(textA) || HIGH_KEYWORDS.test(textB);
  if (isHighDomain && (diff.type === 'modified' || diff.type === 'added' || diff.type === 'removed')) {
    reasons.push('Core legal clause subject matter (liability/indemnity/termination/governing law)');
  }

  // Determine level
  let significance: SignificanceLevel = 'LOW';

  if (
    reasons.some((r) => r.includes('Number') || r.includes('Modal') || r.includes('Negation') || r.includes('Core legal clause')) ||
    (diff.type === 'removed' && isHighDomain)
  ) {
    significance = 'HIGH';
  } else {
    const isMediumDomain = MEDIUM_KEYWORDS.test(diff.title) || MEDIUM_KEYWORDS.test(textA) || MEDIUM_KEYWORDS.test(textB);
    if (isMediumDomain || diff.type === 'added' || diff.type === 'removed' || diff.type === 'moved') {
      significance = 'MEDIUM';
      if (reasons.length === 0) reasons.push('Structure or defined terms modified');
    } else {
      significance = 'LOW';
      if (reasons.length === 0) reasons.push('Wording-only change');
    }
  }

  return {
    ...diff,
    significance,
    reasons,
  };
}
