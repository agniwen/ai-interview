import { afterEach, expect, it, vi } from "vitest";
import { meetingIntelligenceGenerationProgressSchema } from "@app/shared/meeting-intelligence";
import type {
  MeetingIntelligenceGenerationProgress,
  MeetingIntelligencePayload,
} from "@app/shared/meeting-intelligence";
import { generateMeetingIntelligence } from "./meeting-intelligence-generator";
import { generateMeetingIntelligenceStep } from "./meeting-intelligence-step";

afterEach(() => vi.unstubAllEnvs());
it("persists bounded map/reduce steps and resumes across serialized checkpoints without repeating maps", async () => {
  vi.stubEnv("MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS", "1200");
  const turns = Array.from({ length: 6 }, (_, index) => ({
    endMs: (index + 1) * 1000,
    id: `t${index}`,
    speakerDisplayName: null,
    speakerKey: "speaker",
    startMs: index * 1000,
    text: "测试".repeat(500),
  }));
  let mapped = 0;
  const agent = {
    generate: vi.fn((prompt: string) => {
      const [, transcript] = prompt.split("转录 JSON：\n");
      const id = transcript ? JSON.parse(transcript.split("\n")[0] ?? "[]")[0].id : "t0";
      if (transcript) {
        mapped += 1;
      }
      const content: MeetingIntelligencePayload = {
        actionItems: [],
        decisions: [],
        openQuestions: [],
        summary: id,
        template: "general",
        topics: [{ evidenceTurnIds: [id], summary: id, title: id }],
      };
      return Promise.resolve({ text: JSON.stringify(content) });
    }),
  };
  const generate: typeof generateMeetingIntelligence = (input, _agent, _policy, runtime) =>
    generateMeetingIntelligence(input, agent, undefined, runtime);
  let progress: MeetingIntelligenceGenerationProgress | null = null;
  let completed = false;
  for (let step = 0; step < 12; step += 1) {
    const before = mapped;
    const result = await generateMeetingIntelligenceStep(
      { template: "general", turns },
      progress,
      generate,
    );
    expect(mapped - before).toBeLessThanOrEqual(3);
    if (result.state === "ready") {
      completed = true;
      expect(result.content.template).toBe("general");
      break;
    }
    const serialized = JSON.stringify(result.progress);
    progress = meetingIntelligenceGenerationProgressSchema.parse(JSON.parse(serialized));
  }
  expect(completed).toBe(true);
  expect(mapped).toBe(6);
});
