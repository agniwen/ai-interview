import type {
  abortMeetingRecordingMultipartUpload,
  deleteMeetingRecordingObject,
  headMeetingRecordingObject,
} from "@app/object-storage";
import type {
  claimMeetingPurge,
  completeMeetingPurgeStorageBatch,
  continueMeetingPurgeProviderBatch,
  finalizeMeetingPurge,
  MeetingProviderArtifactInput,
  recordMeetingProviderPurgeOutcome,
  releaseMeetingPurgeClaim,
} from "@app/server/worker/meeting-purge";
import type { MeetingPurgeJobData } from "@app/meeting-processing-queue/meeting-purge";

export interface MeetingPurgeDependencies {
  abortMultipartUpload: typeof abortMeetingRecordingMultipartUpload;
  claim: typeof claimMeetingPurge;
  completeStorageBatch: typeof completeMeetingPurgeStorageBatch;
  continueProviderBatch: typeof continueMeetingPurgeProviderBatch;
  deleteProviderArtifact: (
    input: MeetingProviderArtifactInput & { provider: string },
  ) => Promise<"deleted" | "unsupported">;
  deleteStorageObject: typeof deleteMeetingRecordingObject;
  headStorageObject: typeof headMeetingRecordingObject;
  finalize: typeof finalizeMeetingPurge;
  recordProviderOutcome: typeof recordMeetingProviderPurgeOutcome;
  release: typeof releaseMeetingPurgeClaim;
}

// 每批最多并发 8 个对象删除/校验，限制 R2 压力与 Promise 数量。 / Runs at most eight object deletes or checks per batch to bound R2 pressure and promise count.
const STORAGE_OPERATION_CONCURRENCY = 8;
// 外部供应商删除 30 秒未完成即进入失败/重试记录，避免长期占用清理租约。 / Treats provider deletion over 30 seconds as failed/retryable so it cannot hold the purge lease indefinitely.
const PROVIDER_DELETE_TIMEOUT_MS = 30_000;

// 保留 meeting-* 领域失败码，其余异常统一收敛，避免把任意错误文本写入状态字段。 / Preserves meeting-* domain codes and collapses other errors so arbitrary messages do not enter the status field.
function purgeFailureCode(error: Error): string {
  if (error.message.startsWith("meeting-")) {
    return error.message;
  }
  return "meeting-purge-failed";
}

// 分批执行并在任一批失败后停止后续存储操作，使调用方按阶段记录统一失败码。 / Executes in batches and stops after any rejected batch so the caller can persist one stage-specific failure code.
async function runBounded<T>(items: T[], operation: (item: T) => Promise<void>): Promise<void> {
  for (let offset = 0; offset < items.length; offset += STORAGE_OPERATION_CONCURRENCY) {
    const results = await Promise.allSettled(
      items.slice(offset, offset + STORAGE_OPERATION_CONCURRENCY).map((item) => operation(item)),
    );
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("meeting-storage-operation-failed");
    }
  }
}

// 按租约顺序清理 multipart、对象与供应商产物，最终轮会反查对象；任何失败都先释放认领再抛出。 / Under a lease, clears multipart uploads, objects, and provider artifacts in order, verifies objects on the final sweep, and releases the claim before rethrowing failures.
export async function runMeetingPurgeProcessing(
  input: MeetingPurgeJobData,
  dependencies: MeetingPurgeDependencies,
): Promise<void> {
  const claim = await dependencies.claim(input);
  if (!claim) {
    return;
  }
  try {
    try {
      await runBounded(claim.multipartUploads, dependencies.abortMultipartUpload);
    } catch {
      throw new Error("meeting-multipart-abort-failed");
    }
    try {
      await runBounded(claim.storageKeys, dependencies.deleteStorageObject);
    } catch {
      throw new Error("meeting-storage-delete-failed");
    }
    if (claim.phase === "final") {
      let objectStillExists = false;
      try {
        await runBounded(claim.storageKeys, async (storageKey) => {
          if (await dependencies.headStorageObject(storageKey)) {
            objectStillExists = true;
          }
        });
      } catch {
        throw new Error("meeting-storage-verify-failed");
      }
      if (objectStillExists) {
        throw new Error("meeting-storage-still-present");
      }
    }
    const storageState = await dependencies.completeStorageBatch({
      ...input,
      executionToken: claim.executionToken,
      phase: claim.phase,
      storageCleanupKeys: claim.storageCleanupKeys,
    });
    if (storageState !== "ready") {
      return;
    }
    for (const artifact of claim.providerArtifacts) {
      try {
        const outcome = await dependencies.deleteProviderArtifact({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          processingRunId: artifact.processingRunId,
          provider: artifact.provider,
          providerArtifact: artifact.providerArtifact,
          signal: AbortSignal.timeout(PROVIDER_DELETE_TIMEOUT_MS),
          stage: artifact.stage,
        });
        await dependencies.recordProviderOutcome({
          ...input,
          executionToken: claim.executionToken,
          outcome,
          processingRunId: artifact.processingRunId,
          provider: artifact.provider,
          stage: artifact.stage,
        });
      } catch {
        const retryable = await dependencies.recordProviderOutcome({
          ...input,
          executionToken: claim.executionToken,
          outcome: "failed",
          processingRunId: artifact.processingRunId,
          provider: artifact.provider,
          stage: artifact.stage,
        });
        if (retryable) {
          throw new Error("meeting-provider-delete-failed");
        }
      }
    }
    if (claim.hasMoreProviderArtifacts) {
      await dependencies.continueProviderBatch({
        ...input,
        executionToken: claim.executionToken,
      });
      return;
    }
    await dependencies.finalize({
      ...input,
      executionToken: claim.executionToken,
      providerCount: claim.providerArtifacts.length,
      storageObjectCount: claim.storageKeys.length,
    });
  } catch (error) {
    const processingError = error instanceof Error ? error : new Error("meeting-purge-failed");
    const errorCode = purgeFailureCode(processingError);
    try {
      await dependencies.release({
        ...input,
        errorCode,
        executionToken: claim.executionToken,
      });
    } catch (releaseError) {
      console.error("[meeting-purge-worker] failed to release purge claim", {
        errorName: releaseError instanceof Error ? releaseError.name : "UnknownError",
        meetingId: input.meetingId,
      });
    }
    throw error;
  }
}
