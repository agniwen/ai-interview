// oxlint-disable max-classes-per-file, func-names -- Effect services and tagged errors are class-based; Effect.gen uses generator callbacks.
import type {
  createMeetingIntelligenceDao,
  generateMeetingIntelligence,
  getMeetingIntelligenceGeneratorSnapshot,
} from "@app/meeting-processing/intelligence";
import type { MeetingIntelligenceJobData } from "@app/meeting-processing-queue/meeting-intelligence";
import { MEETING_INTELLIGENCE_PROMPT_VERSION } from "@app/meeting-processing-queue/meeting-intelligence";
import {
  isMeetingIntelligenceLeaseLostError,
  isMeetingIntelligenceTerminalError,
  MeetingIntelligenceTerminalError,
} from "@app/shared/meeting-intelligence";
import type { MeetingIntelligencePayload } from "@app/shared/meeting-intelligence";
import { Context, Data, Effect, Layer } from "effect";

export interface MeetingIntelligenceDependencies {
  claim: ReturnType<typeof createMeetingIntelligenceDao>["claimMeetingIntelligenceRun"];
  createExecutionToken: () => string;
  generate: typeof generateMeetingIntelligence;
  generatorSnapshot: typeof getMeetingIntelligenceGeneratorSnapshot;
  heartbeat: ReturnType<typeof createMeetingIntelligenceDao>["heartbeatMeetingIntelligenceRun"];
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
  markFailed: ReturnType<typeof createMeetingIntelligenceDao>["markMeetingIntelligenceFailed"];
  publish: ReturnType<typeof createMeetingIntelligenceDao>["publishMeetingIntelligence"];
  saveCheckpoint: ReturnType<
    typeof createMeetingIntelligenceDao
  >["saveMeetingIntelligenceCheckpoint"];
  saveProgress: ReturnType<typeof createMeetingIntelligenceDao>["saveMeetingIntelligenceProgress"];
}

export class MeetingIntelligenceProcessor extends Context.Service<
  MeetingIntelligenceProcessor,
  MeetingIntelligenceDependencies
>()("@app/worker/MeetingIntelligenceProcessor") {}

export const meetingIntelligenceProcessorLayer = (dependencies: MeetingIntelligenceDependencies) =>
  Layer.succeed(MeetingIntelligenceProcessor, dependencies);

class MeetingIntelligenceFailure extends Data.TaggedError("MeetingIntelligenceFailure")<{
  readonly cause: unknown;
}> {}

// 以 execution token/租约保护生成，复用 durable checkpoint，并仅在模型快照匹配时发布。 / Protects generation with an execution token and lease, resumes durable checkpoints, and publishes only when the model snapshot matches.
async function runMeetingIntelligenceProcessingPromise(
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

export function runMeetingIntelligenceProcessingEffect(
  input: MeetingIntelligenceJobData,
  context: { attempt: number; maxAttempts: number },
) {
  return Effect.gen(function* () {
    const dependencies = yield* MeetingIntelligenceProcessor;
    yield* Effect.tryPromise({
      catch: (cause) => new MeetingIntelligenceFailure({ cause }),
      try: () => runMeetingIntelligenceProcessingPromise(input, context, dependencies),
    });
  });
}

export async function runMeetingIntelligenceProcessing(
  input: MeetingIntelligenceJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: MeetingIntelligenceDependencies,
): Promise<void> {
  await Effect.runPromise(
    runMeetingIntelligenceProcessingEffect(input, context).pipe(
      Effect.provide(meetingIntelligenceProcessorLayer(dependencies)),
      Effect.catchTag("MeetingIntelligenceFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
