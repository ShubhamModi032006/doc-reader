export interface LLMChunkInput {
  id: string;
  text: string;
  startPage?: number;
  endPage?: number;
}

export interface LLMDocumentInput {
  id: string;
  name: string;
  chunks: LLMChunkInput[];
  fullText?: string;
  totalPages?: number;
}

export interface LLMCoverage {
  searchedChunks: number;
  totalChunks: number;
  searchedPages: number;
  totalPages: number;
  isPartial: boolean;
}

export interface StreamAnswerParams {
  question: string;
  documents: LLMDocumentInput[];
  coverage: LLMCoverage;
  signal?: AbortSignal;
  simulateBadQuote?: boolean;
  isScanAll?: boolean;
  onMeta?: (meta: { providerUsed: 'groq' | 'manual'; fallbackReason?: string }) => void;
}


export type StreamToken =
  | { type: 'text'; delta: string }
  | { type: 'quote'; documentId: string; text: string };

export interface LLMProvider {
  name?: string;
  streamAnswer(
    params: StreamAnswerParams,
    onToken: (token: StreamToken) => void
  ): Promise<void>;
  summariseChanges?(changes: any[]): Promise<string[]>;
  suggestEdits?(instruction: string, documentText: string): Promise<Array<{ find: string; replace: string }>>;
}

