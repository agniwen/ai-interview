import type { resumePoolItem } from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import {
  formatResumeEducationItems,
  formatResumeEducationLines,
} from "@arc/shared/resume-education";
import type {
  ResumePoolDetail,
  ResumePoolListRecord,
  ResumePoolProfileHighlights,
  ResumePoolSourceChannel,
} from "@arc/shared/resume-pool";

type PoolRow = typeof resumePoolItem.$inferSelect;

export interface PoolUploaderMeta {
  uploaderEmail: string | null;
  uploaderImage: string | null;
  uploaderName: string | null;
  uploaderOrganizationName: string | null;
}

export const EMPTY_UPLOADER_META: PoolUploaderMeta = {
  uploaderEmail: null,
  uploaderImage: null,
  uploaderName: null,
  uploaderOrganizationName: null,
};

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function cleanHighlightText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text === "未发现信息") {
    return null;
  }
  return text;
}

function firstPresentValue(values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const text = cleanHighlightText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

export function buildProfileHighlights(profile: ResumeProfile | null): ResumePoolProfileHighlights {
  if (!profile) {
    return {
      educationItems: [],
      educationLines: [],
      latestCompany: null,
      latestProject: null,
      schools: [],
    };
  }
  const schools = profile.schools
    .map(cleanHighlightText)
    .filter((item): item is string => item !== null);
  return {
    educationItems: formatResumeEducationItems(profile.educationExperiences),
    educationLines: formatResumeEducationLines(profile.educationExperiences),
    latestCompany: firstPresentValue(profile.workExperiences.map((item) => item.company)),
    latestProject: firstPresentValue(profile.projectExperiences.map((item) => item.name)),
    schools,
  };
}

export function buildMasteredSkills(profile: ResumeProfile | null): string[] {
  return [
    ...new Set(
      (profile?.skills ?? [])
        .map(cleanHighlightText)
        .filter((skill): skill is string => skill !== null),
    ),
  ];
}

export function toResumePoolListRecord(
  row: PoolRow,
  importRow?: { importedAt: Date; resumeRecordId: string } | null,
  uploaderMeta: PoolUploaderMeta = EMPTY_UPLOADER_META,
  sourceChannel: ResumePoolSourceChannel | null = null,
  duplicateMatch: ResumeDuplicateMatchSummary | null = null,
  jobDescriptionName: string | null = null,
): ResumePoolListRecord {
  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    duplicateMatch,
    id: row.id,
    importedAt: importRow ? importRow.importedAt.toISOString() : null,
    importedResumeRecordId: importRow?.resumeRecordId ?? null,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName,
    masteredSkills: buildMasteredSkills(row.resumeProfile),
    notes: row.notes,
    organizationId: row.organizationId,
    profileHighlights: buildProfileHighlights(row.resumeProfile),
    publishedAt: serializeDate(row.publishedAt),
    publishedBy: row.publishedBy,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    resumeParseError: row.resumeParseError,
    resumeParseStatus: row.resumeParseStatus,
    resumeParsedAt: serializeDate(row.resumeParsedAt),
    resumeStorageKey: row.resumeStorageKey,
    scope: row.scope,
    skillsNormalized: row.skillsNormalized,
    sourceChannel: row.sourceChannel ?? sourceChannel,
    sourceOrganizationId: row.sourceOrganizationId,
    sourcePoolItemId: row.sourcePoolItemId,
    sourceUserId: row.sourceUserId,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: row.updatedAt.toISOString(),
    uploaderEmail: uploaderMeta.uploaderEmail,
    uploaderImage: uploaderMeta.uploaderImage,
    uploaderName: uploaderMeta.uploaderName,
    uploaderOrganizationName: uploaderMeta.uploaderOrganizationName,
    workYears: row.resumeProfile?.workYears ?? null,
  };
}

export function toResumePoolDetail(
  row: PoolRow,
  importRow?: { importedAt: Date; resumeRecordId: string } | null,
  uploaderMeta: PoolUploaderMeta = EMPTY_UPLOADER_META,
  sourceChannel: ResumePoolSourceChannel | null = null,
  duplicateMatch: ResumeDuplicateMatchSummary | null = null,
  jobDescriptionName: string | null = null,
): ResumePoolDetail {
  return {
    ...toResumePoolListRecord(
      row,
      importRow,
      uploaderMeta,
      sourceChannel,
      duplicateMatch,
      jobDescriptionName,
    ),
    resumeProfile: row.resumeProfile,
  };
}
