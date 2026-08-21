import { z } from "zod";

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .nullable();

const evidenceQuotesSchema = z.array(z.string().trim().min(1));

export const resumeEmploymentFactSchema = z.object({
  currentStatus: z.enum(["current", "ended", "unknown"]),
  endMonth: monthSchema,
  evidence: evidenceQuotesSchema,
  gapExplanation: z.string().trim().min(1).nullable(),
  primaryStatus: z.enum(["concurrent", "primary", "unresolved"]),
  sourceIndex: z.number().int().min(0),
  startMonth: monthSchema,
});

export const resumeProjectFactSchema = z.object({
  currentStatus: z.enum(["current", "ended", "unknown"]),
  endMonth: monthSchema,
  evidence: evidenceQuotesSchema,
  sourceIndex: z.number().int().min(0),
  startMonth: monthSchema,
});

export const resumeSkillFactSchema = z.object({
  evidence: evidenceQuotesSchema,
  evidenceLevel: z.enum(["applied", "mentioned", "unknown"]),
  normalizedSkill: z.string().trim().min(1),
});

export const resumeScoringFactsSchema = z.object({
  additionalEvidence: evidenceQuotesSchema,
  employmentEpisodes: z.array(resumeEmploymentFactSchema),
  projects: z.array(resumeProjectFactSchema),
  skillFacts: z.array(resumeSkillFactSchema),
  version: z.literal(1),
});

export type ResumeScoringFacts = z.infer<typeof resumeScoringFactsSchema>;

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeResumeScoringFacts(input: {
  facts?: ResumeScoringFacts;
  projectExperienceCount: number;
  skills: readonly string[];
  workExperienceCount: number;
}): ResumeScoringFacts {
  const facts = input.facts ?? {
    additionalEvidence: [],
    employmentEpisodes: [],
    projects: [],
    skillFacts: [],
    version: 1 as const,
  };
  const employmentByIndex = new Map(
    facts.employmentEpisodes
      .filter((fact) => fact.sourceIndex < input.workExperienceCount)
      .map((fact) => [fact.sourceIndex, fact]),
  );
  const projectsByIndex = new Map(
    facts.projects
      .filter((fact) => fact.sourceIndex < input.projectExperienceCount)
      .map((fact) => [fact.sourceIndex, fact]),
  );
  const skillsByName = new Map(
    facts.skillFacts.map((fact) => [fact.normalizedSkill.toLocaleLowerCase("zh-CN"), fact]),
  );

  return {
    additionalEvidence: uniqueTrimmed(facts.additionalEvidence),
    employmentEpisodes: Array.from({ length: input.workExperienceCount }, (_, sourceIndex) => {
      const fact = employmentByIndex.get(sourceIndex);
      return {
        currentStatus: fact?.currentStatus ?? "unknown",
        endMonth: fact?.endMonth ?? null,
        evidence: uniqueTrimmed(fact?.evidence ?? []),
        gapExplanation: fact?.gapExplanation?.trim() || null,
        primaryStatus: fact?.primaryStatus ?? "unresolved",
        sourceIndex,
        startMonth: fact?.startMonth ?? null,
      };
    }),
    projects: Array.from({ length: input.projectExperienceCount }, (_, sourceIndex) => {
      const fact = projectsByIndex.get(sourceIndex);
      return {
        currentStatus: fact?.currentStatus ?? "unknown",
        endMonth: fact?.endMonth ?? null,
        evidence: uniqueTrimmed(fact?.evidence ?? []),
        sourceIndex,
        startMonth: fact?.startMonth ?? null,
      };
    }),
    skillFacts: uniqueTrimmed(input.skills).map((normalizedSkill) => {
      const fact = skillsByName.get(normalizedSkill.toLocaleLowerCase("zh-CN"));
      return {
        evidence: uniqueTrimmed(fact?.evidence ?? []),
        evidenceLevel: fact?.evidenceLevel ?? "unknown",
        normalizedSkill,
      };
    }),
    version: 1,
  };
}
