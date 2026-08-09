import { MEETING_TRANSCRIPTION_PROVIDERS } from "@arc/shared/meeting-transcription";
import type { MeetingTranscriptionProviderId } from "@arc/shared/meeting-transcription";
import type { MeetingTranscriptionBenchmarkRun, MeetingTranscriptionBenchmarkScore } from "./types";

const PRODUCTION_ELIGIBLE_PROVIDERS = new Set<MeetingTranscriptionProviderId>([
  "deepgram",
  "openai",
]);

function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function meanScore(
  runs: MeetingTranscriptionBenchmarkRun[],
  key: keyof MeetingTranscriptionBenchmarkScore,
): number | null {
  return mean(runs.flatMap((run) => (run.score ? [run.score[key]] : [])));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function normalize(value: number | null, values: (number | null)[]): number {
  const available = values.flatMap((item) => (item === null ? [] : [item]));
  const minimum = Math.min(...available);
  const maximum = Math.max(...available);
  return value === null || !Number.isFinite(minimum) || maximum === minimum
    ? 0
    : (value - minimum) / (maximum - minimum);
}

function deletionPenalty(outcomes: string[]): number {
  if (outcomes.includes("delete-failed")) {
    return 3;
  }
  return outcomes.includes("unsupported") ? 1 : 0;
}

export function buildMeetingTranscriptionBenchmarkReport(input: {
  corpusId: string;
  expectedCaseIds: string[];
  generatedAt: string;
  runs: MeetingTranscriptionBenchmarkRun[];
}) {
  const blockers = new Set<string>();
  for (const provider of MEETING_TRANSCRIPTION_PROVIDERS) {
    for (const caseId of input.expectedCaseIds) {
      const matches = input.runs.filter(
        (run) => run.provider === provider && run.caseId === caseId,
      );
      if (matches.length === 0) {
        blockers.add("provider-case-missing");
      }
      if (matches.length > 1) {
        blockers.add("provider-case-duplicate");
      }
    }
  }
  if (input.runs.some((run) => run.actualCostUsd === null)) {
    blockers.add("actual-cost-missing");
  }
  if (input.runs.some((run) => run.region.endsWith("-unverified"))) {
    blockers.add("provider-region-unverified");
  }
  const providers = MEETING_TRANSCRIPTION_PROVIDERS.map((provider) => {
    const runs = input.runs.filter((run) => run.provider === provider);
    const succeeded = runs.filter((run) => run.status === "succeeded");
    return {
      actualCostUsd: runs.some((run) => run.actualCostUsd === null)
        ? null
        : sum(runs.flatMap((run) => (run.actualCostUsd === null ? [] : [run.actualCostUsd]))),
      caseCount: runs.length,
      deletionOutcomes: [...new Set(runs.map((run) => run.deletion))].toSorted(),
      failureRate: runs.length === 0 ? 1 : 1 - succeeded.length / runs.length,
      latencyMs: mean(runs.map((run) => run.latencyMs)),
      metrics: {
        chineseCharacterErrorRate: meanScore(succeeded, "chineseCharacterErrorRate"),
        englishEntityRecall: meanScore(succeeded, "englishEntityRecall"),
        meanTimestampDriftMs: meanScore(succeeded, "meanTimestampDriftMs"),
        overlapSpeechLossRate: meanScore(succeeded, "overlapSpeechLossRate"),
        speakerErrorRate: meanScore(succeeded, "speakerErrorRate"),
        technicalEntityRecall: meanScore(succeeded, "technicalEntityRecall"),
      },
      provider,
      regions: [...new Set(runs.map((run) => run.region))].toSorted(),
      retryRate:
        runs.length === 0 ? null : runs.filter((run) => run.retryCount > 0).length / runs.length,
    };
  });
  if (providers.every((provider) => provider.failureRate === 1)) {
    blockers.add("no-successful-provider");
  }
  const ranked = providers
    .filter((provider) => provider.caseCount > 0)
    .map((provider) => ({
      provider: provider.provider,
      score:
        provider.failureRate * 10 +
        (provider.metrics.chineseCharacterErrorRate ?? 1) * 4 +
        (provider.metrics.speakerErrorRate ?? 1) * 2 +
        (provider.metrics.overlapSpeechLossRate ?? 1) * 2 +
        (1 - (provider.metrics.technicalEntityRecall ?? 0)) +
        (1 - (provider.metrics.englishEntityRecall ?? 0)) +
        (provider.retryRate ?? 0) +
        normalize(
          provider.latencyMs,
          providers.map((item) => item.latencyMs),
        ) *
          0.5 +
        normalize(
          provider.actualCostUsd,
          providers.map((item) => item.actualCostUsd),
        ) *
          0.5 +
        deletionPenalty(provider.deletionOutcomes),
    }))
    .toSorted((left, right) => left.score - right.score);
  if (blockers.size === 0 && ranked[0] && !PRODUCTION_ELIGIBLE_PROVIDERS.has(ranked[0].provider)) {
    blockers.add("top-provider-not-production-eligible");
  }
  const ready = blockers.size === 0;
  return {
    corpusId: input.corpusId,
    decision: {
      blockers: [...blockers].toSorted(),
      ranking: ranked,
      rankingMethod: "quality-v1+failure+retry+normalized-latency+normalized-actual-cost+deletion",
      ready,
      recommendedProvider: ready
        ? ((ranked[0]?.provider ?? null) as MeetingTranscriptionProviderId | null)
        : null,
    },
    generatedAt: input.generatedAt,
    providers,
    runCount: input.runs.length,
  };
}
