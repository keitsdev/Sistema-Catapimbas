export class HttpError extends Error {
  public status: number;
  public code: string;
  public details?: unknown;

  constructor(status: number, codeOrMessage: string, message?: string, details?: unknown) {
    if (!message) {
      super(codeOrMessage);
      this.status = status;
      this.code = status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
      this.details = undefined;
    } else {
      super(message);
      this.status = status;
      this.code = codeOrMessage;
      this.details = details;
    }

    this.name = 'HttpError';
    Object.setPrototypeOf(this, HttpError.prototype);
  }
  
  get statusCode(): number {
    return this.status;
  }
}