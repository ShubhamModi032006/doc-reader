import { LLMProvider, StreamAnswerParams, StreamToken } from './types';
import { ManualProvider } from './manualProvider';
import { LLMError } from './errors';

export class FallbackProvider implements LLMProvider {
  public name = 'fallback';
  private primary: LLMProvider;
  private manual: ManualProvider;

  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(primary: LLMProvider, manual?: ManualProvider) {
    this.primary = primary;
    this.manual = manual || new ManualProvider();
  }

  async streamAnswer(
    params: StreamAnswerParams,
    onToken: (token: StreamToken) => void
  ): Promise<void> {
    const now = Date.now();

    // Check circuit breaker
    if (this.consecutiveFailures >= 3) {
      if (now < this.circuitOpenUntil) {
        console.warn('Circuit breaker open: routing directly to ManualProvider');
        params.onMeta?.({
          providerUsed: 'manual',
          fallbackReason: 'AI is temporarily unavailable due to repeated failures',
        });
        return this.manual.streamAnswer(params, onToken);
      } else {
        // Reset after 60s timeout expires
        this.consecutiveFailures = 0;
        this.circuitOpenUntil = 0;
      }
    }

    let hasEmittedToken = false;

    const wrappedOnToken = (token: StreamToken) => {
      hasEmittedToken = true;
      onToken(token);
    };

    let attempts = 0;
    let totalWaitMs = 0;

    while (attempts <= 2) {
      try {
        attempts++;
        await this.primary.streamAnswer(params, wrappedOnToken);
        // Success! Reset consecutive failures
        this.consecutiveFailures = 0;
        params.onMeta?.({ providerUsed: 'groq' });
        return;
      } catch (err: any) {
        // User aborted (Stop button)
        if (params.signal?.aborted || err.name === 'AbortError') {
          throw err;
        }

        // Mid-stream failure: keep partial text, mark interrupted, NO fallback
        if (hasEmittedToken) {
          console.warn('Primary LLM failed mid-stream:', err.message);
          const interruptedErr = new Error('Stream interrupted mid-generation');
          (interruptedErr as any).isInterrupted = true;
          throw interruptedErr;
        }

        // Before-stream failure: handle RateLimitError retries
        if (err.name === 'RateLimitError' && attempts <= 2) {
          const retrySecs = err.retryAfterSeconds || 5;
          const waitMs = Math.min(retrySecs * 1000, 5000 - totalWaitMs);
          if (waitMs > 0 && totalWaitMs + waitMs <= 5000) {
            totalWaitMs += waitMs;
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
        }

        // Fallback required
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= 3) {
          this.circuitOpenUntil = Date.now() + 60000;
        }

        const humanReason = this.getHumanReadableReason(err);
        console.warn(`Primary provider failed (${err.name}). Falling back to manual. Reason: ${humanReason}`);

        params.onMeta?.({
          providerUsed: 'manual',
          fallbackReason: humanReason,
        });

        return this.manual.streamAnswer(params, onToken);
      }
    }
  }

  async summariseChanges(changes: any[]): Promise<string[]> {
    if (Date.now() < this.circuitOpenUntil || !this.primary.summariseChanges) {
      return this.manual.summariseChanges(changes);
    }
    try {
      const res = await this.primary.summariseChanges(changes);
      this.consecutiveFailures = 0;
      return res;
    } catch (err: any) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        this.circuitOpenUntil = Date.now() + 60000;
      }
      return this.manual.summariseChanges(changes);
    }
  }

  async suggestEdits(instruction: string, documentText: string): Promise<Array<{ find: string; replace: string }>> {
    if (Date.now() < this.circuitOpenUntil || !this.primary.suggestEdits) {
      return [];
    }
    try {
      const res = await this.primary.suggestEdits(instruction, documentText);
      this.consecutiveFailures = 0;
      return res;
    } catch (err: any) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        this.circuitOpenUntil = Date.now() + 60000;
      }
      return [];
    }
  }

  private getHumanReadableReason(err: any): string {
    if (err.name === 'AuthError') return 'AI key missing or invalid';
    if (err.name === 'RateLimitError') return 'Rate limited by Groq API';
    if (err.name === 'ServerError') return 'Groq server error (5xx)';
    if (err.name === 'TimeoutError') return 'Groq request timed out';
    if (err.name === 'NetworkError') return 'Network error connecting to Groq';
    if (err.message?.includes('model_not_found') || err.message?.includes('404')) {
      return 'Model not found on Groq API';
    }
    return err.message || 'AI provider error';
  }
}
