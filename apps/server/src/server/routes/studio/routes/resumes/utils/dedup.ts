import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { findSemanticResumeDuplicates } from "@app/server/lib/server/resume-semantic/dedup-service";
import type { DedupMatchRecord } from "@app/server/server/routes/studio/routes/interviews/dao/studio-interviews";

export type ResumeCreateDedupPolicy = "check" | "force";

export interface ResumeCreateDedupConflict {
  matches: DedupMatchRecord[];
  status: "duplicate_found";
}

type FindDuplicates = typeof findSemanticResumeDuplicates;

export function parseResumeCreateDedupPolicy(
  value: FormDataEntryValue | null,
): ResumeCreateDedupPolicy {
  return value === "force" ? "force" : "check";
}

export async function resolveResumeCreateDedupConflict({
  candidateEmail,
  candidateName,
  candidatePhone,
  dedupPolicy,
  findDuplicates = findSemanticResumeDuplicates,
  organizationId,
  resumeProfile,
}: {
  candidateEmail: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
  dedupPolicy: ResumeCreateDedupPolicy;
  findDuplicates?: FindDuplicates;
  organizationId: string;
  resumeProfile: ResumeProfile | null;
}): Promise<ResumeCreateDedupConflict | null> {
  if (dedupPolicy === "force" || !resumeProfile) {
    return null;
  }
  const matches = await findDuplicates({
    email: candidateEmail || resumeProfile.email || null,
    name: candidateName || resumeProfile.name || null,
    organizationId,
    phone: candidatePhone || resumeProfile.phone || null,
    resumeProfile,
  });
  return matches.length > 0 ? { matches, status: "duplicate_found" } : null;
}
