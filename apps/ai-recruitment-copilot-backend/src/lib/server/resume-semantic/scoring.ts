import type { ResumeSemanticTextChunk } from "./text-builders";
import type { ResumeSemanticSourceType, ResumeVectorSearchResult } from "./vector-store";

export interface VectorScores {
  resumeOverview?: number;
  skillRole?: number;
  workProject?: number;
}

export const SEARCH_LIMIT_BY_CHUNK = {
  resume_overview: 40,
  skill_role: 50,
  work_project: 50,
} as const satisfies Record<ResumeSemanticTextChunk["chunkType"], number>;

export function mergeVectorScores(
  results: ResumeVectorSearchResult[],
  expectedSourceType: ResumeSemanticSourceType,
): Map<string, VectorScores> {
  const map = new Map<string, VectorScores>();
  for (const result of results) {
    if (result.sourceType !== expectedSourceType) {
      continue;
    }
    const current = map.get(result.sourceId) ?? {};
    if (result.chunkType === "resume_overview") {
      current.resumeOverview = Math.max(current.resumeOverview ?? 0, result.score);
    } else if (result.chunkType === "work_project") {
      current.workProject = Math.max(current.workProject ?? 0, result.score);
    } else {
      current.skillRole = Math.max(current.skillRole ?? 0, result.score);
    }
    map.set(result.sourceId, current);
  }
  return map;
}

export function weightedScore(scores: VectorScores): number {
  return Math.floor(
    ((scores.skillRole ?? 0) * 0.45 +
      (scores.workProject ?? 0) * 0.35 +
      (scores.resumeOverview ?? 0) * 0.2) *
      100,
  );
}
