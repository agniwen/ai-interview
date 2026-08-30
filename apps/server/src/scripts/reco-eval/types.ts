export type LabelSource = "mined" | "manual";

export interface PositiveLabel {
  // = studio_interview.id
  candidateId: string;
  jobDescriptionId: string;
  label: "positive";
  source: LabelSource;
}

export interface FacetSimilarity {
  resumeOverview?: number;
  skillRole?: number;
  workProject?: number;
}

export type FailureClass =
  | "not_indexed"
  | "recall_capped"
  | "status_filtered"
  | "below_threshold"
  | "retrieved_low_rank";

export type HitOrClass = "hit" | FailureClass;

export interface PositiveVerdict {
  candidateId: string;
  jobDescriptionId: string;
  klass: HitOrClass;
  // 完整排序 1-based 名次；不在列表为 null
  rawRank: number | null;
  score: number | null;
  // score>=55 子列表名次；不适用为 null
  shownRank: number | null;
}
