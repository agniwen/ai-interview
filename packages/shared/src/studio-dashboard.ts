import type { OfferDraftStatus } from "@app/db-schema/studio-interviews";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";

export type DashboardActionSeverity = "info" | "warning" | "danger";

export const dashboardRecruitingActionScopeValues = [
  "screening",
  "ai_pending",
  "ai_interrupted",
  "human_pending",
  "offer_sent",
] as const;
export type DashboardRecruitingActionScope = (typeof dashboardRecruitingActionScopeValues)[number];

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
  activeJobs: number;
  formsSubmitted30d: number;
  aiCompleted30d: number;
  humanCompleted30d: number;
  offersSent30d: number;
  progressing: number;
  offerOnboarding: number;
  hired: number;
  negativeClosed: number;
  vacancies: number;
  unconfiguredHeadcount: number;
}

export interface DashboardCumulativeFunnel {
  resumesAdded: number;
  enteredInterview: number;
  enteredSecondInterview: number;
  enteredOffer: number;
  hired: number;
}

export interface DashboardRecruiterProgressRow {
  userId: string | null;
  userName: string;
  userImage: string | null;
  userRemark: string | null;
  total: number;
  interviewing: number;
  offerOnboarding: number;
  hired: number;
  pendingActions: number;
}

export interface DashboardVacancyRow {
  id: string;
  name: string;
  departmentName: string | null;
  headcount: number | null;
  hired: number;
  gap: number;
}

export interface RecruitingDashboardMetrics {
  resume: ResumeLibraryMetrics;
  actions: DashboardActionItem[];
  activity: DashboardActivityRow[];
  jobPipeline: DashboardJobPipelineRow[];
  offerStatuses: DashboardOfferStatusRow[];
  summary: DashboardSummary;
  cumulativeFunnel: DashboardCumulativeFunnel;
  recruiterProgress: DashboardRecruiterProgressRow[];
  vacancies: DashboardVacancyRow[];
}
