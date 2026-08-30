import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { JsonValue } from "@arc/db-schema/json";
import { readPdfBytes } from "@arc/shared/resume-pdf";
import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { normalizeResumeScoringFacts } from "@arc/db-schema/resume-scoring-facts";

export type { ResumeParserStructured };
export { structuredSchema };

function uniqueTrimmedStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function collectProfileSkills(structured: ResumeParserStructured): string[] {
  return uniqueTrimmedStrings([
    ...structured.skills,
    ...structured.projectExperiences.flatMap((experience) => experience.techStack),
  ]);
}

/**
 * Project the superset `ResumeParserStructured` down to the legacy
 * `ResumeProfile` shape. Fields unique to the subagent (links, timelineSummary,
 * contact info, degree/major/graduationYear/education) are dropped here —
 * callers that need them should consume `structured` directly.
 */
export function toResumeProfile(structured: ResumeParserStructured): ResumeProfile {
  const skills = collectProfileSkills(structured);
  return {
    age: structured.age,
    educationExperiences: structured.educationExperiences ?? [],
    email: structured.email,
    gender: structured.gender,
    name: structured.name?.trim() || "未发现信息",
    personalStrengths: structured.personalStrengths,
    phone: structured.phone,
    projectExperiences: structured.projectExperiences,
    schools: structured.schools,
    scoringFacts: normalizeResumeScoringFacts({
      facts: structured.scoringFacts,
      projectExperienceCount: structured.projectExperiences.length,
      skills,
      workExperienceCount: structured.workExperiences.length,
    }),
    skills,
    targetRoles: structured.targetRoles,
    workExperiences: structured.workExperiences,
    workYears: structured.workYears,
  };
}

// 把 chat_attachment 行的 superset parsedStructured 投影到 ResumeProfile，
// 调用方据此判断是否能跳过 parseResumeFast。形状不符时静默返回 null
// ——让调用方走完整 parse 兜底。
// Project a chat_attachment row's superset parsedStructured down to
// ResumeProfile. Callers use this to decide whether they can skip
// parseResumeFast. Returns null on shape mismatch so callers fall back
// to a full parse.
export function projectAttachmentToResumeProfile(
  parsedStructured: JsonValue | ResumeParserStructured | undefined,
): ResumeProfile | null {
  if (parsedStructured === null || parsedStructured === undefined) {
    return null;
  }
  const parsed = structuredSchema.safeParse(parsedStructured);
  if (!parsed.success || !parsed.data.scoringFacts) {
    return null;
  }
  return toResumeProfile(parsed.data);
}

export { readPdfBytes };
