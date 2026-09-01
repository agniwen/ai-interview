import { MEETING_ANSWER_PROMPT_VERSION } from "@arc/meeting-processing-queue/meeting-answer";
import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import {
  isMeetingAnswerTerminalError,
  MeetingAnswerTerminalError,
} from "@arc/shared/meeting-answer";
import type { MeetingAnswerPayload } from "@arc/shared/meeting-answer";
import type { MeetingIntelligencePayload } from "@arc/shared/meeting-intelligence";
import type { BackgroundAttemptContext } from "../../../background/background.types.js";

export interface MeetingAnswerGenerationContext {
  intelligence: MeetingIntelligencePayload | null;
  notes: { body: string; meetingTimeMs: number }[];
  previous: { answer: MeetingAnswerPayload; question: string }[];
  turns: {
    endMs: number;
    id: string;
    speakerDisplayName: string | null;
    speakerKey: string;
    startMs: number;
    text: string;
  }[];
}

export type MeetingAnswerClaim =
  | { status: "already-ready" | "busy" | "not-authorized" | "not-current" }
  | {
      model: string;
      promptVersion: string;
      provider: string;
      question: string;
      status: "claimed";
    };

/** Infrastructure required by the copied meeting-answer state machine. */
export interface MeetingAnswerProcessorPorts {
  claim(input: {
    attempt: number;
    exchangeId: string;
    executionToken: string;
  }): Promise<MeetingAnswerClaim>;
  createExecutionToken(): string;
  generate(
    input: MeetingAnswerGenerationContext & { question: string },
  ): Promise<MeetingAnswerPayload>;
  generatorSnapshot(): { model: string; provider: string };
  loadContext(input: {
    exchangeId: string;
    executionToken: string;
  }): Promise<MeetingAnswerGenerationContext | null | undefined>;
  markFailed(input: {
    exchangeId: string;
    executionToken: string;
    terminal: boolean;
  }): Promise<boolean>;
  publish(input: {
    answer: MeetingAnswerPayload;
    exchangeId: string;
    executionToken: string;
  }): Promise<boolean>;
}

/**
 * Copied from the legacy worker. Claim/CAS semantics and terminal retry policy
 * remain here; only DB and generator I/O cross the port boundary.
 */
export async function processMeetingAnswerWorkload(
  input: MeetingAnswerJobData,
  context: BackgroundAttemptContext,
  ports: MeetingAnswerProcessorPorts,
): Promise<void> {
  const executionToken = ports.createExecutionToken();
  const claim = await ports.claim({
    attempt: context.attempt,
    exchangeId: input.exchangeId,
    executionToken,
  });
  if (claim.status !== "claimed") {
    return;
  }
  try {
    const generator = ports.generatorSnapshot();
    if (
      generator.provider !== claim.provider ||
      generator.model !== claim.model ||
      claim.promptVersion !== MEETING_ANSWER_PROMPT_VERSION
    ) {
      throw new MeetingAnswerTerminalError("Meeting Answer generator snapshot 已变化");
    }
    const answerContext = await ports.loadContext({
      exchangeId: input.exchangeId,
      executionToken,
    });
    if (!answerContext) {
      return;
    }
    const answer = await ports.generate({ ...answerContext, question: claim.question });
    await ports.publish({ answer, exchangeId: input.exchangeId, executionToken });
  } catch (error) {
    const terminal = isMeetingAnswerTerminalError(error) || context.attempt >= context.maxAttempts;
    await ports.markFailed({ exchangeId: input.exchangeId, executionToken, terminal });
    if (!terminal) {
      throw error;
    }
  }
}
