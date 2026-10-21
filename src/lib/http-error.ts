export class HttpError extends Error {
  public status: number;
  public code: string;
  public details?: unknown;

  constructor(status: number, codeOrMessage: string, message?: string, details?: unknown) {
    // Se enviou apenas (status, message)
    if (!message) {
      super(codeOrMessage);
      this.status = status;
      this.code = status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
      this.details = undefined;
    } else {
      // Se enviou (status, code, message, details)
      super(message);
      this.status = status;
      this.code = codeOrMessage;
      this.details = details;
    }

    this.name = 'HttpError';
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  // Compatibilidade com código legado que lê .statusCode
  get statusCode(): number {
    return this.status;
  }
}