import { humanInterviewRound } from "@app/db-schema/schema";
import { and, eq } from "drizzle-orm";
import type { Database } from "@app/database";
import { ResolveHumanInterviewOutcomeError } from "../application/resolve-human-interview-outcome";
import type { ResolveHumanInterviewOutcomeInput } from "../application/resolve-human-interview-outcome";

// Keep the old endpoint safe for stale clients; every completed judgment is final.
export function createResolveHumanInterviewOutcomeDao(db: Database) {
  return async (input: ResolveHumanInterviewOutcomeInput): Promise<void> => {
    const [round] = await db
      .select({ id: humanInterviewRound.id })
      .from(humanInterviewRound)
      .where(
        and(
          eq(humanInterviewRound.id, input.roundId),
          eq(humanInterviewRound.organizationId, input.organizationId),
          eq(humanInterviewRound.recruitingRecordId, input.interviewRecordId),
        ),
      );
    if (!round) {
      throw new ResolveHumanInterviewOutcomeError("面试轮次不存在。", 404);
    }
    throw new ResolveHumanInterviewOutcomeError(
      "本轮结论提交后不可修改，包括待定。请通过后续面试记录新的评价。",
      409,
    );
  };
}
