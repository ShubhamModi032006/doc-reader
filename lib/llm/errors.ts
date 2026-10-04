export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}

export class AuthError extends LLMError {
  constructor(message = 'Authentication failed (401/403)') {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends LLMError {
  public retryAfterSeconds: number;
  constructor(message = 'Rate limit exceeded (429)', retryAfterSeconds = 5) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ServerError extends LLMError {
  constructor(message = 'LLM Server error (5xx)') {
    super(message);
    this.name = 'ServerError';
  }
}

export class TimeoutError extends LLMError {
  constructor(message = 'LLM request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends LLMError {
  constructor(message = 'LLM network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class BadOutputError extends LLMError {
  constructor(message = 'Invalid LLM response or output structure') {
    super(message);
    this.name = 'BadOutputError';
  }
}
