export type ResumeDuplicateMatchLevel = "high" | "low" | "medium";

export interface ResumeDuplicateMatchSummary {
  count: number;
  highestLevel: ResumeDuplicateMatchLevel | null;
  latestDuplicate?: {
    createdAt: string;
    creatorName: string | null;
  };
}
