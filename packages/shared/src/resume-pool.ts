import { z } from "zod";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeEducationDisplayItem } from "./resume-education";
import type { ResumeDuplicateMatchSummary } from "./resume-duplicates";
import type {
  ResumePoolScope,
  ResumePoolStatus,
  ResumeJobMatchRunStatus,
  ResumeJobMatchSelectionMethod,
} from "@arc/db-schema/schema";
import type { ResumeLibraryProfileSnapshot } from "./studio-resumes";
import type {
  QualitativeRecommendationLevel,
  QualitativeResumeEvaluation,
} from "@arc/db-schema/qualitative-resume-evaluation";

export const resumePoolScopeSchema = z.enum(["private", "public"]);
export const resumePoolStatusSchema = z.enum(["active", "archived"]);
export const resumePoolInitialRecruitmentStageSchema = z.enum([
  "screening",
  "ai_interview",
  "human_interview",
]);

export const resumePoolCreateSchema = z.object({
  candidateEmail: z.string().trim().max(200).nullable().optional(),
  candidateName: z.string().trim().max(120).nullable().optional(),
  candidatePhone: z.string().trim().max(40).nullable().optional(),
  jobDescriptionId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(10_000).nullable().optional(),
  scope: resumePoolScopeSchema,
  targetRole: z.string().trim().max(120).nullable().optional(),
});

export const resumePoolImportSchema = z.object({
  dedupPolicy: z.enum(["check", "force"]).default("check"),
  initialRecruitmentStage: resumePoolInitialRecruitmentStageSchema.default("screening"),
  jobDescriptionId: z.string().trim().min(1).nullable().optional(),
  jobDescriptionMode: z.enum(["none", "bind"]).default("none"),
  reimport: z.boolean().optional(),
});

export type ResumePoolCreateInput = z.infer<typeof resumePoolCreateSchema>;
export type ResumePoolImportInput = z.infer<typeof resumePoolImportSchema>;
export type ResumePoolInitialRecruitmentStage = z.infer<
  typeof resumePoolInitialRecruitmentStageSchema
>;

export interface ResumePoolLatestExperienceDetail {
  period: string | null;
  role: string | null;
  summary: string | null;
}

export interface ResumePoolProfileHighlights {
  educationItems: ResumeEducationDisplayItem[];
  educationLines: string[];
  latestCompany: string | null;
  latestCompanyDetail: ResumePoolLatestExperienceDetail | null;
  latestProject: string | null;
  latestProjectDetail: ResumePoolLatestExperienceDetail | null;
  personalStrengths: string[];
  schools: string[];
}

export interface ResumePoolImportedRecord {
  creatorImage: string | null;
  creatorName: string | null;
  importedAt: string;
  resumeRecordId: string;
}

export type ResumePoolSourceChannel = "mail_ingest" | "referral";
export type ResumePoolJobBindingMode = "automatic" | "manual";

export interface ResumePoolListRecord {
  id: string;
  scope: ResumePoolScope;
  status: ResumePoolStatus;
  organizationId: string | null;
  createdBy: string | null;
  uploaderEmail: string | null;
  uploaderImage: string | null;
  uploaderName: string | null;
  uploaderOrganizationName: string | null;
  sourcePoolItemId: string | null;
  sourceOrganizationId: string | null;
  sourceUserId: string | null;
  sourceChannel: ResumePoolSourceChannel | null;
  publishedAt: string | null;
  publishedBy: string | null;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  notes: string | null;
  qualitativeRecommendationLevel: QualitativeRecommendationLevel | null;
  qualitativeResumeSummary: string | null;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  jobBindingMode: ResumePoolJobBindingMode | null;
  resumeFileName: string | null;
  resumeStorageKey: string | null;
  resumeContentHash: string | null;
  resumeEvaluationContractVersion: string | null;
  resumeEvaluationGeneratedAt: string | null;
  resumeParseStatus: ResumeParseStatus;
  resumeParseRetryable: boolean;
  resumeParseError: string | null;
  resumeParsedAt: string | null;
  workYears: number | null;
  masteredSkills: string[];
  profileHighlights: ResumePoolProfileHighlights;
  resumeProfileSnapshot: ResumeLibraryProfileSnapshot;
  skillsNormalized: string[];
  createdAt: string;
  updatedAt: string;
  importedResumeRecordId: string | null;
  importedAt: string | null;
  importedRecords: ResumePoolImportedRecord[];
  duplicateMatch: ResumeDuplicateMatchSummary | null;
}

export interface ResumePoolDetail extends ResumePoolListRecord {
  qualitativeResumeEvaluation: QualitativeResumeEvaluation | null;
  resumeProfile: ResumeProfile | null;
}

export interface ResumePoolJobMatchCandidate {
  aiRank: number | null;
  aiReason: string | null;
  aiScore: number | null;
  available: boolean;
  code: string | null;
  departmentName: string | null;
  id: string;
  isCurrent: boolean;
  name: string;
  recallRank: number | null;
  vectorScore: number | null;
}

export interface ResumePoolJobMatchResult {
  candidates: ResumePoolJobMatchCandidate[];
  createdAt: string;
  id: string;
  selectedJobDescriptionId: string | null;
  selectionMethod: ResumeJobMatchSelectionMethod | null;
  status: ResumeJobMatchRunStatus;
}

export interface PaginatedResumePoolResult {
  records: ResumePoolListRecord[];
  total: number;
}

export interface ResumePoolUploaderOption {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

export interface ResumePoolImportSuccessResult {
  resumeRecordId: string;
  status: "imported";
}

export interface ResumePoolImportDuplicateMatchRecord {
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  conflictingSignals?: string[];
  createdAt: string;
  id: string;
  jobDescriptionName: string | null;
  level?: "high" | "low" | "medium";
  resumeProfileSnapshot?: ResumeLibraryProfileSnapshot | null;
  skills?: string[];
  score?: number;
  semanticReasons?: string[];
  similarity?: {
    resumeOverview?: number;
    skillRole?: number;
    workProject?: number;
  };
  status: "active" | "archived";
  targetRole: string | null;
}

export interface ResumePoolImportDuplicateResult {
  matches: ResumePoolImportDuplicateMatchRecord[];
  status: "duplicate_found";
}

export type ResumePoolImportResult =
  | ResumePoolImportDuplicateResult
  | ResumePoolImportSuccessResult;

export const resumePoolScopeMeta = {
  private: { label: "私有简历池" },
  public: { label: "公共简历池" },
} satisfies Record<ResumePoolScope, { label: string }>;
