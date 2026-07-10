import type { FailureClass, PositiveVerdict } from "./types";

const FAILS: FailureClass[] = [
  "not_indexed",
  "recall_capped",
  "status_filtered",
  "below_threshold",
  "retrieved_low_rank",
];

const emptyFails = () =>
  Object.fromEntries(FAILS.map((c) => [c, 0])) as Record<FailureClass, number>;

export interface PerJdRow {
  failureCounts: Record<FailureClass, number>;
  hits: number;
  jobDescriptionId: string;
  positives: number;
}

export interface Metrics {
  evaluated: number;
  failureCounts: Record<FailureClass, number>;
  jds: number;
  macroMrr: number;
  macroRecallAt20Raw: number;
  macroRecallAt20Shown: number;
  macroRecallAt50Raw: number;
  mrr: number;
  perJd: PerJdRow[];
  recallAt20Raw: number;
  recallAt20Shown: number;
  recallAt50Raw: number;
}

const rawWithin = (verdict: PositiveVerdict, k: number) =>
  verdict.rawRank !== null && verdict.rawRank <= k;

export function computeMetrics(verdicts: PositiveVerdict[]): Metrics {
  const n = verdicts.length || 1;
  const failureCounts = emptyFails();
  const groups = new Map<string, PositiveVerdict[]>();
  let hit = 0;
  let raw20 = 0;
  let raw50 = 0;
  let mrrSum = 0;
  for (const verdict of verdicts) {
    if (verdict.klass === "hit") {
      hit += 1;
    } else {
      failureCounts[verdict.klass] += 1;
    }
    if (rawWithin(verdict, 20)) {
      raw20 += 1;
    }
    if (rawWithin(verdict, 50)) {
      raw50 += 1;
    }
    mrrSum += verdict.rawRank === null ? 0 : 1 / verdict.rawRank;
    const bucket = groups.get(verdict.jobDescriptionId) ?? [];
    bucket.push(verdict);
    groups.set(verdict.jobDescriptionId, bucket);
  }
  const perJd: PerJdRow[] = [...groups.entries()].map(([jobDescriptionId, vs]) => {
    const fc = emptyFails();
    for (const verdict of vs) {
      if (verdict.klass !== "hit") {
        fc[verdict.klass] += 1;
      }
    }
    return {
      failureCounts: fc,
      hits: vs.filter((verdict) => verdict.klass === "hit").length,
      jobDescriptionId,
      positives: vs.length,
    };
  });
  const macro = (f: (vs: PositiveVerdict[]) => number) =>
    groups.size ? [...groups.values()].reduce((s, vs) => s + f(vs), 0) / groups.size : 0;
  return {
    evaluated: verdicts.length,
    failureCounts,
    jds: groups.size,
    macroMrr: macro(
      (vs) =>
        vs.reduce((s, verdict) => s + (verdict.rawRank ? 1 / verdict.rawRank : 0), 0) / vs.length,
    ),
    macroRecallAt20Raw: macro(
      (vs) => vs.filter((verdict) => rawWithin(verdict, 20)).length / vs.length,
    ),
    macroRecallAt20Shown: macro(
      (vs) => vs.filter((verdict) => verdict.klass === "hit").length / vs.length,
    ),
    macroRecallAt50Raw: macro(
      (vs) => vs.filter((verdict) => rawWithin(verdict, 50)).length / vs.length,
    ),
    mrr: mrrSum / n,
    perJd,
    recallAt20Raw: raw20 / n,
    recallAt20Shown: hit / n,
    recallAt50Raw: raw50 / n,
  };
}
