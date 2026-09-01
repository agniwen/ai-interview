import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import type { JobDescriptionMatchResult } from "../../agents/job-description-match-agent";
import { matchJobDescriptionForResume } from "../../agents/job-description-match-agent";

interface ResolveJobDescriptionMatchBestEffortInput {
  jobDescriptions: JobDescriptionListRecord[];
  matcher?: (
    resumeProfile: ResumeProfile,
    candidates: JobDescriptionListRecord[],
  ) => Promise<JobDescriptionMatchResult | null>;
  resumeProfile: ResumeProfile;
}

export interface JobDescriptionMatchResponse {
  matchedId: string | null;
  reason: string | null;
}

export async function resolveJobDescriptionMatchBestEffort({
  jobDescriptions,
  matcher = matchJobDescriptionForResume,
  resumeProfile,
}: ResolveJobDescriptionMatchBestEffortInput): Promise<JobDescriptionMatchResponse> {
  if (jobDescriptions.length === 0) {
    return { matchedId: null, reason: null };
  }

  try {
    const match = await matcher(resumeProfile, jobDescriptions);

    if (!match) {
      return { matchedId: null, reason: null };
    }

    return { matchedId: match.jobDescriptionId, reason: match.reason };
  } catch (error) {
    console.warn("[match-job-description] best-effort match failed", error);
    return { matchedId: null, reason: null };
  }
}
