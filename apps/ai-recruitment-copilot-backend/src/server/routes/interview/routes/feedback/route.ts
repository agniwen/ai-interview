import { candidateInterviewFeedbackInputSchema } from "@arc/db-schema/studio-interviews";
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { loadCandidateInterviewRecord } from "../../utils";
import { submitCandidateInterviewFeedback } from "./dao";

export interface CandidateInterviewFeedbackDependencies {
  loadCandidateInterviewRecord: typeof loadCandidateInterviewRecord;
  submitCandidateInterviewFeedback: typeof submitCandidateInterviewFeedback;
}

const defaultDependencies: CandidateInterviewFeedbackDependencies = {
  loadCandidateInterviewRecord,
  submitCandidateInterviewFeedback,
};

export function createCandidateInterviewFeedbackRouter(
  dependencies: CandidateInterviewFeedbackDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .post(
      "/:id/:roundId/feedback",
      zValidator(
        "json",
        candidateInterviewFeedbackInputSchema,
        jsonValidatorError("反馈内容不完整。"),
      ),
      async (c) => {
        const interviewRecordId = c.req.param("id");
        const roundId = c.req.param("roundId");
        const interviewRecord = await dependencies.loadCandidateInterviewRecord(
          interviewRecordId,
          roundId,
        );

        if (!interviewRecord?.currentRoundId) {
          return c.json({ error: "Interview not available." }, 404);
        }
        if (interviewRecord.currentRoundStatus !== "completed") {
          return c.json({ error: "本轮面试尚未结束，暂时无法提交反馈。" }, 409);
        }

        const feedback = await dependencies.submitCandidateInterviewFeedback({
          ...c.req.valid("json"),
          interviewRecordId,
          roundId,
        });
        if (!feedback) {
          return c.json({ error: "本轮反馈已提交，无法再次修改。" }, 409);
        }

        return c.json({ feedback }, 200);
      },
    );
}

export const candidateInterviewFeedbackRouter = createCandidateInterviewFeedbackRouter();
