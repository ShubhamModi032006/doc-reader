import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callGroqAPI } from '../lib/llm/groqClient';
import { AuthError, RateLimitError, ServerError, TimeoutError } from '../lib/llm/errors';

describe('groqClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, LLM_API_KEY: 'test_key_123', LLM_TIMEOUT_MS: '1000' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('parses streaming SSE response and emits chunks', async () => {
    const sseData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" World!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseData) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const chunks: string[] = [];
    const result = await callGroqAPI({
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
      onChunk: (delta) => chunks.push(delta),
    });

    expect(result).toBe('Hello World!');
    expect(chunks).toEqual(['Hello', ' World!']);
  });

  it('throws AuthError on 401 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));

    await expect(
      callGroqAPI({ messages: [{ role: 'user', content: 'Hi' }] })
    ).rejects.toThrow(AuthError);
  });

  it('throws RateLimitError on 429 response and reads retry-after header', async () => {
    const headers = new Headers({ 'retry-after': '12' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Rate limited', { status: 429, headers })));

    try {
      await callGroqAPI({ messages: [{ role: 'user', content: 'Hi' }] });
      expect.fail('Should have thrown RateLimitError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.retryAfterSeconds).toBe(12);
    }
  });

  it('throws ServerError on 500 status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 })));

    await expect(
      callGroqAPI({ messages: [{ role: 'user', content: 'Hi' }] })
    ).rejects.toThrow(ServerError);
  });

  it('throws TimeoutError when request exceeds LLM_TIMEOUT_MS', async () => {
    process.env.LLM_TIMEOUT_MS = '50';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      )
    );

    await expect(
      callGroqAPI({ messages: [{ role: 'user', content: 'Hi' }] })
    ).rejects.toThrow(TimeoutError);
  });

  it('propagates user AbortSignal and throws AbortError when aborted', async () => {
    const userController = new AbortController();
    userController.abort();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, options) => {
        if (options.signal.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          return Promise.reject(err);
        }
        return Promise.resolve(new Response('OK'));
      })
    );

    await expect(
      callGroqAPI({
        messages: [{ role: 'user', content: 'Hi' }],
        signal: userController.signal,
      })
    ).rejects.toThrow('aborted');
  });
});

