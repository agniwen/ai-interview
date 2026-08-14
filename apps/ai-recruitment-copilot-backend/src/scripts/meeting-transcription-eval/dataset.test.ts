import { describe, expect, it } from "vitest";
import { meetingTranscriptionEvalDatasetSchema } from "./dataset";

const turn = {
  confidence: null,
  endMs: 1000,
  speakerKey: "local",
  startMs: 0,
  text: "我们使用 TypeScript。",
  track: "local" as const,
};

function caseFixture(index: number) {
  return {
    assets: [
      {
        contentType: "audio/webm",
        durationMs: 1000,
        path: `audio/case-${index}.webm`,
        sha256: String((index % 9) + 1).repeat(64),
        sizeBytes: 1024,
        track: "microphone" as const,
      },
    ],
    consent: { confirmed: true as const, scope: "provider-benchmark-v1" as const },
    entities: [
      { category: "english" as const, text: "TypeScript" },
      { category: "technical" as const, text: "TypeScript" },
    ],
    id: `case-${String(index).padStart(2, "0")}`,
    overlapIntervals: [] as { endMs: number; referenceTexts: string[]; startMs: number }[],
    reference: { language: "zh", turns: [turn] },
    tags: ["mandarin", "technical"],
  };
}

describe("Meeting transcription evaluation dataset", () => {
  it("accepts one consented canonical corpus shared by all providers", () => {
    const parsed = meetingTranscriptionEvalDatasetSchema.parse({
      cases: Array.from({ length: 20 }, (_, index) => caseFixture(index)),
      corpusId: "meeting-buddy-consented-v1",
      version: 1,
    });

    expect(parsed.cases).toHaveLength(20);
    expect(parsed.cases[0]?.reference.turns[0]?.speakerKey).toBe("local");
  });

  it("rejects undersized, unconsented, duplicate, or credential-bearing corpora", () => {
    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({
        cases: Array.from({ length: 19 }, (_, index) => caseFixture(index)),
        corpusId: "too-small",
        version: 1,
      }),
    ).toThrow();

    const cases = Array.from({ length: 20 }, (_, index) => caseFixture(index));
    cases[0] = {
      ...cases[0],
      consent: { confirmed: false as never, scope: "provider-benchmark-v1" },
    };
    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({ cases, corpusId: "no-consent", version: 1 }),
    ).toThrow();

    const duplicate = Array.from({ length: 20 }, (_, index) => caseFixture(index));
    duplicate[1] = { ...duplicate[1], id: duplicate[0]?.id ?? "case-00" };
    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({
        cases: duplicate,
        corpusId: "duplicates",
        version: 1,
      }),
    ).toThrow();

    const secret = Array.from({ length: 20 }, (_, index) => caseFixture(index));
    const [firstCase] = secret;
    const firstAsset = firstCase?.assets[0];
    if (!(firstCase && firstAsset)) {
      throw new Error("expected fixture audio");
    }
    secret[0] = {
      ...firstCase,
      assets: [{ ...firstAsset, path: "?X-Amz-Credential=x" }],
    };
    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({
        cases: secret,
        corpusId: "secret",
        version: 1,
      }),
    ).toThrow();

    const traversal = Array.from({ length: 20 }, (_, index) => caseFixture(index));
    const [traversalCase] = traversal;
    const traversalAsset = traversalCase?.assets[0];
    if (!(traversalCase && traversalAsset)) {
      throw new Error("expected traversal fixture audio");
    }
    traversal[0] = {
      ...traversalCase,
      assets: [{ ...traversalAsset, path: "../../.env" }],
    };
    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({
        cases: traversal,
        corpusId: "path-traversal",
        version: 1,
      }),
    ).toThrow();
  });

  it("rejects reference and overlap timestamps beyond the source duration", () => {
    const cases = Array.from({ length: 20 }, (_, index) => caseFixture(index));
    const [firstCase] = cases;
    if (!firstCase) {
      throw new Error("expected first case");
    }
    cases[0] = {
      ...firstCase,
      overlapIntervals: [{ endMs: 2000, referenceTexts: ["甲", "乙"], startMs: 900 }],
      reference: {
        ...firstCase.reference,
        turns: [{ ...turn, endMs: 2000 }],
      },
    };

    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({
        cases,
        corpusId: "out-of-bounds",
        version: 1,
      }),
    ).toThrow("超出");
  });

  it("bounds per-case transcript and overlap annotation text", () => {
    const transcriptCases = Array.from({ length: 20 }, (_, index) => caseFixture(index));
    const [transcriptCase] = transcriptCases;
    if (!transcriptCase) {
      throw new Error("expected transcript case");
    }
    transcriptCases[0] = {
      ...transcriptCase,
      reference: {
        ...transcriptCase.reference,
        turns: Array.from({ length: 101 }, () => ({ ...turn, endMs: 1, text: "中".repeat(2000) })),
      },
    };
    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({
        cases: transcriptCases,
        corpusId: "too-much-transcript",
        version: 1,
      }),
    ).toThrow("资源预算");

    const overlapCases = Array.from({ length: 20 }, (_, index) => caseFixture(index));
    const [overlapCase] = overlapCases;
    if (!overlapCase) {
      throw new Error("expected overlap case");
    }
    overlapCases[0] = {
      ...overlapCase,
      overlapIntervals: Array.from({ length: 13 }, () => ({
        endMs: 1000,
        referenceTexts: Array.from({ length: 8 }, () => "重".repeat(1000)),
        startMs: 0,
      })),
    };
    expect(() =>
      meetingTranscriptionEvalDatasetSchema.parse({
        cases: overlapCases,
        corpusId: "too-much-overlap",
        version: 1,
      }),
    ).toThrow("资源预算");
  });
});
