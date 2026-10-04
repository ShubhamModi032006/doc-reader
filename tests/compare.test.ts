import { describe, it, expect } from 'vitest';
import { parseClauses } from '../lib/compare/parseClauses';
import { alignClauses } from '../lib/compare/align';
import { scoreSignificance } from '../lib/compare/score';
import { summariseDiffs } from '../lib/compare/summarise';

describe('Document Comparison Pipeline', () => {
  it('detects number/amount change (cap 100,000 -> 1,000,000) as HIGH significance', () => {
    const textA = 'Section 5. Liability Cap\n\nThe total aggregate liability shall not exceed AED 100,000 under any circumstances.';
    const textB = 'Section 5. Liability Cap\n\nThe total aggregate liability shall not exceed AED 1,000,000 under any circumstances.';

    const clausesA = parseClauses(textA);
    const clausesB = parseClauses(textB);
    const aligned = alignClauses(clausesA, clausesB);
    const scored = aligned.map(scoreSignificance);
    const summary = summariseDiffs(scored);

    expect(aligned[0].type).toBe('modified');
    expect(scored[0].significance).toBe('HIGH');
    expect(summary.diffs[0].summary).toContain('100,000 to AED 1,000,000');
  });

  it('detects modal flip (may -> shall) as HIGH significance', () => {
    const textA = 'Section 3. Audit Rights\n\nThe Client may inspect the financial books once per year.';
    const textB = 'Section 3. Audit Rights\n\nThe Client shall inspect the financial books once per year.';

    const clausesA = parseClauses(textA);
    const clausesB = parseClauses(textB);
    const aligned = alignClauses(clausesA, clausesB);
    const scored = aligned.map(scoreSignificance);

    expect(scored[0].significance).toBe('HIGH');
    expect(scored[0].reasons.some((r) => r.includes('Modal'))).toBe(true);
  });

  it('detects clause removal', () => {
    const textA = 'Section 1. Scope\n\nScope of work.\n\nSection 2. Governing Law\n\nThis contract is governed by English law.';
    const textB = 'Section 1. Scope\n\nScope of work.';

    const clausesA = parseClauses(textA);
    const clausesB = parseClauses(textB);
    const aligned = alignClauses(clausesA, clausesB);

    const removed = aligned.find((d) => d.type === 'removed');
    expect(removed).toBeDefined();
    expect(removed?.title).toContain('Governing Law');
  });

  it('detects clause addition', () => {
    const textA = 'Section 1. Scope\n\nScope of work.';
    const textB = 'Section 1. Scope\n\nScope of work.\n\nSection 2. Non-Compete\n\nParty B agrees not to compete for two years.';

    const clausesA = parseClauses(textA);
    const clausesB = parseClauses(textB);
    const aligned = alignClauses(clausesA, clausesB);

    const added = aligned.find((d) => d.type === 'added');
    expect(added).toBeDefined();
    expect(added?.title).toContain('Non-Compete');
  });

  it('labels pure rewording as Wording change only', () => {
    const textA = 'Section 4. Notices\n\nAll notices must be delivered by courier.';
    const textB = 'Section 4. Notices\n\nAll formal notices must be sent via registered courier.';

    const clausesA = parseClauses(textA);
    const clausesB = parseClauses(textB);
    const aligned = alignClauses(clausesA, clausesB);
    const scored = aligned.map(scoreSignificance);
    const summary = summariseDiffs(scored);

    expect(summary.diffs[0].summary).toContain('Wording change only');
  });
});
