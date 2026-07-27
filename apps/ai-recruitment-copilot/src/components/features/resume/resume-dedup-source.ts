import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { EMPTY_RESUME_PROFILE_SNAPSHOT } from "@arc/shared/studio-resumes";
import type { DedupSourceCandidate } from "@/lib/client/api";

/** Build the left-hand "current candidate" panel from a resume-library list row. */
export function toDedupSourceFromLibraryRecord(
  record: ResumeLibraryListRecord,
): DedupSourceCandidate {
  return {
    candidateEmail: record.candidateEmail,
    candidateName: record.candidateName,
    candidatePhone: record.candidatePhone,
    createdAt: record.createdAt,
    id: record.id,
    jobDescriptionName: record.jobDescriptionName,
    resumeProfileSnapshot: record.resumeProfileSnapshot ?? EMPTY_RESUME_PROFILE_SNAPSHOT,
    skills: record.resumeSkills,
    sourceType: "studio_interview",
    targetRole: record.targetRole,
    uploaderImage: record.creatorImage,
    uploaderName: record.creatorName,
  };
}

/** Build the left-hand "current candidate" panel from a resume-pool list row. */
export function toDedupSourceFromPoolRecord(record: ResumePoolListRecord): DedupSourceCandidate {
  return {
    candidateEmail: record.candidateEmail,
    candidateName: record.candidateName,
    candidatePhone: record.candidatePhone,
    createdAt: record.createdAt,
    id: record.id,
    jobDescriptionName: record.jobDescriptionName,
    resumeProfileSnapshot: record.resumeProfileSnapshot,
    skills: record.masteredSkills,
    sourceType: "resume_pool_item",
    targetRole: record.targetRole,
    uploaderImage: record.uploaderImage,
    uploaderName: record.uploaderName,
  };
}
