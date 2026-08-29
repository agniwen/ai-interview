import type { DedupMatchRecord } from "./endpoints/studio-interviews";
import { isApiError } from "./errors";
import { pipelineStageSchema } from "@arc/db-schema/studio-interviews";
import { z } from "zod";

const dedupMatchSchema = z.object({
  candidateEmail: z.string().nullable(),
  candidateName: z.string(),
  candidatePhone: z.string().nullable(),
  conflictingSignals: z.array(z.string()).optional(),
  createdAt: z.string(),
  id: z.string(),
  jobDescriptionName: z.string().nullable(),
  level: z.enum(["high", "low", "medium"]).optional(),
  pipelineStatus: z
    .object({
      label: z.string(),
      stage: pipelineStageSchema.optional(),
      tone: z.enum(["success", "warning", "info", "outline"]),
    })
    .nullable()
    .optional(),
  resumeFileName: z.string().nullable().optional(),
  resumeProfileSnapshot: z
    .object({
      education: z.array(
        z.object({
          period: z.string().nullable(),
          primary: z.string(),
          secondary: z.string().nullable(),
        }),
      ),
      educationHasMore: z.boolean(),
      projects: z.array(
        z.object({
          period: z.string().nullable(),
          primary: z.string(),
          secondary: z.string().nullable(),
        }),
      ),
      projectsHasMore: z.boolean(),
      work: z.array(
        z.object({
          period: z.string().nullable(),
          primary: z.string(),
          secondary: z.string().nullable(),
        }),
      ),
      workHasMore: z.boolean(),
    })
    .nullable()
    .optional(),
  score: z.number().optional(),
  semanticReasons: z.array(z.string()).optional(),
  similarity: z
    .object({
      resumeOverview: z.number().optional(),
      skillRole: z.number().optional(),
      workProject: z.number().optional(),
    })
    .optional(),
  skills: z.array(z.string()).optional(),
  sourceType: z.enum(["resume_pool_item", "studio_interview", "job_description"]).optional(),
  status: z.enum(["active", "archived"]),
  targetRole: z.string().nullable(),
  uploaderImage: z.string().nullable().optional(),
  uploaderName: z.string().nullable().optional(),
}) satisfies z.ZodType<DedupMatchRecord>;

const dedupConflictPayloadSchema = z.object({
  matches: z.array(dedupMatchSchema),
  status: z.literal("duplicate_found"),
});

/**
 * Extract backend fallback duplicate matches from FormData save endpoints.
 * These endpoints cannot use RPC typing, so callers normalize the 409 payload here.
 */
export function extractResumeDedupConflictMatches(error: Error): DedupMatchRecord[] | null {
  if (!isApiError(error) || error.status !== 409) {
    return null;
  }

  const result = dedupConflictPayloadSchema.safeParse(error.payload);
  return result.success ? result.data.matches : null;
}
