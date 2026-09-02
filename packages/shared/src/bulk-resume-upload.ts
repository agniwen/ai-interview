import { z } from "zod";
import type {
  ResumeUploadBatchDedupPolicy,
  ResumeUploadBatchItemStatus,
  ResumeUploadBatchJdMode,
  ResumeUploadBatchStatus,
  ResumeUploadBatchTarget,
  ResumePoolScope,
} from "@app/db-schema/schema";

export const MAX_BULK_BATCH_SIZE = 100;
export const MAX_RESUME_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS = 15 * 60;

// /uploads 单文件返回。
// /uploads single-file return shape.
export interface BulkResumeUploadFileDescriptor {
  storageKey: string;
  contentHash: string;
  originalFileName: string;
  fileSize: number;
}

// POST / 创建 batch 请求。
// Create-batch request payload.
export const createBulkResumeBatchSchema = z.object({
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

export type CreateBulkResumeBatchInput = z.input<typeof createBulkResumeBatchSchema>;

export interface BulkResumeBatchDto {
  id: string;
  status: ResumeUploadBatchStatus;
  jdMode: ResumeUploadBatchJdMode;
  jobDescriptionId: string | null;
  dedupPolicy: ResumeUploadBatchDedupPolicy;
  resumePoolScope?: ResumePoolScope | null;
  target?: ResumeUploadBatchTarget;
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface BulkResumeBatchItemDto {
  id: string;
  batchId: string;
  orderIndex: number;
  originalFileName: string;
  fileSize: number;
  contentHash: string | null;
  status: ResumeUploadBatchItemStatus;
  poolItemId?: string | null;
  resumeRecordId: string | null;
  dedupMatchSnapshot?: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BulkResumeBatchDetailDto {
  batch: BulkResumeBatchDto;
  items: BulkResumeBatchItemDto[];
}

export interface ProcessNextResult {
  batch: BulkResumeBatchDto;
  item: BulkResumeBatchItemDto | null;
  done: boolean;
}
