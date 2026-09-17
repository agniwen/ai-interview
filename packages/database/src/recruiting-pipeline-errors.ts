export class RecruitingPipelineError extends Error {
  readonly code: "not_found" | "conflict" | "invalid";

  constructor(message: string, code: "not_found" | "conflict" | "invalid") {
    super(message);
    this.name = "RecruitingPipelineError";
    this.code = code;
  }
}
