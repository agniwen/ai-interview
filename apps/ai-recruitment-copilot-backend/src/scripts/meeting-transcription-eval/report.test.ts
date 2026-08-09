import { describe, expect, it } from "vitest";
import { buildMeetingTranscriptionBenchmarkReport } from "./report";

describe("Meeting transcription benchmark report", () => {
  it("refuses to choose a production default without a complete same-corpus run and actual cost", () => {
    const report = buildMeetingTranscriptionBenchmarkReport({
      corpusId: "corpus-v1",
      expectedCaseIds: ["case-01"],
      generatedAt: "2026-08-09T10:00:00.000Z",
      runs: [
        {
          actualCostUsd: null,
          caseId: "case-01",
          deletion: "not-applicable",
          latencyMs: 1000,
          model: "model-a",
          provider: "openai",
          region: "international",
          retryCount: 0,
          score: {
            chineseCharacterErrorRate: 0,
            englishEntityRecall: 1,
            meanTimestampDriftMs: 0,
            overlapSpeechLossRate: 0,
            speakerErrorRate: 0,
            technicalEntityRecall: 1,
          },
          status: "succeeded",
        },
      ],
    });

    expect(report.decision.ready).toBe(false);
    expect(report.decision.blockers).toContain("actual-cost-missing");
    expect(report.decision.recommendedProvider).toBeNull();
  });

  it("chooses only from a complete traceable run and keeps region evidence", () => {
    const providers = ["deepgram", "openai", "tingwu"] as const;
    const report = buildMeetingTranscriptionBenchmarkReport({
      corpusId: "corpus-v1",
      expectedCaseIds: ["case-01"],
      generatedAt: "2026-08-09T10:00:00.000Z",
      runs: providers.map((provider, index) => ({
        actualCostUsd: index + 1,
        caseId: "case-01",
        deletion: provider === "tingwu" ? ("unsupported" as const) : ("not-applicable" as const),
        latencyMs: 1000 + index * 100,
        model: `model-${provider}`,
        provider,
        region: provider === "tingwu" ? "cn-beijing" : "international",
        retryCount: 0,
        score: {
          chineseCharacterErrorRate: index * 0.1,
          englishEntityRecall: 1 - index * 0.1,
          meanTimestampDriftMs: index * 100,
          overlapSpeechLossRate: index * 0.1,
          speakerErrorRate: index * 0.1,
          technicalEntityRecall: 1 - index * 0.1,
        },
        status: "succeeded" as const,
      })),
    });

    expect(report.decision.ready).toBe(true);
    expect(report.decision.recommendedProvider).toBe("deepgram");
    expect(report.decision.rankingMethod).toContain("actual-cost");
    expect(report.providers.find((item) => item.provider === "tingwu")?.regions).toEqual([
      "cn-beijing",
    ]);
  });

  it("keeps a benchmark-only winner in ranking but blocks a production recommendation", () => {
    const providers = ["tingwu", "deepgram", "openai"] as const;
    const report = buildMeetingTranscriptionBenchmarkReport({
      corpusId: "corpus-v1",
      expectedCaseIds: ["case-01"],
      generatedAt: "2026-08-09T10:00:00.000Z",
      runs: providers.map((provider, index) => ({
        actualCostUsd: 1,
        caseId: "case-01",
        deletion: "not-applicable" as const,
        latencyMs: 1000,
        model: "model",
        provider,
        region: "verified",
        retryCount: 0,
        score: {
          chineseCharacterErrorRate: index * 0.2,
          englishEntityRecall: 1 - index * 0.2,
          meanTimestampDriftMs: index * 100,
          overlapSpeechLossRate: index * 0.2,
          speakerErrorRate: index * 0.2,
          technicalEntityRecall: 1 - index * 0.2,
        },
        status: "succeeded" as const,
      })),
    });

    expect(report.decision.ranking[0]?.provider).toBe("tingwu");
    expect(report.decision).toMatchObject({
      blockers: ["top-provider-not-production-eligible"],
      ready: false,
      recommendedProvider: null,
    });
  });

  it("refuses duplicate paid runs and an all-failed provider matrix", () => {
    const failedRun = {
      actualCostUsd: 0.1,
      caseId: "case-01",
      deletion: "not-applicable" as const,
      latencyMs: 1000,
      model: "model",
      region: "region",
      retryCount: 0,
      score: null,
      status: "failed" as const,
    };
    const report = buildMeetingTranscriptionBenchmarkReport({
      corpusId: "corpus",
      expectedCaseIds: ["case-01"],
      generatedAt: "2026-08-09T00:00:00.000Z",
      runs: [
        { ...failedRun, provider: "openai" },
        { ...failedRun, provider: "openai" },
        { ...failedRun, provider: "deepgram" },
        { ...failedRun, provider: "tingwu" },
      ],
    });

    expect(report.decision).toMatchObject({
      blockers: ["no-successful-provider", "provider-case-duplicate"],
      ready: false,
      recommendedProvider: null,
    });
  });

  it("refuses to turn a custom endpoint's claimed region into decision evidence", () => {
    const providers = ["tingwu", "deepgram", "openai"] as const;
    const report = buildMeetingTranscriptionBenchmarkReport({
      corpusId: "corpus-v1",
      expectedCaseIds: ["case-01"],
      generatedAt: "2026-08-09T10:00:00.000Z",
      runs: providers.map((provider) => ({
        actualCostUsd: 1,
        caseId: "case-01",
        deletion: "not-applicable" as const,
        latencyMs: 1000,
        model: "model",
        provider,
        region: provider === "openai" ? "openai-custom-unverified" : "verified",
        retryCount: 0,
        score: {
          chineseCharacterErrorRate: 0,
          englishEntityRecall: 1,
          meanTimestampDriftMs: 0,
          overlapSpeechLossRate: 0,
          speakerErrorRate: 0,
          technicalEntityRecall: 1,
        },
        status: "succeeded" as const,
      })),
    });

    expect(report.decision).toMatchObject({
      blockers: ["provider-region-unverified"],
      ready: false,
      recommendedProvider: null,
    });
  });
});
