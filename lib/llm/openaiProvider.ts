import { LLMProvider, StreamAnswerParams, StreamToken } from './types';
import { ManualProvider } from './manualProvider';

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private fallbackProvider: ManualProvider;

  constructor() {
    this.apiKey = process.env.LLM_API_KEY || '';
    this.baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    this.model = process.env.LLM_MODEL || 'gpt-4o';
    this.fallbackProvider = new ManualProvider();
  }

  async streamAnswer(
    params: StreamAnswerParams,
    onToken: (token: StreamToken) => void
  ): Promise<void> {
    if (!this.apiKey) {
      console.warn('LLM_API_KEY not configured. Falling back to ManualProvider.');
      return this.fallbackProvider.streamAnswer(params, onToken);
    }
    // Documented stub: Can be integrated with OpenAI/compatible SDK or fetch SSE stream
    return this.fallbackProvider.streamAnswer(params, onToken);
  }

  async summariseChanges(changes: any[]): Promise<string[]> {
    return this.fallbackProvider.summariseChanges(changes);
  }
}
