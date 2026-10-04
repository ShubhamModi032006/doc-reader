import {
  AuthError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
  BadOutputError,
} from './errors';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqCompletionParams {
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  jsonMode?: boolean;
  signal?: AbortSignal;
  onChunk?: (delta: string) => void;
}

export async function callGroqAPI(params: GroqCompletionParams): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || '';
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'llama-3.1-8b-instant';
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10);

  if (!apiKey) {
    throw new AuthError('LLM_API_KEY is not configured');
  }

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  const combinedSignal = params.signal
    ? AbortSignal.any([params.signal, timeoutController.signal])
    : timeoutController.signal;

  const requestBody: any = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.1,
    stream: !!params.stream,
  };

  if (params.jsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: combinedSignal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      if (params.signal?.aborted) {
        throw err; // User requested abort
      }
      throw new TimeoutError(`Groq request timed out after ${timeoutMs}ms`);
    }
    throw new NetworkError(err.message || 'Failed to connect to Groq API');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const status = res.status;
    let errorText = '';
    try {
      errorText = await res.text();
    } catch (_) {}

    if (status === 401 || status === 403) {
      throw new AuthError(`Groq auth error (${status}): ${errorText}`);
    } else if (status === 429) {
      const retryHeader = res.headers.get('retry-after');
      const retrySecs = retryHeader ? parseInt(retryHeader, 10) || 5 : 5;
      throw new RateLimitError(`Groq rate limit exceeded (429)`, retrySecs);
    } else if (status >= 500) {
      throw new ServerError(`Groq server error (${status}): ${errorText}`);
    } else {
      throw new BadOutputError(`Groq API error (${status}): ${errorText}`);
    }
  }

  if (params.stream) {
    if (!res.body) {
      throw new BadOutputError('Groq response body is missing');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                if (params.onChunk) {
                  params.onChunk(delta);
                }
              }
            } catch (e) {
              // Ignore malformed individual SSE line
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      throw new NetworkError(`Stream error: ${err.message}`);
    }

    return fullText;
  } else {
    try {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new BadOutputError('Missing or invalid choices[0].message.content in Groq response');
      }
      return content;
    } catch (err: any) {
      if (err instanceof BadOutputError) throw err;
      throw new BadOutputError(`Failed to parse Groq response JSON: ${err.message}`);
    }
  }
}
