import type { ResumeProfile } from "@arc/db-schema/interview/types";

export interface ResumeProfileIdentityInput {
  candidateEmail: string;
  candidateName: string;
  candidatePhone: string;
  targetRole: string;
}

export function syncResumeProfileIdentity(
  profile: ResumeProfile | null,
  input: ResumeProfileIdentityInput,
): ResumeProfile | null {
  if (!profile) {
    return null;
  }

  const candidateEmail = input.candidateEmail.trim();
  const candidateName = input.candidateName.trim();
  const candidatePhone = input.candidatePhone.trim();
  const targetRole = input.targetRole.trim();

  return {
    ...profile,
    email: candidateEmail || null,
    name: candidateName || profile.name,
    phone: candidatePhone || null,
    targetRoles: targetRole ? [targetRole] : [],
  };
}
