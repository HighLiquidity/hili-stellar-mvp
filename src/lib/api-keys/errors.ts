export class ApiRateLimitError extends Error {
  readonly status = 429;

  constructor(message = 'Rate limit exceeded. Try again later.') {
    super(message);
    this.name = 'ApiRateLimitError';
  }
}
