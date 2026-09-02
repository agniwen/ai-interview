import type {
  loadHumanInterviewEvaluationInput,
  markHumanInterviewEvaluationFailed,
  publishHumanInterviewEvaluation,
  generateHumanInterviewEvaluation,
} from "@app/server/worker/human-interview";
import type { HumanInterviewEvaluationJobData } from "@app/meeting-processing-queue/human-interview-evaluation";

export interface HumanInterviewEvaluationProcessorDependencies {
  generate: typeof generateHumanInterviewEvaluation;
  loadInput: typeof loadHumanInterviewEvaluationInput;
  markFailed: typeof markHumanInterviewEvaluationFailed;
  publish: typeof publishHumanInterviewEvaluation;
}

export async function runHumanInterviewEvaluationProcessing(
  input: HumanInterviewEvaluationJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: HumanInterviewEvaluationProcessorDependencies,
): Promise<void> {
  try {
    const source = await dependencies.loadInput(input);
    if (!source) {
      return;
    }
    const evaluation = await dependencies.generate({
      ...source,
      salaryRange: null,
    });
    await dependencies.publish({
      evaluation,
      meetingSessionId: input.meetingSessionId,
      organizationId: input.organizationId,
      roundId: input.roundId,
      transcriptRevisionId: input.transcriptRevisionId,
    });
  } catch (error) {
    if (context.attempt < context.maxAttempts) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "真人复面 AI 评价生成失败";
    await dependencies.markFailed({
      error: `AI 评价生成失败：${message}`,
      roundId: input.roundId,
      transcriptRevisionId: input.transcriptRevisionId,
    });
  }
}
