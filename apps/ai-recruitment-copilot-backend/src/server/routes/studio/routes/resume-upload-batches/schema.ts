import { z } from "zod";
import { MAX_BULK_BATCH_SIZE, MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";

export const createBatchInputSchema = z.object({
  dedupPolicy: z.enum(["skip", "create"]),
  files: z
    .array(
      z.object({
        contentHash: z.string().min(1).max(128),
        fileSize: z.number().int().positive().max(MAX_RESUME_FILE_SIZE_BYTES),
        originalFileName: z.string().min(1).max(500),
        storageKey: z.string().min(1),
      }),
    )
    .min(1)
    .max(MAX_BULK_BATCH_SIZE),
  jdMode: z.enum(["bind", "auto", "none"]),
  jobDescriptionId: z.string().min(1).nullable().optional(),
  resumePoolScope: z.enum(["private", "public"]).nullable().optional(),
  target: z.enum(["resume_library", "resume_pool"]).default("resume_library"),
});
