import { describe, expect, it, vi } from "vitest";

import { runMeetingPurgeProcessing } from "./processor";

const JOB = { meetingId: "meeting-84", organizationId: "org-84" };

interface MultipartUpload {
  storageKey: string;
  uploadId: string;
}
interface ProviderOutcomeInput {
  outcome: string;
  processingRunId: string;
  provider: string;
  stage: string;
}

function createDependencies() {
  return {
    abortMultipartUpload: vi.fn(async (_upload: MultipartUpload) => {}),
    claim: vi.fn().mockResolvedValue({
      executionToken: "purge-token-84",
      hasMoreProviderArtifacts: false,
      hasMoreStorageKeys: false,
      multipartUploads: [{ storageKey: "system.webm", uploadId: "upload-84" }],
      phase: "final" as const,
      providerArtifacts: [
        {
          processingRunId: "run-84",
          provider: "openai",
          providerArtifact: { remoteId: "artifact-84" },
          stage: "final-transcription",
        },
      ],
      storageCleanupKeys: ["playback.webm"],
      storageKeys: ["microphone.webm", "system.webm", "playback.webm"],
    }),
    completeStorageBatch: vi.fn().mockResolvedValue("ready" as const),
    continueProviderBatch: vi.fn().mockResolvedValue(true),
    deleteProviderArtifact: vi.fn().mockResolvedValue("unsupported" as const),
    deleteStorageObject: vi.fn(async (_storageKey: string) => {}),
    finalize: vi.fn().mockResolvedValue(true),
    headStorageObject: vi.fn().mockResolvedValue(null),
    recordProviderOutcome: vi.fn((_input: ProviderOutcomeInput) => Promise.resolve(false)),
    release: vi.fn().mockResolvedValue(true),
  };
}

describe("Meeting purge processor", () => {
  it("deletes every known object, audits provider support and finalizes once", async () => {
    const deps = createDependencies();
    await runMeetingPurgeProcessing(JOB, deps);
    expect(deps.abortMultipartUpload).toHaveBeenCalledWith({
      storageKey: "system.webm",
      uploadId: "upload-84",
    });
    expect(deps.deleteStorageObject).toHaveBeenCalledTimes(3);
    expect(deps.completeStorageBatch).toHaveBeenCalledWith({
      ...JOB,
      executionToken: "purge-token-84",
      phase: "final",
      storageCleanupKeys: ["playback.webm"],
    });
    expect(deps.recordProviderOutcome).toHaveBeenCalledWith({
      ...JOB,
      executionToken: "purge-token-84",
      outcome: "unsupported",
      processingRunId: "run-84",
      provider: "openai",
      stage: "final-transcription",
    });
    expect(deps.deleteProviderArtifact).toHaveBeenCalledWith({
      ...JOB,
      processingRunId: "run-84",
      provider: "openai",
      providerArtifact: { remoteId: "artifact-84" },
      signal: expect.any(AbortSignal),
      stage: "final-transcription",
    });
    expect(deps.finalize).toHaveBeenCalledWith({
      ...JOB,
      executionToken: "purge-token-84",
      providerCount: 1,
      storageObjectCount: 3,
    });
    expect(deps.release).not.toHaveBeenCalled();
  });

  it("waits through a quiet period after the initial bounded object sweep", async () => {
    const deps = createDependencies();
    deps.claim.mockResolvedValueOnce({
      executionToken: "purge-token-initial",
      hasMoreProviderArtifacts: false,
      hasMoreStorageKeys: true,
      multipartUploads: [],
      phase: "initial",
      providerArtifacts: [],
      storageCleanupKeys: ["playback-run-1.webm"],
      storageKeys: ["microphone.webm", "playback-run-1.webm"],
    });
    deps.completeStorageBatch.mockResolvedValueOnce("quiet-period");

    await runMeetingPurgeProcessing(JOB, deps);

    expect(deps.headStorageObject).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
    expect(deps.completeStorageBatch).toHaveBeenCalledWith({
      ...JOB,
      executionToken: "purge-token-initial",
      phase: "initial",
      storageCleanupKeys: ["playback-run-1.webm"],
    });
  });

  it("continues a bounded provider batch without finalizing the meeting", async () => {
    const deps = createDependencies();
    const claim = await deps.claim();
    deps.claim.mockResolvedValueOnce({
      ...claim,
      hasMoreProviderArtifacts: true,
    });

    await runMeetingPurgeProcessing(JOB, deps);

    expect(deps.continueProviderBatch).toHaveBeenCalledWith({
      ...JOB,
      executionToken: "purge-token-84",
    });
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it("does not finalize when the post-quiet HEAD still sees a late upload", async () => {
    const deps = createDependencies();
    deps.headStorageObject.mockResolvedValueOnce({ contentLength: 10 });

    await expect(runMeetingPurgeProcessing(JOB, deps)).rejects.toThrow(
      "meeting-storage-still-present",
    );

    expect(deps.completeStorageBatch).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith({
      ...JOB,
      errorCode: "meeting-storage-still-present",
      executionToken: "purge-token-84",
    });
  });

  it("invokes a supported provider adapter with the durable artifact identity", async () => {
    const deps = createDependencies();
    deps.deleteProviderArtifact.mockResolvedValueOnce("deleted");

    await runMeetingPurgeProcessing(JOB, deps);

    expect(deps.deleteProviderArtifact).toHaveBeenCalledWith({
      ...JOB,
      processingRunId: "run-84",
      provider: "openai",
      providerArtifact: { remoteId: "artifact-84" },
      signal: expect.any(AbortSignal),
      stage: "final-transcription",
    });
    expect(deps.recordProviderOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deleted", processingRunId: "run-84" }),
    );
  });

  it("is idempotent after the meeting row has already been purged", async () => {
    const deps = createDependencies();
    deps.claim.mockResolvedValueOnce(null);
    await runMeetingPurgeProcessing(JOB, deps);
    expect(deps.deleteStorageObject).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it("releases the durable claim after a partial object deletion failure", async () => {
    const deps = createDependencies();
    deps.deleteStorageObject.mockRejectedValueOnce(new Error("R2 unavailable"));
    await expect(runMeetingPurgeProcessing(JOB, deps)).rejects.toThrow(
      "meeting-storage-delete-failed",
    );
    expect(deps.deleteStorageObject).toHaveBeenCalledTimes(3);
    expect(deps.finalize).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith({
      ...JOB,
      errorCode: "meeting-storage-delete-failed",
      executionToken: "purge-token-84",
    });
  });

  it("does not drop database metadata while multipart parts remain allocated", async () => {
    const deps = createDependencies();
    deps.abortMultipartUpload.mockRejectedValueOnce(new Error("multipart unavailable"));
    await expect(runMeetingPurgeProcessing(JOB, deps)).rejects.toThrow(
      "meeting-multipart-abort-failed",
    );
    expect(deps.deleteStorageObject).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith({
      ...JOB,
      errorCode: "meeting-multipart-abort-failed",
      executionToken: "purge-token-84",
    });
  });

  it("audits best-effort provider deletion failure and still finalizes local custody", async () => {
    const deps = createDependencies();
    deps.deleteProviderArtifact.mockRejectedValueOnce(new Error("provider unavailable"));
    await runMeetingPurgeProcessing(JOB, deps);
    expect(deps.recordProviderOutcome).toHaveBeenCalledWith({
      ...JOB,
      executionToken: "purge-token-84",
      outcome: "failed",
      processingRunId: "run-84",
      provider: "openai",
      stage: "final-transcription",
    });
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it("keeps provider artifact identity retryable before the durable budget is exhausted", async () => {
    const deps = createDependencies();
    deps.deleteProviderArtifact.mockRejectedValueOnce(new Error("provider unavailable"));
    deps.recordProviderOutcome.mockResolvedValueOnce(true);

    await expect(runMeetingPurgeProcessing(JOB, deps)).rejects.toThrow(
      "meeting-provider-delete-failed",
    );
    expect(deps.finalize).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledOnce();
  });
});
