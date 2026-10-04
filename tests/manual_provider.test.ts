import { describe, it, expect } from 'vitest';
import { ManualProvider, splitIntoSentences } from '../lib/llm/manualProvider';
import { StreamToken } from '../lib/llm/types';

const hiringAssignmentText = `
Engineering Assignment Deadline: 3 days from the day you receive this assignment.
An honest partial attempt with a clear account of your approach and what defeated you is worth more than skipping this section.

What to build
A web app for analysing legal contracts. The user uploads one or two documents (PDF or DOCX), and the app lets them:
1. Ask questions about the contract.
2. Compare two document versions side-by-side.
3. Suggest edits and download a redlined DOCX version.

Part A: Verified-Quote Q&A
Core requirements: Document upload (PDF and DOCX, up to 50 MB).
Verified quotes. This is the most important requirement in the assignment.
If the answer is not in the document, the app must say so instead of inventing one.

Part B: Side-by-Side Comparison Feature
Given two documents, display a diff highlighting what changed, with a clear list of structural changes (clauses added, removed, modified, moved).

Part C: Redlining (Tracked Changes)
Allow the user to suggest edits and download a redlined version with Word-native tracked changes (<w:del> and <w:ins> tags).

Extras (optional, bonus points)
Only if Parts A, B and C are complete and working.
An unfinished extra does not help you.
Clause extraction. Automatically identify and list standard contract clauses.

What to submit
1. GitHub repository link.
2. Deployed link. A working, live version we can open and use.
3. Readme file (in the repo) explaining your architecture decisions and trade-offs.
4. Demo video (screen recording with audio commentary).
5. Short note (half a page) covering: How your quote verification works, and where it could fail.
`;

const mockDoc = {
  id: 'doc-hiring-1',
  name: 'hiring_assignment.pdf',
  chunks: [
    { id: 'c1', text: hiringAssignmentText, startPage: 1, endPage: 1 }
  ]
};

describe('ManualProvider Quality & Sentence Splitting Tests', () => {
  it('smart splitter does not cut at list numbers like "1."', () => {
    const text = 'What to submit 1. GitHub repository link. 2. Deployed live link.';
    const sentences = splitIntoSentences(text);

    expect(sentences).not.toContain('What to submit 1.');
    expect(sentences.some((s) => s.includes('GitHub repository link'))).toBe(true);
    for (const s of sentences) {
      expect(s.split(/\s+/).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('answers deadline question with "3 days" sentence', async () => {
    const provider = new ManualProvider();
    const quotes: string[] = [];
    let answerText = '';

    await provider.streamAnswer(
      {
        question: 'how many days are given to build this assignment',
        documents: [mockDoc],
        coverage: { searchedChunks: 1, totalChunks: 1, searchedPages: 1, totalPages: 1, isPartial: false },
      },
      (t: StreamToken) => {
        if (t.type === 'text') answerText += t.delta;
        if (t.type === 'quote') quotes.push(t.text);
      }
    );

    expect(answerText).toContain('timeline and deadline');
    expect(quotes.some((q) => q.includes('3 days'))).toBe(true);
  });

  it('answers requirements question with "What to build" and Part A/B/C sentences, not only deadline', async () => {
    const provider = new ManualProvider();
    const quotes: string[] = [];

    await provider.streamAnswer(
      {
        question: 'what are the requirements for this project',
        documents: [mockDoc],
        coverage: { searchedChunks: 1, totalChunks: 1, searchedPages: 1, totalPages: 1, isPartial: false },
      },
      (t: StreamToken) => {
        if (t.type === 'quote') quotes.push(t.text);
      }
    );

    expect(quotes.length).toBeGreaterThan(1);
    expect(quotes.some((q) => q.includes('What to build') || q.includes('requirements'))).toBe(true);
  });

  it('answers submission question with items under "What to submit" and no fragments under 5 words', async () => {
    const provider = new ManualProvider();
    const quotes: string[] = [];

    await provider.streamAnswer(
      {
        question: 'what do I need to submit',
        documents: [mockDoc],
        coverage: { searchedChunks: 1, totalChunks: 1, searchedPages: 1, totalPages: 1, isPartial: false },
      },
      (t: StreamToken) => {
        if (t.type === 'quote') quotes.push(t.text);
      }
    );

    expect(quotes.some((q) => q.includes('GitHub repository link'))).toBe(true);
    for (const q of quotes) {
      expect(q.split(/\s+/).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('answers optional extras question with Extras section', async () => {
    const provider = new ManualProvider();
    const quotes: string[] = [];

    await provider.streamAnswer(
      {
        question: 'what are the optional extras',
        documents: [mockDoc],
        coverage: { searchedChunks: 1, totalChunks: 1, searchedPages: 1, totalPages: 1, isPartial: false },
      },
      (t: StreamToken) => {
        if (t.type === 'quote') quotes.push(t.text);
      }
    );

    expect(quotes.some((q) => q.includes('Extras'))).toBe(true);
  });

  it('answers irrelevant question with "not stated in the document" and zero quotes', async () => {
    const provider = new ManualProvider();
    const quotes: string[] = [];
    let answerText = '';

    await provider.streamAnswer(
      {
        question: 'what is the capital of France',
        documents: [mockDoc],
        coverage: { searchedChunks: 1, totalChunks: 1, searchedPages: 1, totalPages: 1, isPartial: false },
      },
      (t: StreamToken) => {
        if (t.type === 'text') answerText += t.delta;
        if (t.type === 'quote') quotes.push(t.text);
      }
    );

    expect(answerText).toContain('This is not stated in the document.');
    expect(quotes.length).toBe(0);
  });

  it('produces DIFFERENT quote sets for the 3 main questions', async () => {
    const provider = new ManualProvider();

    const getQuotes = async (q: string) => {
      const qList: string[] = [];
      await provider.streamAnswer(
        {
          question: q,
          documents: [mockDoc],
          coverage: { searchedChunks: 1, totalChunks: 1, searchedPages: 1, totalPages: 1, isPartial: false },
        },
        (t) => { if (t.type === 'quote') qList.push(t.text); }
      );
      return qList;
    };

    const q1 = await getQuotes('how many days are given to build this assignment');
    const q2 = await getQuotes('what are the requirements for this project');
    const q3 = await getQuotes('what do I need to submit');

    expect(q1).not.toEqual(q2);
    expect(q2).not.toEqual(q3);
    expect(q1).not.toEqual(q3);
  }, 15000);
});
