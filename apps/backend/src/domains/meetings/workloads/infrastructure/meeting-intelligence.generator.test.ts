import type { MeetingIntelligencePayload } from "@arc/shared/meeting-intelligence";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMeetingIntelligence } from "./meeting-intelligence.generator.js";

const originalTranscriptLimit = process.env.MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS;
const originalReduceLimit = process.env.MEETING_INTELLIGENCE_MAX_REDUCE_CHARS;

afterEach(() => {
  if (originalTranscriptLimit === undefined) {
    delete process.env.MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS;
  } else {
    process.env.MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS = originalTranscriptLimit;
  }
  if (originalReduceLimit === undefined) {
    delete process.env.MEETING_INTELLIGENCE_MAX_REDUCE_CHARS;
  } else {
    process.env.MEETING_INTELLIGENCE_MAX_REDUCE_CHARS = originalReduceLimit;
  }
});

function payload(summary: string, evidenceTurnIds: string[]): MeetingIntelligencePayload {
  return {
    actionItems: [],
    decisions: [],
    openQuestions: [],
    summary,
    template: "general",
    topics: [{ evidenceTurnIds, summary, title: summary }],
  };
}

describe("generateMeetingIntelligence", () => {
  it("checkpoints map/reduce progress and merges long transcripts", async () => {
    process.env.MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS = "220";
    process.env.MEETING_INTELLIGENCE_MAX_REDUCE_CHARS = "1000";
    const generate = vi
      .fn()
      .mockResolvedValueOnce(payload("first", ["turn-1"]))
      .mockResolvedValueOnce(payload("second", ["turn-2"]))
      .mockResolvedValueOnce(payload("merged", ["turn-1", "turn-2"]));
    const saveProgress = vi.fn().mockResolvedValue(true);

    const result = await generateMeetingIntelligence(
      {
        template: "general",
        turns: [
          {
            endMs: 100,
            id: "turn-1",
            speakerDisplayName: null,
            speakerKey: "one",
            startMs: 0,
            text: "a".repeat(80),
          },
          {
            endMs: 200,
            id: "turn-2",
            speakerDisplayName: null,
            speakerKey: "two",
            startMs: 100,
            text: "b".repeat(80),
          },
        ],
      },
      { generate },
      { heartbeat: vi.fn().mockResolvedValue(true), saveProgress },
    );

    expect(result.summary).toBe("merged");
    expect(generate).toHaveBeenCalledTimes(3);
    expect(saveProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: "reduce" }));
  });
});
