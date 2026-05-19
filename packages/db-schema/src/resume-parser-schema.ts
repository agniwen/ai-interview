import { z } from "zod";

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

export const structuredSchema = z.object({
  age: z.number().nullable(),
  degree: z.string().nullable(),
  education: z.string().nullable(),
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
  skills: z.array(z.string()),
  targetRoles: z.array(z.string()),
  timelineSummary: z.object({
    currentStatus: z.string().nullable(),
    dateRanges: z.array(z.string()),
    estimatedExperienceYears: z.number().nullable(),
    riskSignals: z.array(z.string()),
  }),
  workExperiences: z.array(workExperienceSchema),
  workYears: z.number().nullable(),
});

export type ResumeParserStructured = z.infer<typeof structuredSchema>;
