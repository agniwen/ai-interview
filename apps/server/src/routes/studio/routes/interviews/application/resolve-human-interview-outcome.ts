import { humanInterviewFinalOutcomeSchema } from "@app/db-schema/studio-interviews";
import type { HumanInterviewFinalOutcome } from "@app/db-schema/studio-interviews";

export interface ResolveHumanInterviewOutcomeInput {
  actorId: string;
  interviewRecordId: string;
  organizationId: string;
  outcome: HumanInterviewFinalOutcome;
  roundId: string;
}

export class ResolveHumanInterviewOutcomeError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409) {
    super(message);
    this.name = "ResolveHumanInterviewOutcomeError";
    this.status = status;
  }
}

export async function resolveHumanInterviewOutcome(
  input: ResolveHumanInterviewOutcomeInput,
  dependencies: { persist: (input: ResolveHumanInterviewOutcomeInput) => Promise<void> },
): Promise<void> {
  if (!humanInterviewFinalOutcomeSchema.safeParse(input.outcome).success) {
    throw new ResolveHumanInterviewOutcomeError("请选择通过或不通过。", 400);
  }
  await dependencies.persist(input);
}
