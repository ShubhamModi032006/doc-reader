import { StreamToken } from './types';

export interface QuoteParserOptions {
  docMap: Record<string, string>; // e.g. { D1: 'doc-id-1', D2: 'doc-id-2' }
  isPartialCoverage?: boolean;
}

export class QuoteParser {
  private docMap: Record<string, string>;
  private isPartialCoverage: boolean;

  private buffer = '';
  private state: 'TEXT' | 'BUFFERING_TAG' | 'INSIDE_QUOTE' = 'TEXT';
  private currentDocLabel = '';
  private quoteBuffer = '';
  private tagBuffer = '';

  private fullRawText = '';
  private emittedText = false;

  constructor(options: QuoteParserOptions) {
    this.docMap = options.docMap || {};
    this.isPartialCoverage = !!options.isPartialCoverage;
  }

  feed(chunk: string, onToken: (token: StreamToken) => void): void {
    this.fullRawText += chunk;
    this.buffer += chunk;
    this.processBuffer(onToken, false);
  }

  flush(onToken: (token: StreamToken) => void): void {
    const trimmed = this.fullRawText.trim();
    if (trimmed === 'NOT_FOUND') {
      const negativeAnswer = this.isPartialCoverage
        ? 'Not found in the sections reviewed.'
        : 'This is not stated in the document.';
      onToken({ type: 'text', delta: negativeAnswer });
      return;
    }

    this.processBuffer(onToken, true);

    if (this.tagBuffer) {
      if (this.state === 'INSIDE_QUOTE') {
        this.quoteBuffer += this.tagBuffer;
      } else {
        onToken({ type: 'text', delta: this.tagBuffer });
      }
      this.tagBuffer = '';
    }

    if (this.state === 'INSIDE_QUOTE' && this.quoteBuffer.trim()) {
      const docId = this.docMap[this.currentDocLabel] ?? null;
      onToken({ type: 'quote', documentId: docId, text: this.quoteBuffer });
      this.quoteBuffer = '';
    }
  }

  private processBuffer(onToken: (token: StreamToken) => void, isFlush: boolean): void {
    // If we're at the very start and the raw text could be NOT_FOUND, buffer up to 12 chars
    if (!this.emittedText && !isFlush) {
      const trimmed = this.fullRawText.trim();
      if (trimmed.length <= 10 && 'NOT_FOUND'.startsWith(trimmed)) {
        return; // Wait until more chars or flush
      }
    }

    // If initial NOT_FOUND check passed or failed, flush any held initial characters if not NOT_FOUND
    let idx = 0;


    while (idx < this.buffer.length) {
      const char = this.buffer[idx];

      if (this.state === 'TEXT') {
        if (char === '<') {
          this.state = 'BUFFERING_TAG';
          this.tagBuffer = '<';
          idx++;
        } else {
          this.emittedText = true;
          onToken({ type: 'text', delta: char });
          idx++;
        }
      } else if (this.state === 'BUFFERING_TAG') {
        this.tagBuffer += char;
        idx++;

        const matchOpen = this.tagBuffer.match(/^<quote\s+doc=["']([^"']+)["']\s*>/i);
        if (matchOpen) {
          this.currentDocLabel = matchOpen[1];
          this.quoteBuffer = '';
          this.tagBuffer = '';
          this.state = 'INSIDE_QUOTE';
          continue;
        }

        // Check if tagBuffer can still form a <quote doc="..."> tag
        const isPrefix = '<quote doc="D'.startsWith(this.tagBuffer.slice(0, Math.min(this.tagBuffer.length, 12)))
          || /^<quote(\s+(doc(=("[^"]*)?)?)?)?$/i.test(this.tagBuffer);

        if (!isPrefix) {
          // Not a valid quote tag, flush tagBuffer as text
          this.emittedText = true;
          onToken({ type: 'text', delta: this.tagBuffer });
          this.tagBuffer = '';
          this.state = 'TEXT';
        } else if (idx >= this.buffer.length && !isFlush) {
          // Incomplete tag at buffer end, wait for next chunk
          this.buffer = '';
          return;
        }
      } else if (this.state === 'INSIDE_QUOTE') {
        if (char === '<') {
          // Check for </quote>
          let subIdx = idx;
          let temp = '';
          while (subIdx < this.buffer.length) {
            temp += this.buffer[subIdx];
            if (temp.toLowerCase() === '</quote>') {
              const docId = this.docMap[this.currentDocLabel] ?? null;
              onToken({ type: 'quote', documentId: docId, text: this.quoteBuffer });
              this.quoteBuffer = '';
              this.currentDocLabel = '';
              this.tagBuffer = '';
              this.state = 'TEXT';
              idx = subIdx + 1;
              temp = '';
              break;
            }
            if (!'</quote>'.startsWith(temp.toLowerCase())) {
              break;
            }
            subIdx++;
          }

          if (temp === '') {
            // Matched </quote>
            continue;
          }

          if (subIdx >= this.buffer.length && '</quote>'.startsWith(temp.toLowerCase()) && !isFlush) {
            // Incomplete </quote> tag at buffer end, wait for next chunk
            this.buffer = temp;
            return;
          }

          // Not </quote>, append '<' to quoteBuffer
          this.quoteBuffer += char;
          idx++;
        } else {
          this.quoteBuffer += char;
          idx++;
        }
      }
    }

    this.buffer = '';
  }
}
