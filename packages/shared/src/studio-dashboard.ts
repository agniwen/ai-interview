import type { OfferDraftStatus } from "@app/db-schema/studio-interviews";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";

export type DashboardActionSeverity = "info" | "warning" | "danger";

export interface DashboardActionItem {
  key: string;
  label: string;
  count: number;
  description: string;
  severity: DashboardActionSeverity;
}

export interface DashboardActivityRow {
  day: string;
  resumesAdded: number;
  aiCompleted: number;
  humanCompleted: number;
  offersSent: number;
}

export interface DashboardJobPipelineRow {
  id: string;
  name: string;
  departmentName: string | null;
  total: number;
  screening: number;
  aiInterview: number;
  humanInterview: number;
  offer: number;
}

export interface DashboardOfferStatusRow {
  status: OfferDraftStatus;
  count: number;
}

export interface DashboardSummary {
  formsSubmitted30d: number;
  aiCompleted30d: number;
  humanCompleted30d: number;
  offersSent30d: number;
}

export interface RecruitingDashboardMetrics {
  resume: ResumeLibraryMetrics;
  actions: DashboardActionItem[];
  activity: DashboardActivityRow[];
  jobPipeline: DashboardJobPipelineRow[];
  offerStatuses: DashboardOfferStatusRow[];
  summary: DashboardSummary;
}
