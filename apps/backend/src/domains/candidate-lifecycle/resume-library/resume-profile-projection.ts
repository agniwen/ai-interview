import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { normalizeResumeScoringFacts } from "@arc/db-schema/resume-scoring-facts";

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function projectResumeProfile(structured: ResumeParserStructured): ResumeProfile {
  const skills = unique([
    ...structured.skills,
    ...structured.projectExperiences.flatMap((experience) => experience.techStack),
  ]);
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
