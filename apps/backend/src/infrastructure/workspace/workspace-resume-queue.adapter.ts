import { Inject, Injectable } from "@nestjs/common";
import {
  enqueueResumeParseJobs,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import { and, eq } from "drizzle-orm";
import { resumeUploadBatch, resumeUploadBatchItem, studioInterview } from "@arc/db-schema/schema";
import type { WorkspaceResumeQueuePort } from "../../features/workspace/workspace.ports.js";
import { API_DATABASE } from "../database/database.tokens.js";
import type { Database } from "../database/database.tokens.js";

type ParseStatus = "failed" | "ready" | "unparsed";

@Injectable()
export class WorkspaceResumeQueueAdapter implements WorkspaceResumeQueuePort {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  forceReparse(input: { organizationId: string; requestedBy: string; resumeRecordId: string }) {
    return this.claimAndQueue(input, true);
  }

  async retryParse(input: { organizationId: string; requestedBy: string; resumeRecordId: string }) {
    const result = await this.claimAndQueue(input, false);
    return result === "no_file" ? "missing" : result;
  }

  private async claimAndQueue(
    input: { organizationId: string; requestedBy: string; resumeRecordId: string },
    force: boolean,
  ): Promise<"busy" | "missing" | "no_file" | "queue_unavailable" | "queued"> {
    if (!isResumeParseQueueConfigured()) {
      return "queue_unavailable";
    }
    const claim = await this.database.transaction(async (transaction) => {
      const [source] = await transaction
        .select({
          contentHash: studioInterview.resumeContentHash,
          createdBy: studioInterview.createdBy,
          fileName: studioInterview.resumeFileName,
          jobDescriptionId: studioInterview.jobDescriptionId,
          parseStatus: studioInterview.resumeParseStatus,
          storageKey: studioInterview.resumeStorageKey,
        })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, input.resumeRecordId),
            eq(studioInterview.organizationId, input.organizationId),
          ),
        )
        .limit(1)
        .for("update");
      if (!source) {
        return { status: "missing" as const };
      }
      if (!source.storageKey) {
        return { status: "no_file" as const };
      }
      if (source.parseStatus === "queued" || source.parseStatus === "processing") {
        return { status: "busy" as const };
      }
      if (!force && source.parseStatus !== "failed") {
        return { status: "busy" as const };
      }

      const previousStatus: ParseStatus =
        source.parseStatus === "failed" || source.parseStatus === "unparsed"
          ? source.parseStatus
          : "ready";
      const batchId = crypto.randomUUID();
      const itemId = crypto.randomUUID();
      const now = new Date();
      const userId = source.createdBy ?? input.requestedBy;
      await transaction.insert(resumeUploadBatch).values({
        createdAt: now,
        createdBy: userId,
        dedupPolicy: "create",
        id: batchId,
        jdMode: source.jobDescriptionId ? "bind" : "none",
        jobDescriptionId: source.jobDescriptionId,
        organizationId: input.organizationId,
        resumePoolScope: null,
        status: "pending",
        target: "resume_library",
        totalCount: 1,
        updatedAt: now,
      });
      await transaction.insert(resumeUploadBatchItem).values({
        attemptCount: 1,
        batchId,
        contentHash: source.contentHash,
        fileSize: 0,
        id: itemId,
        orderIndex: 0,
        organizationId: input.organizationId,
        originalFileName: source.fileName ?? "resume.pdf",
        poolItemId: null,
        queuedAt: now,
        resumeRecordId: input.resumeRecordId,
        status: "pending",
        storageKey: source.storageKey,
      });
      await transaction
        .update(studioInterview)
        .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
        .where(eq(studioInterview.id, input.resumeRecordId));
      return {
        job: {
          batchId,
          bypassCache: force || undefined,
          itemId,
          organizationId: input.organizationId,
          userId,
        },
        previousStatus,
        status: "claimed" as const,
      };
    });
    if (claim.status !== "claimed") {
      return claim.status;
    }
    try {
      await enqueueResumeParseJobs([claim.job]);
      return "queued";
    } catch (error) {
      await this.database.transaction(async (transaction) => {
        await transaction
          .update(resumeUploadBatchItem)
          .set({ errorMessage: "简历解析入队失败。", finishedAt: new Date(), status: "failed" })
          .where(eq(resumeUploadBatchItem.id, claim.job.itemId));
        await transaction
          .update(studioInterview)
          .set({ resumeParseStatus: claim.previousStatus, updatedAt: new Date() })
          .where(
            and(
              eq(studioInterview.id, input.resumeRecordId),
              eq(studioInterview.organizationId, input.organizationId),
              eq(studioInterview.resumeParseStatus, "queued"),
            ),
          );
      });
      throw new Error("简历解析队列入队失败，请稍后重试。", { cause: error });
    }
  }
}
