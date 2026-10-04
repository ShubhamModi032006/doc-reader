import { LLMProvider } from './types';
import { ManualProvider } from './manualProvider';
import { GroqProvider } from './groqProvider';
import { FallbackProvider } from './fallbackProvider';

let warningLogged = false;

export function getLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER || 'manual').toLowerCase();
  const apiKey = process.env.LLM_API_KEY;

  if (provider === 'groq') {
    if (!apiKey) {
      if (!warningLogged) {
        console.warn('⚠️ WARNING: LLM_PROVIDER=groq but LLM_API_KEY is missing. Falling back to manual provider.');
        warningLogged = true;
      }
      return new ManualProvider();
    }
    return new FallbackProvider(new GroqProvider(), new ManualProvider());
  }

  return new ManualProvider();
}

export * from './types';
export * from './errors';
export * from './groqClient';
export * from './quoteParser';
export * from './groqProvider';
export * from './fallbackProvider';
