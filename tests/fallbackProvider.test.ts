import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackProvider } from '../lib/llm/fallbackProvider';
import { ManualProvider } from '../lib/llm/manualProvider';
import { LLMProvider, StreamAnswerParams, StreamToken } from '../lib/llm/types';
import { AuthError, ServerError } from '../lib/llm/errors';

describe('fallbackProvider', () => {
  let mockPrimary: LLMProvider;
  let manualProvider: ManualProvider;

  beforeEach(() => {
    mockPrimary = {
      streamAnswer: vi.fn(),
    };
    manualProvider = new ManualProvider();
  });

  it('falls back to manual provider before first token on error', async () => {
    (mockPrimary.streamAnswer as any).mockRejectedValue(new AuthError('Invalid key'));

    const fallback = new FallbackProvider(mockPrimary, manualProvider);
    const tokens: StreamToken[] = [];
    let metaResult: any = null;

    const params: StreamAnswerParams = {
      question: 'Test question',
      documents: [],
      coverage: { searchedChunks: 0, totalChunks: 0, searchedPages: 0, totalPages: 0, isPartial: false },
      onMeta: (meta) => { metaResult = meta; },
    };

    await fallback.streamAnswer(params, (t) => tokens.push(t));

    expect(metaResult).toEqual({
      providerUsed: 'manual',
      fallbackReason: 'AI key missing or invalid',
    });
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('does NOT fall back mid-stream after text started', async () => {
    (mockPrimary.streamAnswer as any).mockImplementation(async (_params: any, onToken: any) => {
      onToken({ type: 'text', delta: 'Partial AI response ' });
      throw new ServerError('Mid-stream crash');
    });

    const fallback = new FallbackProvider(mockPrimary, manualProvider);
    const tokens: StreamToken[] = [];

    const params: StreamAnswerParams = {
      question: 'Test question',
      documents: [],
      coverage: { searchedChunks: 0, totalChunks: 0, searchedPages: 0, totalPages: 0, isPartial: false },
    };

    await expect(fallback.streamAnswer(params, (t) => tokens.push(t))).rejects.toThrow('Stream interrupted');
    expect(tokens).toEqual([{ type: 'text', delta: 'Partial AI response ' }]);
  });

  it('does NOT fall back on user Stop AbortSignal', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    (mockPrimary.streamAnswer as any).mockRejectedValue(abortErr);

    const controller = new AbortController();
    controller.abort();

    const fallback = new FallbackProvider(mockPrimary, manualProvider);
    const tokens: StreamToken[] = [];

    const params: StreamAnswerParams = {
      question: 'Test question',
      documents: [],
      coverage: { searchedChunks: 0, totalChunks: 0, searchedPages: 0, totalPages: 0, isPartial: false },
      signal: controller.signal,
    };

    await expect(fallback.streamAnswer(params, (t) => tokens.push(t))).rejects.toThrow(abortErr);
    expect(tokens).toEqual([]);
  });

  it('opens circuit breaker after 3 consecutive failures', async () => {
    (mockPrimary.streamAnswer as any).mockRejectedValue(new ServerError('Server down'));

    const fallback = new FallbackProvider(mockPrimary, manualProvider);
    const dummyParams: StreamAnswerParams = {
      question: 'Test',
      documents: [],
      coverage: { searchedChunks: 0, totalChunks: 0, searchedPages: 0, totalPages: 0, isPartial: false },
    };

    // 3 failures
    await fallback.streamAnswer(dummyParams, () => {});
    await fallback.streamAnswer(dummyParams, () => {});
    await fallback.streamAnswer(dummyParams, () => {});

    expect(mockPrimary.streamAnswer).toHaveBeenCalledTimes(3);

    // 4th attempt: circuit breaker open, should not even call primary
    let metaResult: any = null;
    await fallback.streamAnswer(
      { ...dummyParams, onMeta: (m) => { metaResult = m; } },
      () => {}
    );

    expect(mockPrimary.streamAnswer).toHaveBeenCalledTimes(3); // count remains 3
    expect(metaResult.providerUsed).toBe('manual');
    expect(metaResult.fallbackReason).toContain('unavailable');
  });
});
