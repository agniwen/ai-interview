import type { ResumeProfile } from "@arc/db-schema/interview/types";

export interface ResumeProfileIdentityInput {
  age?: number | null;
  candidateEmail: string;
  candidateName: string;
  candidatePhone: string;
  gender?: string;
  targetRole: string;
  workYears?: number | null;
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
  const gender = input.gender?.trim() ?? "";

  return {
    ...profile,
    age: input.age === undefined ? profile.age : input.age,
    email: candidateEmail || null,
    gender: gender || profile.gender,
    name: candidateName || profile.name,
    phone: candidatePhone || null,
    targetRoles: targetRole ? [targetRole] : [],
    workYears: input.workYears === undefined ? profile.workYears : input.workYears,
  };
}
