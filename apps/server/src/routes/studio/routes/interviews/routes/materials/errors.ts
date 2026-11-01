export class RecruitingMaterialError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message);
    this.status = status;
    this.name = "RecruitingMaterialError";
  }
}
