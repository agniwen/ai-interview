import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { generateMeetingIntelligence } from "./meeting-intelligence-generator";
import { applyIntelligenceMergePlan } from "./meeting-intelligence-compact-reduce";
import type {
  MeetingIntelligenceGenerationProgress,
  MeetingIntelligencePayload,
} from "@app/shared/meeting-intelligence";

afterEach(() => vi.unstubAllEnvs());
const payload = (id: string): MeetingIntelligencePayload => ({
  actionItems: [],
  decisions: [],
  openQuestions: [],
  summary: id,
  template: "general",
  topics: [{ evidenceTurnIds: [id], summary: id, title: id }],
});

it("keeps original evidence and independent facts while applying a later correction", () => {
  const result = applyIntelligenceMergePlan(
    [payload("old"), payload("corrected"), payload("other")],
    {
      replacements: [{ keep: "1:topics:0", remove: ["0:topics:0"] }],
      summary: "修正后总结",
    },
  );
  expect(result).toMatchObject({
    topics: [
      { evidenceTurnIds: ["corrected"], summary: "corrected" },
      { evidenceTurnIds: ["other"], summary: "other" },
    ],
  });
  expect(() =>
    applyIntelligenceMergePlan([payload("old")], {
      replacements: [{ keep: "missing", remove: ["0:topics:0"] }],
      summary: "错误",
    }),
  ).toThrow();
});

it("runs at most three segments concurrently and reuses persisted content including context", async () => {
  vi.stubEnv("MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS", "1200");
  let active = 0;
  let peak = 0;
  let mapped = 0;
  const turns = Array.from({ length: 6 }, (_, i) => ({
    endMs: (i + 1) * 1000,
    id: `t${i}`,
    speakerDisplayName: null,
    speakerKey: "speaker",
    startMs: i * 1000,
    text: "测".repeat(1000),
  }));
  const generate = vi.fn(async (prompt: string) => {
    const [, transcript] = prompt.split("转录 JSON：\n");
    if (!transcript) {
      return { text: JSON.stringify(payload("t0")) };
    }
    const [{ id }] = JSON.parse(transcript.split("\n")[0] ?? "[]");
    mapped += 1;
    active += 1;
    peak = Math.max(peak, active);
    await delay(5);
    active -= 1;
    return { text: JSON.stringify(payload(id)) };
  });
  const snapshots: MeetingIntelligenceGenerationProgress[] = [];
  await generateMeetingIntelligence({ template: "general", turns }, { generate }, undefined, {
    saveProgress: (progress) => {
      snapshots.push(structuredClone(progress));
      return Promise.resolve(true);
    },
  });
  expect(peak).toBe(3);
  expect(mapped).toBe(6);
  const cache = snapshots.at(-1)?.segmentCache;
  expect(cache).toHaveLength(6);
  mapped = 0;
  await generateMeetingIntelligence({ template: "general", turns }, { generate }, undefined, {
    progress: {
      completed: [],
      kind: "progress",
      maxReduceChars: 24_000,
      maxTranscriptChars: 1200,
      phase: "map",
      segmentCache: cache,
      version: "map-reduce-v1",
    },
  });
  expect(mapped).toBe(0);
  turns[2] = {
    ...turns[2],
    endMs: 3000,
    id: "t2",
    speakerDisplayName: null,
    speakerKey: "speaker",
    startMs: 2000,
    text: "改".repeat(1000),
  };
  await generateMeetingIntelligence({ template: "general", turns }, { generate }, undefined, {
    progress: {
      completed: [],
      kind: "progress",
      maxReduceChars: 24_000,
      maxTranscriptChars: 1200,
      phase: "map",
      segmentCache: cache,
      version: "map-reduce-v1",
    },
  });
  // Changed segment and the next segment's overlap.
  expect(mapped).toBe(2);
});

it("skips model calls when a verified live prefix covers the complete final transcript", async () => {
  const generate = vi.fn();
  const content = payload("t0");
  const result = await generateMeetingIntelligence(
    {
      template: "general",
      turns: [
        {
          endMs: 1000,
          id: "t0",
          speakerDisplayName: null,
          speakerKey: "local",
          startMs: 0,
          text: "已确认的字幕",
        },
      ],
    },
    { generate },
    undefined,
    { livePrefix: { content, turnCount: 1 } },
  );
  expect(result).toEqual(content);
  expect(generate).not.toHaveBeenCalled();
});
