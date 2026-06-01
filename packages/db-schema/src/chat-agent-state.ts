export type ResumeAgentStage = "idle" | "awaiting_jd_approval" | "stage_a" | "stage_b";

export interface ResumeAgentState {
  ignoredJobDescriptionSuggestion?: boolean;
  lastStage?: ResumeAgentStage;
  pendingApproval?: {
    recommendedJobDescriptionId: string;
    toolCallId: string;
    workflowRunId?: string;
  } | null;
}
