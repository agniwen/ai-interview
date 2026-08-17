import type {
  claimMeetingIntelligenceRun,
  heartbeatMeetingIntelligenceRun,
  markMeetingIntelligenceFailed,
  publishMeetingIntelligence,
  saveMeetingIntelligenceCheckpoint,
  saveMeetingIntelligenceProgress,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/dao";
import type {
  generateMeetingIntelligence,
  getMeetingIntelligenceGeneratorSnapshot,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/generator";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import { MEETING_INTELLIGENCE_PROMPT_VERSION } from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  isMeetingIntelligenceLeaseLostError,
  isMeetingIntelligenceTerminalError,
  MeetingIntelligenceTerminalError,
} from "@arc/shared/meeting-intelligence";
import type { MeetingIntelligencePayload } from "@arc/shared/meeting-intelligence";

export interface MeetingIntelligenceDependencies {
  claim: typeof claimMeetingIntelligenceRun;
  createExecutionToken: () => string;
  generate: typeof generateMeetingIntelligence;
  generatorSnapshot: typeof getMeetingIntelligenceGeneratorSnapshot;
  heartbeat: typeof heartbeatMeetingIntelligenceRun;
  loadTranscript: (input: {
    meetingId: string;
    organizationId: string;
    transcriptRevisionId: string;
  }) => Promise<
    | {
        turns: {
          endMs: number;
          id: string;
          speakerDisplayName: string | null;
          speakerKey: string;
          startMs: number;
          text: string;
        }[];
      }
    | null
    | undefined
  >;
  markFailed: typeof markMeetingIntelligenceFailed;
  publish: typeof publishMeetingIntelligence;
  saveCheckpoint: typeof saveMeetingIntelligenceCheckpoint;
  saveProgress: typeof saveMeetingIntelligenceProgress;
}

export async function runMeetingIntelligenceProcessing(
  input: MeetingIntelligenceJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: MeetingIntelligenceDependencies,
): Promise<void> {
  const executionToken = dependencies.createExecutionToken();
  const claim = await dependencies.claim({
    attempt: context.attempt,
    executionToken,
    processingRunId: input.processingRunId,
  });
  if (claim.status !== "claimed") {
    return;
  }
  try {
    if (claim.checkpointInvalid) {
      throw new MeetingIntelligenceTerminalError("Meeting Intelligence durable checkpoint 无效");
    }
    let content: MeetingIntelligencePayload;
    if (claim.checkpoint) {
      content = claim.checkpoint;
    } else {
      const generator = dependencies.generatorSnapshot();
      if (
        generator.provider !== claim.provider ||
        generator.model !== claim.model ||
        claim.promptVersion !== MEETING_INTELLIGENCE_PROMPT_VERSION
      ) {
        throw new MeetingIntelligenceTerminalError(
          "Meeting Intelligence generator snapshot 已变化",
        );
      }
      const transcript = await dependencies.loadTranscript({
        meetingId: claim.meetingId,
        organizationId: claim.organizationId,
        transcriptRevisionId: claim.transcriptRevisionId,
      });
      if (!transcript) {
        throw new MeetingIntelligenceTerminalError("Meeting Intelligence 输入转录不存在");
      }
      content = await dependencies.generate(
        {
          template: claim.template,
          turns: transcript.turns.map((turn) => ({
            endMs: turn.endMs,
            id: turn.id,
            speakerDisplayName: turn.speakerDisplayName,
            speakerKey: turn.speakerKey,
            startMs: turn.startMs,
            text: turn.text,
          })),
        },
        undefined,
        undefined,
        {
          heartbeat: () =>
            dependencies.heartbeat({
              executionToken,
              processingRunId: input.processingRunId,
            }),
          progress: claim.progress,
          saveProgress: (progress) =>
            dependencies.saveProgress({
              executionToken,
              processingRunId: input.processingRunId,
              progress,
            }),
        },
      );
      const saved = await dependencies.saveCheckpoint({
        content,
        executionToken,
        processingRunId: input.processingRunId,
      });
      if (!saved) {
        return;
      }
    }
    await dependencies.publish({ executionToken, processingRunId: input.processingRunId });
  } catch (error) {
    if (isMeetingIntelligenceLeaseLostError(error)) {
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : "Meeting Intelligence generation failed";
    const terminal =
      isMeetingIntelligenceTerminalError(error) || context.attempt >= context.maxAttempts;
    try {
      await dependencies.markFailed({
        errorMessage,
        executionToken,
        processingRunId: input.processingRunId,
        terminal,
      });
    } catch (markFailedError) {
      console.error("[meeting-intelligence-worker] failed to persist processing failure", {
        errorName: markFailedError instanceof Error ? markFailedError.name : "UnknownError",
        processingRunId: input.processingRunId,
      });
    }
    if (terminal) {
      return;
    }
    throw error;
  }
}
