import { z } from "zod";
import { resumeScoringFactsSchema } from "./resume-scoring-facts";

const emptyResumeScoringFacts = {
  additionalEvidence: [],
  employmentEpisodes: [],
  projects: [],
  skillFacts: [],
  version: 1 as const,
};

const workExperienceSchema = z.object({
  company: z.string().nullable(),
  period: z.string().nullable(),
  role: z.string().nullable(),
  summary: z.string().nullable(),
});

const projectExperienceSchema = z.object({
  name: z.string().nullable(),
  period: z.string().nullable(),
  role: z.string().nullable(),
  summary: z.string().nullable(),
  techStack: z.array(z.string()),
});

const educationExperienceSchema = z.object({
  degree: z.string().nullable(),
  educationLevel: z.string().nullable(),
  graduationYear: z.string().nullable(),
  major: z.string().nullable(),
  period: z.string().nullable(),
  school: z.string().nullable(),
  summary: z.string().nullable(),
});

export const structuredSchema = z.object({
  age: z.number().nullable(),
  degree: z.string().nullable(),
  education: z.string().nullable(),
  educationExperiences: z.array(educationExperienceSchema).default([]),
  email: z.string().nullable(),
  gender: z.string().nullable(),
  graduationYear: z.string().nullable(),
  links: z.array(z.string()),
  major: z.string().nullable(),
  name: z.string().nullable(),
  personalStrengths: z.array(z.string()),
  phone: z.string().nullable(),
  projectExperiences: z.array(projectExperienceSchema),
  schools: z.array(z.string()),
  scoringFacts: resumeScoringFactsSchema.optional(),
  skills: z.array(z.string()),
  targetRoles: z.array(z.string()),
  timelineSummary: z.object({
    currentStatus: z.string().nullable(),
    dateRanges: z.array(z.string()),
    estimatedExperienceYears: z.number().nullable(),
    riskSignals: z.array(z.string()),
  }),
  workExperiences: z.array(workExperienceSchema),
  // oxlint-disable-next-line promise/prefer-await-to-then -- Zod catch supplies a synchronous schema fallback.
  workYears: z.number().nullable().catch(null),
});

export const resumeParserGenerationSchema = structuredSchema.extend({
  // 评分事实是解析后的增强信息，不应因为模型漏填枚举或索引而丢弃整份简历。
  // 下游 normalizeResumeScoringFacts 会基于核心简历字段补齐这些默认值。
  // oxlint-disable-next-line promise/prefer-await-to-then -- Zod catch supplies a synchronous schema fallback.
  scoringFacts: resumeScoringFactsSchema.catch(emptyResumeScoringFacts),
});

export type ResumeParserStructured = z.infer<typeof structuredSchema>;
