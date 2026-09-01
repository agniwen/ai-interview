/* oxlint-disable anti-slop/no-unknown-fields -- Provider artifacts are opaque, versioned provider payloads passed through to the provider-owned deletion adapter. */
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";

export interface MeetingPurgeClaim {
  executionToken: string;
  hasMoreProviderArtifacts: boolean;
  multipartUploads: { storageKey: string; uploadId: string }[];
  phase: "final" | "initial";
  providerArtifacts: {
    processingRunId: string;
    provider: string;
    providerArtifact: unknown;
    stage: string;
  }[];
  storageCleanupKeys: string[];
  storageKeys: string[];
}

export interface MeetingPurgeProcessorPorts {
  abortMultipartUpload(input: { storageKey: string; uploadId: string }): Promise<void>;
  claim(input: MeetingPurgeJobData): Promise<MeetingPurgeClaim | null>;
  completeStorageBatch(
    input: MeetingPurgeJobData & {
      executionToken: string;
      phase: "final" | "initial";
      storageCleanupKeys: string[];
    },
  ): Promise<"pending" | "ready">;
  continueProviderBatch(input: MeetingPurgeJobData & { executionToken: string }): Promise<boolean>;
  deleteProviderArtifact(input: {
    meetingId: string;
    organizationId: string;
    processingRunId: string;
    provider: string;
    providerArtifact: unknown;
    signal: AbortSignal;
    stage: string;
  }): Promise<"deleted" | "unsupported">;
  deleteStorageObject(storageKey: string): Promise<void>;
  finalize(
    input: MeetingPurgeJobData & {
      executionToken: string;
      providerCount: number;
      storageObjectCount: number;
    },
  ): Promise<boolean>;
  headStorageObject(storageKey: string): Promise<object | null>;
  recordProviderOutcome(input: {
    executionToken: string;
    meetingId: string;
    organizationId: string;
    outcome: "deleted" | "failed" | "unsupported";
    processingRunId: string;
    provider: string;
    stage: string;
  }): Promise<boolean>;
  release(
    input: MeetingPurgeJobData & { errorCode: string; executionToken: string },
  ): Promise<boolean>;
}

const STORAGE_OPERATION_CONCURRENCY = 8;
const PROVIDER_DELETE_TIMEOUT_MS = 30_000;

function purgeFailureCode(error: Error): string {
  return error.message.startsWith("meeting-") ? error.message : "meeting-purge-failed";
}

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

/** Copied bounded-delete, provider outcome and lease-release state machine. */
export async function processMeetingPurgeWorkload(
  input: MeetingPurgeJobData,
  ports: MeetingPurgeProcessorPorts,
): Promise<void> {
  const claim = await ports.claim(input);
  if (!claim) {
    return;
  }
  try {
    try {
      await runBounded(claim.multipartUploads, (item) => ports.abortMultipartUpload(item));
    } catch {
      throw new Error("meeting-multipart-abort-failed");
    }
    try {
      await runBounded(claim.storageKeys, (key) => ports.deleteStorageObject(key));
    } catch {
      throw new Error("meeting-storage-delete-failed");
    }
    if (claim.phase === "final") {
      let objectStillExists = false;
      try {
        await runBounded(claim.storageKeys, async (storageKey) => {
          if (await ports.headStorageObject(storageKey)) {
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
    const storageState = await ports.completeStorageBatch({
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
        const outcome = await ports.deleteProviderArtifact({
          ...input,
          processingRunId: artifact.processingRunId,
          provider: artifact.provider,
          providerArtifact: artifact.providerArtifact,
          signal: AbortSignal.timeout(PROVIDER_DELETE_TIMEOUT_MS),
          stage: artifact.stage,
        });
        await ports.recordProviderOutcome({
          ...input,
          executionToken: claim.executionToken,
          outcome,
          processingRunId: artifact.processingRunId,
          provider: artifact.provider,
          stage: artifact.stage,
        });
      } catch {
        const retryable = await ports.recordProviderOutcome({
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
      await ports.continueProviderBatch({ ...input, executionToken: claim.executionToken });
      return;
    }
    await ports.finalize({
      ...input,
      executionToken: claim.executionToken,
      providerCount: claim.providerArtifacts.length,
      storageObjectCount: claim.storageKeys.length,
    });
  } catch (error) {
    const processingError = error instanceof Error ? error : new Error("meeting-purge-failed");
    try {
      await ports.release({
        ...input,
        errorCode: purgeFailureCode(processingError),
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
