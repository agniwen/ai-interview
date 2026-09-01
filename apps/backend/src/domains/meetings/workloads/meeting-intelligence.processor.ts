import { MEETING_INTELLIGENCE_PROMPT_VERSION } from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  isMeetingIntelligenceLeaseLostError,
  isMeetingIntelligenceTerminalError,
  MeetingIntelligenceTerminalError,
} from "@arc/shared/meeting-intelligence";
import type {
  MeetingIntelligenceGenerationProgress,
  MeetingIntelligencePayload,
  MeetingIntelligenceTemplate,
} from "@arc/shared/meeting-intelligence";
import type { BackgroundAttemptContext } from "../../../background/background.types.js";

interface TranscriptTurn {
  endMs: number;
  id: string;
  speakerDisplayName: string | null;
  speakerKey: string;
  startMs: number;
  text: string;
}

export type MeetingIntelligenceClaim =
  | { status: "already-ready" | "busy" | "not-current" }
  | {
      checkpoint: MeetingIntelligencePayload | null;
      checkpointInvalid?: boolean;
      meetingId: string;
      model: string;
      organizationId: string;
      progress?: MeetingIntelligenceGenerationProgress | null;
      promptVersion: string;
      provider: string;
      status: "claimed";
      template: MeetingIntelligenceTemplate;
      transcriptRevisionId: string;
    };

export interface MeetingIntelligenceProcessorPorts {
  claim(input: {
    attempt: number;
    executionToken: string;
    processingRunId: string;
  }): Promise<MeetingIntelligenceClaim>;
  createExecutionToken(): string;
  generate(
    input: { template: MeetingIntelligenceTemplate; turns: TranscriptTurn[] },
    runtime: {
      heartbeat(): Promise<boolean>;
      progress: MeetingIntelligenceGenerationProgress | null | undefined;
      saveProgress(progress: MeetingIntelligenceGenerationProgress): Promise<boolean>;
    },
  ): Promise<MeetingIntelligencePayload>;
  generatorSnapshot(): { model: string; provider: string };
  heartbeat(input: { executionToken: string; processingRunId: string }): Promise<boolean>;
  loadTranscript(input: {
    meetingId: string;
    organizationId: string;
    transcriptRevisionId: string;
  }): Promise<{ turns: TranscriptTurn[] } | null | undefined>;
  markFailed(input: {
    errorMessage: string;
    executionToken: string;
    processingRunId: string;
    terminal: boolean;
  }): Promise<boolean>;
  publish(input: { executionToken: string; processingRunId: string }): Promise<boolean>;
  saveCheckpoint(input: {
    content: MeetingIntelligencePayload;
    executionToken: string;
    processingRunId: string;
  }): Promise<boolean>;
  saveProgress(input: {
    executionToken: string;
    processingRunId: string;
    progress: MeetingIntelligenceGenerationProgress;
  }): Promise<boolean>;
}

/** Copied durable-checkpoint and lease-aware retry state machine. */
export async function processMeetingIntelligenceWorkload(
  input: MeetingIntelligenceJobData,
  context: BackgroundAttemptContext,
  ports: MeetingIntelligenceProcessorPorts,
): Promise<void> {
  const executionToken = ports.createExecutionToken();
  const claim = await ports.claim({
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
      const generator = ports.generatorSnapshot();
      if (
        generator.provider !== claim.provider ||
        generator.model !== claim.model ||
        claim.promptVersion !== MEETING_INTELLIGENCE_PROMPT_VERSION
      ) {
        throw new MeetingIntelligenceTerminalError(
          "Meeting Intelligence generator snapshot 已变化",
        );
      }
      const transcript = await ports.loadTranscript({
        meetingId: claim.meetingId,
        organizationId: claim.organizationId,
        transcriptRevisionId: claim.transcriptRevisionId,
      });
      if (!transcript) {
        throw new MeetingIntelligenceTerminalError("Meeting Intelligence 输入转录不存在");
      }
      content = await ports.generate(
        {
          template: claim.template,
          turns: transcript.turns.map((turn) => ({ ...turn })),
        },
        {
          heartbeat: () =>
            ports.heartbeat({ executionToken, processingRunId: input.processingRunId }),
          progress: claim.progress,
          saveProgress: (progress) =>
            ports.saveProgress({
              executionToken,
              processingRunId: input.processingRunId,
              progress,
            }),
        },
      );
      if (
        !(await ports.saveCheckpoint({
          content,
          executionToken,
          processingRunId: input.processingRunId,
        }))
      ) {
        return;
      }
    }
    await ports.publish({ executionToken, processingRunId: input.processingRunId });
  } catch (error) {
    if (isMeetingIntelligenceLeaseLostError(error)) {
      return;
    }
    const terminal =
      isMeetingIntelligenceTerminalError(error) || context.attempt >= context.maxAttempts;
    try {
      await ports.markFailed({
        errorMessage:
          error instanceof Error ? error.message : "Meeting Intelligence generation failed",
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
    if (!terminal) {
      throw error;
    }
  }
}
