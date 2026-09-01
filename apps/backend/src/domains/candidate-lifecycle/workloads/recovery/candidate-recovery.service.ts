import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
  resumePoolItem,
  resumeSemanticIndex,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import { DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS } from "@arc/shared/bulk-resume-upload";
import { BackendConfigService } from "../../../../config/backend-config.service.js";
import { BACKGROUND_DATABASE } from "../../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import type { CandidateRecoveryCommands } from "./candidate-recovery.commands.js";

@Injectable()
export class CandidateRecoveryService implements CandidateRecoveryCommands {
  constructor(
    @Inject(BACKGROUND_DATABASE) private readonly database: Database,
    @Inject(BackendConfigService) private readonly config: BackendConfigService,
  ) {}

  async listRecoverableResumeParseJobs() {
    const threshold =
      this.config.get("RESUME_PARSE_STALE_PROCESSING_SECONDS") ??
      DEFAULT_RESUME_PARSE_STALE_PROCESSING_SECONDS;
    const stale = and(
      eq(resumeUploadBatchItem.status, "processing"),
      lt(
        resumeUploadBatchItem.startedAt,
        sql`now() - interval '${sql.raw(String(threshold))} seconds'`,
      ),
    );
    await this.database.transaction(async (tx) => {
      const staleItems = await tx
        .select({
          poolItemId: resumeUploadBatchItem.poolItemId,
          resumeRecordId: resumeUploadBatchItem.resumeRecordId,
        })
        .from(resumeUploadBatchItem)
        .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
        .where(and(inArray(resumeUploadBatch.status, ["pending", "running"]), stale));
      const recordIds = staleItems.flatMap((item) =>
        item.resumeRecordId ? [item.resumeRecordId] : [],
      );
      const poolItemIds = staleItems.flatMap((item) => (item.poolItemId ? [item.poolItemId] : []));
      const now = new Date();
      if (recordIds.length > 0) {
        await tx
          .update(studioInterview)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
          .where(inArray(studioInterview.id, recordIds));
      }
      if (poolItemIds.length > 0) {
        await tx
          .update(resumePoolItem)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
          .where(inArray(resumePoolItem.id, poolItemIds));
      }
      await tx
        .update(resumeUploadBatchItem)
        .set({ startedAt: null, status: "pending" })
        .where(
          and(
            inArray(
              resumeUploadBatchItem.batchId,
              tx
                .select({ id: resumeUploadBatch.id })
                .from(resumeUploadBatch)
                .where(inArray(resumeUploadBatch.status, ["pending", "running"])),
            ),
            stale,
          ),
        );
    });
    return this.database
      .select({
        batchId: resumeUploadBatchItem.batchId,
        itemId: resumeUploadBatchItem.id,
        organizationId: resumeUploadBatch.organizationId,
        userId: resumeUploadBatch.createdBy,
      })
      .from(resumeUploadBatchItem)
      .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
      .where(
        and(
          inArray(resumeUploadBatch.status, ["pending", "running"]),
          eq(resumeUploadBatchItem.status, "pending"),
        ),
      );
  }

  listRecoverableResumeSemanticIndexJobs() {
    const embeddingVersion =
      this.config.get("RESUME_EMBEDDING_VERSION") ?? "dashscope-text-embedding-v4-1024-v1";
    return this.database
      .select({
        organizationId: resumeSemanticIndex.organizationId,
        sourceId: resumeSemanticIndex.sourceId,
        sourceType: resumeSemanticIndex.sourceType,
      })
      .from(resumeSemanticIndex)
      .where(
        and(
          eq(resumeSemanticIndex.embeddingVersion, embeddingVersion),
          or(
            inArray(resumeSemanticIndex.status, ["pending", "failed"]),
            and(
              eq(resumeSemanticIndex.sourceType, "job_description"),
              eq(resumeSemanticIndex.status, "stale"),
            ),
          ),
        ),
      )
      .limit(500);
  }
}
