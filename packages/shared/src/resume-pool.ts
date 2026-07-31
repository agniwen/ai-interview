import { z } from "zod";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeEducationDisplayItem } from "./resume-education";
import type { ResumeDuplicateMatchSummary } from "./resume-duplicates";
import type { ResumePoolScope, ResumePoolStatus } from "@arc/db-schema/schema";
import type { ResumeLibraryProfileSnapshot } from "./studio-resumes";

export const resumePoolScopeSchema = z.enum(["private", "public"]);
export const resumePoolStatusSchema = z.enum(["active", "archived"]);

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
  jobDescriptionId: z.string().trim().min(1).nullable().optional(),
  jobDescriptionMode: z.enum(["none", "bind"]).default("none"),
});

export type ResumePoolCreateInput = z.infer<typeof resumePoolCreateSchema>;
export type ResumePoolImportInput = z.infer<typeof resumePoolImportSchema>;

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
  schools: string[];
}

export type ResumePoolSourceChannel = "mail_ingest" | "referral";

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
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  resumeStorageKey: string | null;
  resumeContentHash: string | null;
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
  duplicateMatch: ResumeDuplicateMatchSummary | null;
}

export interface ResumePoolDetail extends ResumePoolListRecord {
  resumeProfile: ResumeProfile | null;
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

export const resumePoolScopeMeta: Record<ResumePoolScope, { label: string }> = {
  private: { label: "私有简历池" },
  public: { label: "公共简历池" },
};
