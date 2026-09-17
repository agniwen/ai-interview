import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type {
  MeetingIntelligenceGenerationProgress,
  MeetingIntelligencePayload,
} from "@app/shared/meeting-intelligence";
import { generateMeetingIntelligence } from "./meeting-intelligence-generator";

class IntelligenceCheckpointError extends Error {
  readonly progress: MeetingIntelligenceGenerationProgress;
  constructor(progress: MeetingIntelligenceGenerationProgress) {
    super("Meeting Intelligence checkpoint ready");
    this.name = "IntelligenceCheckpointError";
    this.progress = progress;
  }
}

export type MeetingIntelligenceStepResult =
  | { state: "checkpoint"; progress: MeetingIntelligenceGenerationProgress }
  | { state: "ready"; content: MeetingIntelligencePayload };

/** A request handles at most one existing map/reduce batch; Echo persists and advances progress. */
export async function generateMeetingIntelligenceStep(
  input: Parameters<typeof generateMeetingIntelligence>[0],
  progress: MeetingIntelligenceGenerationProgress | null,
  generate: typeof generateMeetingIntelligence = generateMeetingIntelligence,
  livePrefix?: NonNullable<Parameters<typeof generateMeetingIntelligence>[3]>["livePrefix"],
): Promise<MeetingIntelligenceStepResult> {
  const serializedProgress = JSON.stringify(progress);
  const previous = z.json().parse(JSON.parse(serializedProgress));
  try {
    const content = await generate(input, undefined, undefined, {
      livePrefix,
      progress,
      saveProgress: (next) => {
        const serializedNext = JSON.stringify(next);
        if (!isDeepStrictEqual(z.json().parse(JSON.parse(serializedNext)), previous)) {
          throw new IntelligenceCheckpointError(next);
        }
        return Promise.resolve(true);
      },
    });
    return { content, state: "ready" };
  } catch (error) {
    if (error instanceof IntelligenceCheckpointError) {
      return { progress: error.progress, state: "checkpoint" };
    }
    throw error;
  }
}
