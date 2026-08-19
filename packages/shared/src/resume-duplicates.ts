export type ResumeDuplicateMatchLevel = "high" | "low" | "medium";

export interface ResumeDuplicateMatchSummary {
  count: number;
  highestLevel: ResumeDuplicateMatchLevel | null;
  latestDuplicate?: {
    candidateName: string;
    createdAt: string;
    creatorName: string | null;
  };
}
