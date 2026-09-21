import type { CandidateOutcome, PipelineStage } from "@app/db-schema/studio-interviews";
import type { QualitativeRecommendationLevel } from "@app/db-schema/qualitative-resume-evaluation";
import { qualitativeRecommendationLevelSchema } from "@app/db-schema/qualitative-resume-evaluation";
import { recruitingBoardViewSchema } from "./recruiting-board";
import { z } from "zod";

export const recruitingLedgerQuerySchema = z
  .object({
    boardView: recruitingBoardViewSchema.optional(),
    createdFrom: z.iso.date().optional(),
    createdTo: z.iso.date().optional(),
    departmentIds: z.string().optional(),
    jdIds: z.string().optional(),
    joiningFrom: z.iso.date().optional(),
    joiningTo: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    recommendationLevels: z.string().optional(),
    responsibleHrIds: z.string().optional(),
    search: z.string().trim().max(200).optional(),
    sortBy: z.enum(["createdAt", "candidateName", "joiningDate", "updatedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .superRefine((value, context) => {
    if (value.createdFrom && value.createdTo && value.createdFrom > value.createdTo) {
      context.addIssue({
        code: "custom",
        message: "创建时间起始日期不能晚于结束日期",
        path: ["createdTo"],
      });
    }
    if (value.joiningFrom && value.joiningTo && value.joiningFrom > value.joiningTo) {
      context.addIssue({
        code: "custom",
        message: "入职日期起始日期不能晚于结束日期",
        path: ["joiningTo"],
      });
    }
  });

export type RecruitingLedgerQuery = z.infer<typeof recruitingLedgerQuerySchema>;

export const recruitingLedgerInformationSyncInputSchema = z.object({ synced: z.boolean() });
export type RecruitingLedgerInformationSyncInput = z.infer<
  typeof recruitingLedgerInformationSyncInputSchema
>;

export interface RecruitingLedgerHumanRound {
  interviewerNames: string[];
  label: string;
  outcome: "pass" | "fail" | "inconclusive" | null;
  scheduledAt: string | null;
  status: "pending" | "completed" | "cancelled";
}

export interface RecruitingLedgerOffer {
  baseSalary: number;
  bonus: number | null;
  currency: string;
  joiningDate: string | null;
  status: "draft" | "sent" | "accepted" | "declined" | "expired" | "superseded";
}

export interface RecruitingLedgerRecord {
  candidateName: string;
  closedAt: string | null;
  createdAt: string;
  cycleDays: number;
  departmentName: string | null;
  documentUrl: string | null;
  firstHumanRound: RecruitingLedgerHumanRound | null;
  id: string;
  informationSyncStatus: "synced" | "not_synced";
  joiningDate: string | null;
  jobDescriptionId: string | null;
  jobName: string | null;
  jobPriority: "high" | "medium" | "low" | null;
  jobWeight: string | null;
  offer: RecruitingLedgerOffer | null;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
  probationSalary: number | null;
  progressLabel: string;
  progressTone: "success" | "warning" | "info" | "outline";
  qualitativeRecommendationLevel: QualitativeRecommendationLevel | null;
  recruitingPoints: number;
  regularSalary: number | null;
  reportingManagerName: string | null;
  responsibleHrId: string | null;
  responsibleHrName: string | null;
  salaryCurrency: string;
  secondHumanRound: RecruitingLedgerHumanRound | null;
  overseasSalary: number | null;
}

export interface RecruitingLedgerFacet {
  id: string;
  label: string;
}

export interface RecruitingLedgerJobSummary {
  active: number;
  confirmed: number;
  departmentName: string | null;
  gap: number | null;
  headcount: number | null;
  hired: number;
  id: string;
  jobPriority: "high" | "medium" | "low" | null;
  jobWeight: string | null;
  name: string;
  negativeClosed: number;
  recruitingPoints: number;
  total: number;
}

export interface RecruitingLedgerResult {
  facets: {
    departments: RecruitingLedgerFacet[];
    jobs: RecruitingLedgerFacet[];
    recruiters: RecruitingLedgerFacet[];
  };
  jobSummary: RecruitingLedgerJobSummary[];
  page: number;
  pageSize: number;
  records: RecruitingLedgerRecord[];
  total: number;
  totalPages: number;
}

export const recruitingLedgerRecommendationOptions = [
  { label: "不推荐", value: "not_recommended" },
  { label: "待定", value: "undecided" },
  { label: "推荐", value: "recommended" },
  { label: "非常推荐", value: "highly_recommended" },
] as const satisfies readonly {
  label: string;
  value: QualitativeRecommendationLevel;
}[];

export const recruitingPriorityCoefficients = {
  high: 1.5,
  low: 0.8,
  medium: 1,
} as const;

export function parseRecruitingLedgerRecommendationLevels(
  value: string | undefined,
): QualitativeRecommendationLevel[] | undefined {
  if (!value) {
    return undefined;
  }
  const levels = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      const parsed = qualitativeRecommendationLevelSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  return levels.length > 0 ? levels : undefined;
}

export function calculateRecruitingCycleDays({
  closedAt,
  createdAt,
  now = new Date(),
}: {
  closedAt: Date | string | null;
  createdAt: Date | string;
  now?: Date;
}): number {
  const start = new Date(createdAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function calculateRecruitingPoints({
  jobPriority,
  jobWeight,
  outcome,
}: {
  jobPriority: "high" | "medium" | "low" | null;
  jobWeight: string | null;
  outcome: CandidateOutcome;
}): number {
  if (outcome !== "hired") {
    return 0;
  }
  const weight = Number(jobWeight);
  if (!Number.isFinite(weight) || weight <= 0 || !jobPriority) {
    return 0;
  }
  const coefficient = recruitingPriorityCoefficients[jobPriority];
  return Math.round(weight * coefficient * 10) / 10;
}

export function calculateRecruitingGap(headcount: number | null, confirmed: number): number | null {
  return headcount === null ? null : Math.max(headcount - confirmed, 0);
}
