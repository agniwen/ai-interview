import type { resumePoolItem } from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import { buildResumeProfileSnapshotFromProfile } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resume-profile-snapshot";
import {
  formatResumeEducationItems,
  formatResumeEducationLines,
} from "@arc/shared/resume-education";
import type {
  ResumePoolDetail,
  ResumePoolJobBindingMode,
  ResumePoolListRecord,
  ResumePoolProfileHighlights,
  ResumePoolSourceChannel,
} from "@arc/shared/resume-pool";

type PoolRow = typeof resumePoolItem.$inferSelect;
interface PoolImportRow {
  creatorImage: string | null;
  creatorName: string | null;
  importedAt: Date;
  resumeRecordId: string;
}

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

function experiencePeriodRank(period: string | null | undefined): number {
  const text = cleanHighlightText(period);
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }
  if (/(至今|现在|目前|present|current)/iu.test(text)) {
    return Number.POSITIVE_INFINITY;
  }
  const months = [...text.matchAll(/(\d{4})\s*[./年-]\s*(\d{1,2})\s*月?/gu)].map(
    ([, year, month]) => Number(year) * 12 + Number(month),
  );
  if (months.length > 0) {
    return months.at(-1) ?? Number.NEGATIVE_INFINITY;
  }
  const years = [...text.matchAll(/(?:^|[^\d])(\d{4})(?=$|[^\d])/gu)].map(
    ([, year]) => Number(year) * 12,
  );
  return years.at(-1) ?? Number.NEGATIVE_INFINITY;
}

function findLatestExperience<T extends { period: string | null }>(
  experiences: T[],
  getName: (experience: T) => string | null | undefined,
): T | undefined {
  return experiences
    .filter((experience) => cleanHighlightText(getName(experience)))
    .toSorted((a, b) => {
      const aRank = experiencePeriodRank(a.period);
      const bRank = experiencePeriodRank(b.period);
      if (aRank === bRank) {
        return 0;
      }
      return bRank > aRank ? 1 : -1;
    })
    .at(0);
}

export function buildProfileHighlights(profile: ResumeProfile | null): ResumePoolProfileHighlights {
  if (!profile) {
    return {
      educationItems: [],
      educationLines: [],
      latestCompany: null,
      latestCompanyDetail: null,
      latestProject: null,
      latestProjectDetail: null,
      schools: [],
    };
  }
  const schools = profile.schools
    .map(cleanHighlightText)
    .filter((item): item is string => item !== null);
  const latestCompany = findLatestExperience(profile.workExperiences, (item) => item.company);
  const latestProject = findLatestExperience(profile.projectExperiences, (item) => item.name);
  return {
    educationItems: formatResumeEducationItems(profile.educationExperiences),
    educationLines: formatResumeEducationLines(profile.educationExperiences),
    latestCompany: cleanHighlightText(latestCompany?.company),
    latestCompanyDetail: latestCompany
      ? {
          period: cleanHighlightText(latestCompany.period),
          role: cleanHighlightText(latestCompany.role),
          summary: cleanHighlightText(latestCompany.summary),
        }
      : null,
    latestProject: cleanHighlightText(latestProject?.name),
    latestProjectDetail: latestProject
      ? {
          period: cleanHighlightText(latestProject.period),
          role: cleanHighlightText(latestProject.role),
          summary: cleanHighlightText(latestProject.summary),
        }
      : null,
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
  importRows: PoolImportRow[] = [],
  uploaderMeta: PoolUploaderMeta = EMPTY_UPLOADER_META,
  sourceChannel: ResumePoolSourceChannel | null = null,
  duplicateMatch: ResumeDuplicateMatchSummary | null = null,
  jobDescriptionName: string | null = null,
  resumeParseRetryable = false,
  jobBindingMode: ResumePoolJobBindingMode | null = null,
): ResumePoolListRecord {
  const latestImport = importRows[0] ?? null;
  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    duplicateMatch,
    id: row.id,
    importedAt: latestImport?.importedAt.toISOString() ?? null,
    importedRecords: importRows.map((item) => ({
      creatorImage: item.creatorImage,
      creatorName: item.creatorName,
      importedAt: item.importedAt.toISOString(),
      resumeRecordId: item.resumeRecordId,
    })),
    importedResumeRecordId: latestImport?.resumeRecordId ?? null,
    jobBindingMode: row.jobDescriptionId ? jobBindingMode : null,
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
    resumeParseRetryable,
    resumeParseStatus: row.resumeParseStatus,
    resumeParsedAt: serializeDate(row.resumeParsedAt),
    resumeProfileSnapshot: buildResumeProfileSnapshotFromProfile(row.resumeProfile),
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
  importRows: PoolImportRow[] = [],
  uploaderMeta: PoolUploaderMeta = EMPTY_UPLOADER_META,
  sourceChannel: ResumePoolSourceChannel | null = null,
  duplicateMatch: ResumeDuplicateMatchSummary | null = null,
  jobDescriptionName: string | null = null,
  resumeParseRetryable = false,
  jobBindingMode: ResumePoolJobBindingMode | null = null,
): ResumePoolDetail {
  return {
    ...toResumePoolListRecord(
      row,
      importRows,
      uploaderMeta,
      sourceChannel,
      duplicateMatch,
      jobDescriptionName,
      resumeParseRetryable,
      jobBindingMode,
    ),
    resumeProfile: row.resumeProfile,
  };
}
