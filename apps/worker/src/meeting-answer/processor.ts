import type {
  claimMeetingAnswerExchange,
  loadMeetingAnswerContext,
  markMeetingAnswerFailed,
  publishMeetingAnswerExchange,
} from "@app/server/server/routes/meetings/answers/dao";
import type {
  generateMeetingAnswer,
  getMeetingAnswerGeneratorSnapshot,
} from "@app/server/server/routes/meetings/answers/generator";
import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import { MEETING_ANSWER_PROMPT_VERSION } from "@arc/meeting-processing-queue/meeting-answer";
import {
  isMeetingAnswerTerminalError,
  MeetingAnswerTerminalError,
} from "@arc/shared/meeting-answer";

export interface MeetingAnswerDependencies {
  claim: typeof claimMeetingAnswerExchange;
  createExecutionToken: () => string;
  generate: typeof generateMeetingAnswer;
  generatorSnapshot: typeof getMeetingAnswerGeneratorSnapshot;
  loadContext: typeof loadMeetingAnswerContext;
  markFailed: typeof markMeetingAnswerFailed;
  publish: typeof publishMeetingAnswerExchange;
}

export async function runMeetingAnswerProcessing(
  input: MeetingAnswerJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: MeetingAnswerDependencies,
): Promise<void> {
  const executionToken = dependencies.createExecutionToken();
  const claim = await dependencies.claim({
    attempt: context.attempt,
    exchangeId: input.exchangeId,
    executionToken,
  });
  if (claim.status !== "claimed") {
    return;
  }
  try {
    const generator = dependencies.generatorSnapshot();
    if (
      generator.provider !== claim.provider ||
      generator.model !== claim.model ||
      claim.promptVersion !== MEETING_ANSWER_PROMPT_VERSION
    ) {
      throw new MeetingAnswerTerminalError("Meeting Answer generator snapshot 已变化");
    }
    const answerContext = await dependencies.loadContext({
      exchangeId: input.exchangeId,
      executionToken,
    });
    if (!answerContext) {
      return;
    }
    const answer = await dependencies.generate({ ...answerContext, question: claim.question });
    await dependencies.publish({ answer, exchangeId: input.exchangeId, executionToken });
  } catch (error) {
    const terminal = isMeetingAnswerTerminalError(error) || context.attempt >= context.maxAttempts;
    await dependencies.markFailed({
      exchangeId: input.exchangeId,
      executionToken,
      terminal,
    });
    if (!terminal) {
      throw error;
    }
  }
}
