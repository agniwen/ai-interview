import { z } from "zod";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumePoolScope, ResumePoolStatus } from "@arc/db-schema/schema";

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

export interface ResumePoolProfileHighlights {
  latestCompany: string | null;
  latestProject: string | null;
  schools: string[];
}

export type ResumePoolSourceChannel = "mail_ingest";

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
  resumeFileName: string | null;
  resumeStorageKey: string | null;
  resumeContentHash: string | null;
  resumeParseStatus: ResumeParseStatus;
  resumeParseError: string | null;
  resumeParsedAt: string | null;
  masteredSkills: string[];
  profileHighlights: ResumePoolProfileHighlights;
  skillsNormalized: string[];
  createdAt: string;
  updatedAt: string;
  importedResumeRecordId: string | null;
  importedAt: string | null;
}

export interface ResumePoolDetail extends ResumePoolListRecord {
  resumeProfile: ResumeProfile | null;
}

export interface PaginatedResumePoolResult {
  records: ResumePoolListRecord[];
  total: number;
}

export interface ResumePoolImportSuccessResult {
  resumeRecordId: string;
  status: "imported";
}

export interface ResumePoolImportDuplicateResult {
  matches: {
    candidateEmail: string | null;
    candidateName: string;
    candidatePhone: string | null;
    id: string;
    resumeFileName: string | null;
  }[];
  status: "duplicate_found";
}

export type ResumePoolImportResult =
  | ResumePoolImportDuplicateResult
  | ResumePoolImportSuccessResult;

export const resumePoolScopeMeta: Record<ResumePoolScope, { label: string }> = {
  private: { label: "私有简历" },
  public: { label: "简历广场" },
};
