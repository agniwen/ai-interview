import { randomUUID } from "node:crypto";
import {
  claimMeetingAnswerExchange,
  loadMeetingAnswerContext,
  markMeetingAnswerFailed,
  publishMeetingAnswerExchange,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/answers/dao";
import {
  generateMeetingAnswer,
  getMeetingAnswerGeneratorSnapshot,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/answers/generator";
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

const defaultDependencies: MeetingAnswerDependencies = {
  claim: claimMeetingAnswerExchange,
  createExecutionToken: randomUUID,
  generate: generateMeetingAnswer,
  generatorSnapshot: getMeetingAnswerGeneratorSnapshot,
  loadContext: loadMeetingAnswerContext,
  markFailed: markMeetingAnswerFailed,
  publish: publishMeetingAnswerExchange,
};

export async function runMeetingAnswerProcessing(
  input: MeetingAnswerJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: MeetingAnswerDependencies = defaultDependencies,
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
