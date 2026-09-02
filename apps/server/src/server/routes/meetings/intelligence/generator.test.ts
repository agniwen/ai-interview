import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeetingIntelligenceGenerationProgress } from "@app/shared/meeting-intelligence";
import { generateMeetingIntelligence } from "./generator";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Meeting Intelligence generator", () => {
  it("asks the product-owned recruiting template for evidence without a hiring decision", async () => {
    const generate = vi.fn(() =>
      Promise.resolve({
        object: {
          candidateStatements: [
            {
              attribution: "candidate",
              evidenceTurnIds: ["turn-1"],
              statement: "候选人负责过支付项目",
              verification: "stated",
            },
          ],
          followUpActions: [],
          keyExperience: [],
          summary: "讨论了支付项目经验。",
          template: "recruiting-interview",
          verificationItems: [],
        },
        text: "",
      }),
    );

    await expect(
      generateMeetingIntelligence(
        {
          template: "recruiting-interview",
          turns: [
            {
              endMs: 2000,
              id: "turn-1",
              speakerDisplayName: "候选人",
              speakerKey: "candidate",
              startMs: 1000,
              text: "我负责过支付项目。",
            },
          ],
        },
        { generate },
        {
          generate: vi.fn(() =>
            Promise.resolve({
              object: { classification: "allowed", reason: "Only factual notes" },
              text: "",
            }),
          ),
        },
      ),
    ).resolves.toMatchObject({ template: "recruiting-interview" });
    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining("不得给出录用、淘汰、通过或不通过结论"),
      expect.anything(),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining('"id":"turn-1"'),
      expect.anything(),
    );
  });

  it("rejects a schema-shaped provider response that recommends hiring", async () => {
    const generate = vi.fn(() =>
      Promise.resolve({
        object: {
          candidateStatements: [],
          followUpActions: [],
          keyExperience: [],
          summary: "建议录用该候选人。",
          template: "recruiting-interview",
          verificationItems: [],
        },
        text: "",
      }),
    );

    await expect(
      generateMeetingIntelligence({ template: "recruiting-interview", turns: [] }, { generate }),
    ).rejects.toThrow("不得包含自动招聘决定");
  });

  it("rejects a semantic hiring decision even when the phrase guard does not match", async () => {
    const generate = vi.fn(() =>
      Promise.resolve({
        object: {
          candidateStatements: [],
          followUpActions: [],
          keyExperience: [],
          summary: "The feedback favors continuing the applicant's candidacy.",
          template: "recruiting-interview",
          verificationItems: [],
        },
        text: "",
      }),
    );
    const classify = vi.fn(() =>
      Promise.resolve({
        object: { classification: "hiring-decision", reason: "Advances the candidate" },
        text: "",
      }),
    );

    await expect(
      generateMeetingIntelligence(
        { template: "recruiting-interview", turns: [] },
        { generate },
        { generate: classify },
      ),
    ).rejects.toMatchObject({ name: "MeetingIntelligenceTerminalError" });
  });

  it("classifies provider-returned schema errors as terminal after local retries", async () => {
    const generate = vi.fn(() =>
      Promise.resolve({
        error: new Error("structured output schema validation failed"),
        text: "",
      }),
    );

    await expect(
      generateMeetingIntelligence({ template: "general", turns: [] }, { generate }),
    ).rejects.toMatchObject({ name: "MeetingIntelligenceTerminalError" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("maps and reduces a long transcript while retaining its evidence turn IDs", async () => {
    vi.stubEnv("MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS", "220");
    const generate = vi.fn((prompt: string) => {
      if (prompt.includes("分块 Intelligence JSON")) {
        return Promise.resolve({
          object: {
            actionItems: [],
            decisions: [
              { evidenceTurnIds: ["turn-1"], statement: "决定一" },
              { evidenceTurnIds: ["turn-2"], statement: "决定二" },
            ],
            openQuestions: [],
            summary: "合并摘要",
            template: "general",
            topics: [],
          },
          text: "",
        });
      }
      const turnId = prompt.includes('"id":"turn-1"') ? "turn-1" : "turn-2";
      return Promise.resolve({
        object: {
          actionItems: [],
          decisions: [{ evidenceTurnIds: [turnId], statement: `决定 ${turnId}` }],
          openQuestions: [],
          summary: `摘要 ${turnId}`,
          template: "general",
          topics: [],
        },
        text: "",
      });
    });

    await expect(
      generateMeetingIntelligence(
        {
          template: "general",
          turns: ["turn-1", "turn-2"].map((id, index) => ({
            endMs: index * 1000 + 2000,
            id,
            speakerDisplayName: null,
            speakerKey: "local",
            startMs: index * 1000 + 1000,
            text: "x".repeat(80),
          })),
        },
        { generate },
      ),
    ).resolves.toMatchObject({
      decisions: [{ evidenceTurnIds: ["turn-1"] }, { evidenceTurnIds: ["turn-2"] }],
      summary: "合并摘要",
    });
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("keeps every escaped transcript chunk within the configured serialized budget", async () => {
    vi.stubEnv("MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS", "220");
    const serializedMapChunks: string[] = [];
    const generate = vi.fn((prompt: string) => {
      if (!prompt.includes("分块 Intelligence JSON")) {
        const serializedTurns = prompt
          .split("转录 JSON：\n")[1]
          ?.split("\n\n请只输出一个严格符合上述字段和类型的 JSON 对象")[0];
        serializedMapChunks.push(serializedTurns ?? "");
      }
      return Promise.resolve({
        object: {
          actionItems: [],
          decisions: [],
          openQuestions: [],
          summary: "摘要",
          template: "general",
          topics: [],
        },
        text: "",
      });
    });

    await generateMeetingIntelligence(
      {
        template: "general",
        turns: [
          {
            endMs: 2,
            id: "turn-escaped",
            speakerDisplayName: null,
            speakerKey: "local",
            startMs: 1,
            text: '\n"\\'.repeat(120),
          },
        ],
      },
      { generate },
    );

    expect(serializedMapChunks.length).toBeGreaterThan(1);
    expect(serializedMapChunks.every((chunk) => chunk.length <= 220)).toBe(true);
  });

  it("resumes durable map-reduce progress without replaying completed chunks", async () => {
    vi.stubEnv("MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS", "220");
    const turns = ["turn-1", "turn-2"].map((id, index) => ({
      endMs: index * 1000 + 2000,
      id,
      speakerDisplayName: null,
      speakerKey: "local",
      startMs: index * 1000 + 1000,
      text: "x".repeat(80),
    }));
    let progress: MeetingIntelligenceGenerationProgress | null = null;
    const firstGenerate = vi.fn((prompt: string) => {
      if (prompt.includes("分块 Intelligence JSON")) {
        return Promise.reject(new Error("provider temporarily unavailable"));
      }
      const turnId = prompt.includes('"id":"turn-1"') ? "turn-1" : "turn-2";
      return Promise.resolve({
        object: {
          actionItems: [],
          decisions: [{ evidenceTurnIds: [turnId], statement: `决定 ${turnId}` }],
          openQuestions: [],
          summary: `摘要 ${turnId}`,
          template: "general",
          topics: [],
        },
        text: "",
      });
    });
    const runtime = {
      heartbeat: vi.fn(() => Promise.resolve(true)),
      saveProgress: vi.fn((value: MeetingIntelligenceGenerationProgress) => {
        progress = value;
        return Promise.resolve(true);
      }),
    };

    await expect(
      generateMeetingIntelligence(
        { template: "general", turns },
        { generate: firstGenerate },
        undefined,
        runtime,
      ),
    ).rejects.toThrow("provider temporarily unavailable");
    expect(firstGenerate).toHaveBeenCalledTimes(3);
    expect(progress).toMatchObject({ completed: [], phase: "reduce", source: expect.any(Array) });

    const resumedGenerate = vi.fn(() =>
      Promise.resolve({
        object: {
          actionItems: [],
          decisions: [
            { evidenceTurnIds: ["turn-1"], statement: "决定一" },
            { evidenceTurnIds: ["turn-2"], statement: "决定二" },
          ],
          openQuestions: [],
          summary: "恢复后的合并摘要",
          template: "general",
          topics: [],
        },
        text: "",
      }),
    );
    await expect(
      generateMeetingIntelligence(
        { template: "general", turns },
        { generate: resumedGenerate },
        undefined,
        { ...runtime, progress },
      ),
    ).resolves.toMatchObject({ summary: "恢复后的合并摘要" });
    expect(resumedGenerate).toHaveBeenCalledOnce();
    expect(resumedGenerate).toHaveBeenCalledWith(
      expect.stringContaining("分块 Intelligence JSON"),
      expect.anything(),
    );
  });

  it("stops before a provider call after losing the processing lease", async () => {
    const generate = vi.fn();

    await expect(
      generateMeetingIntelligence(
        {
          template: "general",
          turns: [
            {
              endMs: 2,
              id: "turn-1",
              speakerDisplayName: null,
              speakerKey: "local",
              startMs: 1,
              text: "讨论方案",
            },
          ],
        },
        { generate },
        undefined,
        {
          heartbeat: vi.fn(() => Promise.resolve(false)),
          saveProgress: vi.fn(() => Promise.resolve(true)),
        },
      ),
    ).rejects.toMatchObject({ name: "MeetingIntelligenceLeaseLostError" });
    expect(generate).not.toHaveBeenCalled();
  });
});
