import { MAX_BULK_BATCH_SIZE, MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";
import { z } from "zod";

export const resumeUploadBatchWorkspacePathSchema = z.object({ slug: z.string().trim().min(1) });
export const resumeUploadBatchPathSchema = resumeUploadBatchWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});
export const createResumeUploadBatchSchema = z.object({
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

const batchSchema = z.object({
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  dedupPolicy: z.enum(["skip", "create"]),
  failedCount: z.number().int().nonnegative(),
  id: z.string(),
  jdMode: z.enum(["bind", "auto", "none"]),
  jobDescriptionId: z.string().nullable(),
  processedCount: z.number().int().nonnegative(),
  resumePoolScope: z.enum(["private", "public"]).nullable(),
  skippedCount: z.number().int().nonnegative(),
  status: z.enum(["pending", "running", "completed", "cancelled"]),
  succeededCount: z.number().int().nonnegative(),
  target: z.enum(["resume_library", "resume_pool"]),
  totalCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
const itemSchema = z.object({
  batchId: z.string(),
  contentHash: z.string().nullable(),
  dedupMatchSnapshot: z.json().nullable(),
  errorMessage: z.string().nullable(),
  fileSize: z.number().int().nonnegative(),
  finishedAt: z.iso.datetime().nullable(),
  id: z.string(),
  orderIndex: z.number().int().nonnegative(),
  originalFileName: z.string(),
  poolItemId: z.string().nullable(),
  resumeRecordId: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  status: z.enum([
    "pending",
    "processing",
    "succeeded",
    "failed",
    "duplicate_skipped",
    "cancelled",
  ]),
});
export const resumeUploadBatchSchema = batchSchema;
export const resumeUploadBatchListSchema = z.array(batchSchema);
export const resumeUploadBatchDetailSchema = z.object({
  batch: batchSchema,
  items: z.array(itemSchema),
});
export const resumeUploadBatchActiveSchema = z.array(resumeUploadBatchDetailSchema);
export const resumeUploadDescriptorSchema = z.object({
  contentHash: z.string(),
  fileSize: z.number().int().positive(),
  originalFileName: z.string(),
  storageKey: z.string(),
});
export const resumeUploadBatchDeleteSchema = z.object({ success: z.literal(true) });
export const resumeUploadBatchInboxQuerySchema = z.object({
  cursor: z.string().max(1000).optional(),
});
export const resumeUploadBatchInboxSchema = z.object({
  nextCursor: z.string().nullable(),
  records: z.array(
    z.object({
      attemptCount: z.number().int().nonnegative(),
      batchId: z.string(),
      candidateName: z.string().nullable(),
      errorMessage: z.string().nullable(),
      fileSize: z.number().int().nonnegative(),
      finishedAt: z.iso.datetime().nullable(),
      id: z.string(),
      originalFileName: z.string(),
      previewTarget: z
        .discriminatedUnion("resource", [
          z.object({ id: z.string(), resource: z.literal("resume-pool") }),
          z.object({ id: z.string(), resource: z.literal("resumes") }),
        ])
        .nullable(),
      progressPercent: z.number().min(0).max(100).nullable(),
      queueState: z.enum([
        "active",
        "cancelled",
        "completed",
        "delayed",
        "duplicate-skipped",
        "failed",
        "paused",
        "prioritized",
        "unknown",
        "waiting",
        "waiting-children",
      ]),
      queuedAt: z.iso.datetime().nullable(),
      startedAt: z.iso.datetime().nullable(),
      status: z.enum([
        "pending",
        "processing",
        "succeeded",
        "failed",
        "duplicate_skipped",
        "cancelled",
      ]),
      target: z.enum(["resume_library", "resume_pool"]),
      targetRole: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export const resumeUploadBatchProcessNextSchema = z.object({
  batch: batchSchema,
  done: z.boolean(),
  item: itemSchema.nullable(),
});
