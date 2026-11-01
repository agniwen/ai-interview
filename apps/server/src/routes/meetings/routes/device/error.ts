export class EchoProcessingError extends Error {
  readonly status: 403 | 404 | 409 | 410 | 429 | 503;
  constructor(status: EchoProcessingError["status"], message: string) {
    super(message);
    this.name = "EchoProcessingError";
    this.status = status;
  }
}
