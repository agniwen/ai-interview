export class InitialInterviewError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 503;
  constructor(message: string, status: 400 | 403 | 404 | 409 | 503 = 409) {
    super(message);
    this.name = "InitialInterviewError";
    this.status = status;
  }
}
