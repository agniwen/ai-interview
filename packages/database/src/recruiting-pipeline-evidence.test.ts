import { describe, expect, it } from "vitest";
import type { humanInterviewRound } from "@app/db-schema/schema";
import { validateEvidence } from "./recruiting-pipeline-evidence";

type Round = Pick<
  typeof humanInterviewRound.$inferSelect,
  "status" | "outcome" | "feedback" | "evaluationStatus"
>;
const completed: Round = {
  evaluationStatus: "submitted",
  feedback: "",
  outcome: "pass",
  status: "completed",
};
function validate(round: Round | null) {
  // SAFETY: human-round validation only calls select().from().where(); the fixture supplies that exact query result.
  const tx = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(round ? [round] : []) }) }),
  } as never;
  return validateEvidence(
    tx,
    {
      node: "final_interview",
      operatorId: null,
      organizationId: "org",
      recordId: "record",
      result: "pass",
      status: "completed",
    },
    {
      effectiveAiRoundId: null,
      effectiveHumanRoundId: "round",
      effectiveInitialInterviewVersionId: null,
      effectiveOfferId: null,
    },
  );
}
describe("human interview evidence", () => {
  it("accepts a submitted evaluation with optional feedback left empty", async () => {
    await expect(validate(completed)).resolves.toBeUndefined();
  });
  it("preserves legacy completion with written feedback", async () => {
    await expect(
      validate({ ...completed, evaluationStatus: "not_started", feedback: "符合岗位要求" }),
    ).resolves.toBeUndefined();
  });
  it.each([
    null,
    { ...completed, status: "pending" as const },
    { ...completed, outcome: "fail" as const },
    { ...completed, evaluationStatus: "draft" as const },
    { ...completed, evaluationStatus: "not_started" as const, feedback: "  " },
  ])("rejects missing, unfinished, failed, or unreviewed evidence: %j", async (round) => {
    await expect(validate(round)).rejects.toThrow("请先完成本轮面试");
  });
});
