import type { PositiveVerdict } from "./types";

export const THRESHOLD = 55;
export const TOP_K = 20;

export interface ClassifyCore {
  loadedIds: Set<string>;
  ranked: { candidateId: string; score: number }[];
  retrievedIds: Set<string>;
}

export interface ClassifyInput {
  candidateId: string;
  core: ClassifyCore;
  hasAnyVector: boolean;
  jobDescriptionId: string;
}

function compareCodepoint(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function stableRanked(core: ClassifyCore) {
  return [...core.ranked].toSorted(
    (a, b) => b.score - a.score || compareCodepoint(a.candidateId, b.candidateId),
  );
}

export function classifyPositive(i: ClassifyInput): PositiveVerdict {
  const base = {
    candidateId: i.candidateId,
    jobDescriptionId: i.jobDescriptionId,
    rawRank: null,
    score: null,
    shownRank: null,
  };
  if (!i.hasAnyVector) {
    return { ...base, klass: "not_indexed" };
  }
  if (!i.core.retrievedIds.has(i.candidateId)) {
    return { ...base, klass: "recall_capped" };
  }
  if (!i.core.loadedIds.has(i.candidateId)) {
    return { ...base, klass: "status_filtered" };
  }
  const ranked = stableRanked(i.core);
  const rawRank = ranked.findIndex((c) => c.candidateId === i.candidateId) + 1;
  const { score } = ranked[rawRank - 1];
  if (score < THRESHOLD) {
    return { ...base, klass: "below_threshold", rawRank, score };
  }
  const shownRank =
    ranked.filter((c) => c.score >= THRESHOLD).findIndex((c) => c.candidateId === i.candidateId) +
    1;
  if (shownRank > TOP_K) {
    return { ...base, klass: "retrieved_low_rank", rawRank, score, shownRank };
  }
  return { ...base, klass: "hit", rawRank, score, shownRank };
}
