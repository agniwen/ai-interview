import { once } from "node:events";
import {
  abortMeetingRecordingMultipartUpload,
  deleteMeetingRecordingObject,
  headMeetingRecordingObject,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  claimMeetingPurge,
  completeMeetingPurgeStorageBatch,
  continueMeetingPurgeProviderBatch,
  finalizeMeetingPurge,
  recordMeetingProviderPurgeOutcome,
  releaseMeetingPurgeClaim,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/lifecycle-dao";
import { createOpenAiMeetingTranscriptionProvider } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/providers/openai";
import type { MeetingProviderArtifactInput } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/provider";
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";

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

async function withAbortSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw signal.reason;
  }
  // oxlint-disable-next-line promise/prefer-await-to-then -- Promise.race needs a rejecting abort branch.
  const aborted = once(signal, "abort").then(() => {
    throw signal.reason;
  });
  return await Promise.race([operation, aborted]);
}

async function deleteProviderArtifact(
  input: MeetingProviderArtifactInput & { provider: string },
): Promise<"deleted" | "unsupported"> {
  if (input.provider !== "openai") {
    return "unsupported";
  }
  const provider = createOpenAiMeetingTranscriptionProvider({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });
  if (!provider.deleteRemoteArtifact) {
    return "unsupported";
  }
  await withAbortSignal(provider.deleteRemoteArtifact(input), input.signal);
  return "deleted";
}

const defaultDependencies: MeetingPurgeDependencies = {
  abortMultipartUpload: abortMeetingRecordingMultipartUpload,
  claim: claimMeetingPurge,
  completeStorageBatch: completeMeetingPurgeStorageBatch,
  continueProviderBatch: continueMeetingPurgeProviderBatch,
  deleteProviderArtifact,
  deleteStorageObject: deleteMeetingRecordingObject,
  finalize: finalizeMeetingPurge,
  headStorageObject: headMeetingRecordingObject,
  recordProviderOutcome: recordMeetingProviderPurgeOutcome,
  release: releaseMeetingPurgeClaim,
};

const STORAGE_OPERATION_CONCURRENCY = 8;
const PROVIDER_DELETE_TIMEOUT_MS = 30_000;

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

export async function runMeetingPurgeProcessing(
  input: MeetingPurgeJobData,
  dependencies: MeetingPurgeDependencies = defaultDependencies,
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
    const errorCode = error instanceof Error ? error.message : "meeting-purge-failed";
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
