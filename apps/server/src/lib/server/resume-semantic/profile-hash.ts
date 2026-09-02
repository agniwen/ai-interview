import { createHash } from "node:crypto";
import type { ResumeProfile } from "@app/db-schema/interview/types";

const PLACEHOLDER = "未发现信息";

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === PLACEHOLDER) {
    return null;
  }
  return trimmed.replaceAll(/\s+/g, " ");
}

function cleanList(values: readonly string[] | null | undefined): string[] {
  return [
    ...new Set(
      values
        ?.map((value) => cleanText(value))
        .filter((value): value is string => typeof value === "string"),
    ),
  ].toSorted((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function stableProfile(profile: ResumeProfile) {
  return {
    educationExperiences: (profile.educationExperiences ?? []).map((item) => ({
      degree: cleanText(item.degree),
      educationLevel: cleanText(item.educationLevel),
      graduationYear: cleanText(item.graduationYear),
      major: cleanText(item.major),
      period: cleanText(item.period),
      school: cleanText(item.school),
      summary: cleanText(item.summary),
    })),
    name: cleanText(profile.name),
    personalStrengths: cleanList(profile.personalStrengths),
    projectExperiences: profile.projectExperiences.map((item) => ({
      name: cleanText(item.name),
      period: cleanText(item.period),
      role: cleanText(item.role),
      summary: cleanText(item.summary),
      techStack: cleanList(item.techStack),
    })),
    schools: cleanList(profile.schools),
    skills: cleanList(profile.skills),
    targetRoles: cleanList(profile.targetRoles),
    workExperiences: profile.workExperiences.map((item) => ({
      company: cleanText(item.company),
      period: cleanText(item.period),
      role: cleanText(item.role),
      summary: cleanText(item.summary),
    })),
    workYears: profile.workYears,
  };
}

export function hashResumeProfileForSemanticIndex(profile: ResumeProfile): string {
  return createHash("sha256")
    .update(JSON.stringify(stableProfile(profile)))
    .digest("hex");
}
