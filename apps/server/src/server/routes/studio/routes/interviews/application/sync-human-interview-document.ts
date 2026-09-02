import type { HumanInterviewDocumentContent } from "../../../../../integrations/feishu/human-interview-evaluation-doc";
import type { FeishuProviderId } from "../../../../../integrations/feishu/provider";

export interface HumanInterviewDocumentSyncJob extends HumanInterviewDocumentContent {
  snapshotId: string;
  deadlineAt: number;
  roundId: string;
  organizationId: string;
  leaseOwner: string;
  documentId: string;
  documentUrl: string;
  providerId: FeishuProviderId;
  blockId: string | null;
  attemptCount: number;
}

export interface HumanInterviewDocumentSyncDependencies {
  // null means no due work; deferred means a due row was postponed and scanning can continue.
  claim(): Promise<HumanInterviewDocumentSyncJob | "deferred" | null>;
  saveBlock(job: HumanInterviewDocumentSyncJob, blockId: string): Promise<void>;
  finish(
    job: HumanInterviewDocumentSyncJob,
    result: { status: "synced" | "failed"; error: string | null },
  ): Promise<void>;
  updateDocument(
    input: HumanInterviewDocumentSyncJob & { onBlockCreated: (blockId: string) => Promise<void> },
  ): Promise<void>;
}

export async function syncHumanInterviewDocument(
  dependencies: HumanInterviewDocumentSyncDependencies,
): Promise<boolean> {
  const job = await dependencies.claim();
  if (!job) {
    return false;
  }
  if (job === "deferred") {
    return true;
  }
  try {
    if (Date.now() >= job.deadlineAt) {
      throw new Error("评价表同步任务已超时，将自动重试");
    }
    await dependencies.updateDocument({
      ...job,
      onBlockCreated: (blockId) => dependencies.saveBlock(job, blockId),
    });
    await dependencies.finish(job, { error: null, status: "synced" });
  } catch (error) {
    await dependencies.finish(job, {
      error: error instanceof Error ? error.message : "飞书评价表同步失败",
      status: "failed",
    });
  }
  return true;
}
