import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  abortMeetingRecordingMultipartUpload: vi.fn(),
  buildMeetingRecordingAssetKey: vi.fn(),
  completeMeetingRecordingMultipartUpload: vi.fn(),
  createMeetingRecordingMultipartUpload: vi.fn(),
  createOrLoadMeetingSession: vi.fn(),
  enqueueMeetingPlaybackJobs: vi.fn(),
  headMeetingRecordingObject: vi.fn(),
  isMeetingProcessingQueueConfigured: vi.fn(),
  listMeetingRecordingUploadParts: vi.fn(),
  listMeetingSessionsForAccess: vi.fn(),
  loadMeetingSession: vi.fn(),
  loadMeetingSessionForAccess: vi.fn(),
  markMeetingSessionVerified: vi.fn(),
  presignMeetingRecordingPutObject: vi.fn(),
  presignMeetingRecordingUploadPart: vi.fn(),
  presignRecordingGetObjectUrl: vi.fn(),
  recordMeetingAssetMultipartUploadId: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  abortMeetingRecordingMultipartUpload: mocks.abortMeetingRecordingMultipartUpload,
  buildMeetingRecordingAssetKey: mocks.buildMeetingRecordingAssetKey,
  completeMeetingRecordingMultipartUpload: mocks.completeMeetingRecordingMultipartUpload,
  createMeetingRecordingMultipartUpload: mocks.createMeetingRecordingMultipartUpload,
  headMeetingRecordingObject: mocks.headMeetingRecordingObject,
  listMeetingRecordingUploadParts: mocks.listMeetingRecordingUploadParts,
  presignMeetingRecordingPutObject: mocks.presignMeetingRecordingPutObject,
  presignMeetingRecordingUploadPart: mocks.presignMeetingRecordingUploadPart,
  presignRecordingGetObjectUrl: mocks.presignRecordingGetObjectUrl,
}));
vi.mock("./dao", () => ({
  createOrLoadMeetingSession: mocks.createOrLoadMeetingSession,
  listMeetingSessionsForAccess: mocks.listMeetingSessionsForAccess,
  loadMeetingSession: mocks.loadMeetingSession,
  loadMeetingSessionForAccess: mocks.loadMeetingSessionForAccess,
  markMeetingSessionVerified: mocks.markMeetingSessionVerified,
  recordMeetingAssetMultipartUploadId: mocks.recordMeetingAssetMultipartUploadId,
}));
vi.mock("@arc/meeting-processing-queue/meeting-playback", () => ({
  enqueueMeetingPlaybackJobs: mocks.enqueueMeetingPlaybackJobs,
  isMeetingProcessingQueueConfigured: mocks.isMeetingProcessingQueueConfigured,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import {
  completeSmallSavedMeeting,
  createMeetingPlaybackAuthorization,
  createMultipartSavedMeeting,
  createSmallSavedMeeting,
  listSavedMeetings,
  retryMeetingPlayback,
} from "./service";

const MANIFEST_SHA = "a".repeat(64);
const baseMeeting = {
  assets: [
    {
      contentType: "audio/webm;codecs=opus",
      durationMs: 15_000,
      fragmentCount: 1,
      id: "meeting:microphone",
      meetingId: "meeting",
      sha256: "b".repeat(64),
      sizeBytes: 5,
      status: "uploading",
      storageKey: "meetings/org/meeting/microphone.webm",
      track: "microphone",
    },
    {
      contentType: "audio/webm;codecs=opus",
      durationMs: 15_000,
      fragmentCount: 1,
      id: "meeting:system",
      meetingId: "meeting",
      sha256: "c".repeat(64),
      sizeBytes: 8,
      status: "uploading",
      storageKey: "meetings/org/meeting/system.webm",
      track: "system",
    },
  ],
  id: "meeting",
  manifestSha256: MANIFEST_SHA,
  organizationId: "org",
  ownerId: "owner",
  status: "uploading",
};

describe("small Saved Meeting service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMeetingProcessingQueueConfigured.mockReturnValue(true);
    mocks.markMeetingSessionVerified.mockResolvedValue(new Date("2026-08-10T03:00:00.000Z"));
  });

  it("does not generate another upload plan for an already verified idempotent create", async () => {
    mocks.buildMeetingRecordingAssetKey.mockResolvedValue("unused");
    mocks.createOrLoadMeetingSession.mockResolvedValue({
      created: false,
      meeting: { ...baseMeeting, status: "workspace-verified" },
    });

    const result = await createSmallSavedMeeting({
      input: {
        assets: baseMeeting.assets.map(
          ({ contentType, durationMs, fragmentCount, sha256, sizeBytes, track }) => ({
            contentType,
            durationMs,
            fragmentCount,
            sha256,
            sizeBytes,
            track: track as "microphone" | "system",
          }),
        ),
        id: "00000000-0000-4000-8000-000000000072",
        manifestSha256: MANIFEST_SHA,
        savedAt: "2026-08-09T03:01:00.000Z",
        startedAt: "2026-08-09T03:00:00.000Z",
      },
      organizationId: "org",
      ownerId: "owner",
    });

    expect(result).toMatchObject({ state: "workspace-verified", uploads: [] });
    expect(mocks.presignMeetingRecordingPutObject).not.toHaveBeenCalled();
  });

  it("does not reset an exhausted processing budget through an idempotent save", async () => {
    mocks.buildMeetingRecordingAssetKey.mockResolvedValue("unused");
    mocks.createOrLoadMeetingSession.mockResolvedValue({
      created: false,
      meeting: { ...baseMeeting, status: "processing-failed" },
    });

    await createSmallSavedMeeting({
      input: {
        assets: baseMeeting.assets.map(
          ({ contentType, durationMs, fragmentCount, sha256, sizeBytes, track }) => ({
            contentType,
            durationMs,
            fragmentCount,
            sha256,
            sizeBytes,
            track: track as "microphone" | "system",
          }),
        ),
        id: "00000000-0000-4000-8000-000000000072",
        manifestSha256: MANIFEST_SHA,
        savedAt: "2026-08-09T03:01:00.000Z",
        startedAt: "2026-08-09T03:00:00.000Z",
      },
      organizationId: "org",
      ownerId: "owner",
    });

    expect(mocks.enqueueMeetingPlaybackJobs).not.toHaveBeenCalled();
  });

  it("resumes multipart assets by signing only parts not confirmed by object storage", async () => {
    const firstMd5 = "6NxAgbE0NLRRiacgt3toGA==";
    const secondMd5 = "e+1lendcN8JXB4bQy+79iA==";
    const multipartAssets = baseMeeting.assets.map((asset) => ({
      ...asset,
      multipartParts: [
        { md5Base64: firstMd5, offsetBytes: 0, partNumber: 1, sizeBytes: 8 },
        { md5Base64: secondMd5, offsetBytes: 8, partNumber: 2, sizeBytes: 2 },
      ],
      multipartUploadId: `upload-${asset.track}`,
      sizeBytes: 10,
      uploadMode: "multipart",
    }));
    mocks.buildMeetingRecordingAssetKey.mockImplementation(({ track }: { track: string }) =>
      Promise.resolve(`meetings/org/meeting/${track}.webm`),
    );
    mocks.createOrLoadMeetingSession.mockResolvedValue({
      created: false,
      meeting: { ...baseMeeting, assets: multipartAssets },
    });
    mocks.headMeetingRecordingObject.mockImplementation((storageKey: string) =>
      Promise.resolve(
        storageKey.includes("system")
          ? {
              checksumSha256: null,
              contentLength: 10,
              contentType: "audio/webm;codecs=opus",
              etag: '"83b4d77c56fe20f85c6e50a48d229a45-2"',
              sha256: "c".repeat(64),
            }
          : null,
      ),
    );
    mocks.listMeetingRecordingUploadParts.mockResolvedValue([
      {
        etag: `"${Buffer.from(firstMd5, "base64").toString("hex")}"`,
        partNumber: 1,
        sizeBytes: 8,
      },
    ]);
    mocks.presignMeetingRecordingUploadPart.mockResolvedValue({
      expiresAt: new Date("2026-08-09T03:10:00.000Z"),
      headers: { "content-md5": secondMd5 },
      url: "https://r2.invalid/microphone-part-2",
    });

    const result = await createMultipartSavedMeeting({
      input: {
        assets: multipartAssets.map(
          ({ contentType, durationMs, fragmentCount, multipartParts, sha256, track }) => ({
            contentType,
            durationMs,
            fragmentCount,
            parts: multipartParts,
            sha256,
            sizeBytes: 10,
            track: track as "microphone" | "system",
          }),
        ),
        id: "meeting",
        manifestSha256: MANIFEST_SHA,
        savedAt: "2026-08-09T03:01:00.000Z",
        startedAt: "2026-08-09T03:00:00.000Z",
      },
      organizationId: "org",
      ownerId: "owner",
    });

    expect(result).toMatchObject({
      meetingId: "meeting",
      state: "uploading",
      uploads: [
        {
          headers: { "content-md5": secondMd5 },
          offsetBytes: 8,
          partNumber: 2,
          sizeBytes: 2,
          track: "microphone",
        },
      ],
    });
    expect(mocks.presignMeetingRecordingUploadPart).toHaveBeenCalledTimes(1);
    expect(mocks.listMeetingRecordingUploadParts).toHaveBeenCalledTimes(1);
  });

  it("aborts a multipart upload that loses concurrent initialization", async () => {
    const parts = [
      {
        md5Base64: "6NxAgbE0NLRRiacgt3toGA==",
        offsetBytes: 0,
        partNumber: 1,
        sizeBytes: 8,
      },
    ];
    const pendingAssets = baseMeeting.assets.map((asset) => ({
      ...asset,
      multipartParts: parts,
      multipartUploadId: null,
      sizeBytes: 8,
      uploadMode: "multipart",
    }));
    mocks.buildMeetingRecordingAssetKey.mockImplementation(({ track }: { track: string }) =>
      Promise.resolve(`meetings/org/meeting/${track}.webm`),
    );
    mocks.createOrLoadMeetingSession.mockResolvedValue({
      created: true,
      meeting: { ...baseMeeting, assets: pendingAssets },
    });
    mocks.createMeetingRecordingMultipartUpload
      .mockResolvedValueOnce("new-microphone")
      .mockResolvedValueOnce("new-system");
    mocks.recordMeetingAssetMultipartUploadId
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mocks.loadMeetingSession.mockResolvedValue({
      ...baseMeeting,
      assets: pendingAssets.map((asset) => ({
        ...asset,
        multipartUploadId: asset.track === "microphone" ? "winning-microphone" : "new-system",
      })),
    });
    mocks.headMeetingRecordingObject.mockImplementation((storageKey: string) =>
      Promise.resolve({
        checksumSha256: null,
        contentLength: 8,
        contentType: "audio/webm;codecs=opus",
        etag: '"0076f5a4a003c02006afccdb09310a22-1"',
        sha256: storageKey.includes("system") ? "c".repeat(64) : "b".repeat(64),
      }),
    );

    await createMultipartSavedMeeting({
      input: {
        assets: pendingAssets.map(
          ({ contentType, durationMs, fragmentCount, multipartParts, sha256, track }) => ({
            contentType,
            durationMs,
            fragmentCount,
            parts: multipartParts,
            sha256,
            sizeBytes: 8,
            track: track as "microphone" | "system",
          }),
        ),
        id: "meeting",
        manifestSha256: MANIFEST_SHA,
        savedAt: "2026-08-09T03:01:00.000Z",
        startedAt: "2026-08-09T03:00:00.000Z",
      },
      organizationId: "org",
      ownerId: "owner",
    });

    expect(mocks.abortMeetingRecordingMultipartUpload).toHaveBeenCalledExactlyOnceWith({
      storageKey: "meetings/org/meeting/microphone.webm",
      uploadId: "new-microphone",
    });
  });

  it("refuses a same-size object whose storage-enforced checksum is wrong", async () => {
    mocks.loadMeetingSession.mockResolvedValue(baseMeeting);
    mocks.headMeetingRecordingObject
      .mockResolvedValueOnce({
        checksumSha256: Buffer.from("b".repeat(64), "hex").toString("base64"),
        contentLength: 5,
        contentType: "audio/webm;codecs=opus",
        sha256: "b".repeat(64),
      })
      .mockResolvedValueOnce({
        checksumSha256: Buffer.from("d".repeat(64), "hex").toString("base64"),
        contentLength: 8,
        contentType: "audio/webm;codecs=opus",
        sha256: "c".repeat(64),
      });

    const result = await completeSmallSavedMeeting({
      manifestSha256: MANIFEST_SHA,
      meetingId: "meeting",
      organizationId: "org",
      ownerId: "owner",
    });

    expect(result).toEqual({ error: "源音轨尚未通过对象完整性校验", status: 409 });
    expect(mocks.markMeetingSessionVerified).not.toHaveBeenCalled();
  });

  it("marks the meeting only after both source objects match", async () => {
    mocks.loadMeetingSession.mockResolvedValue(baseMeeting);
    for (const asset of baseMeeting.assets) {
      mocks.headMeetingRecordingObject.mockResolvedValueOnce({
        checksumSha256: Buffer.from(asset.sha256, "hex").toString("base64"),
        contentLength: asset.sizeBytes,
        contentType: asset.contentType,
        sha256: asset.sha256,
      });
    }

    const result = await completeSmallSavedMeeting({
      manifestSha256: MANIFEST_SHA,
      meetingId: "meeting",
      organizationId: "org",
      ownerId: "owner",
    });

    expect(result).toMatchObject({ completed: true, state: "workspace-verified" });
    expect(mocks.markMeetingSessionVerified).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueMeetingPlaybackJobs).toHaveBeenCalledWith([
      { meetingId: "meeting", organizationId: "org" },
    ]);
  });

  it("completes exact multipart assets once and starts the 24-hour recovery deadline", async () => {
    const firstMd5 = "6NxAgbE0NLRRiacgt3toGA==";
    const secondMd5 = "e+1lendcN8JXB4bQy+79iA==";
    const assets = baseMeeting.assets.map((asset) => ({
      ...asset,
      multipartParts: [
        { md5Base64: firstMd5, offsetBytes: 0, partNumber: 1, sizeBytes: 8 },
        { md5Base64: secondMd5, offsetBytes: 8, partNumber: 2, sizeBytes: 2 },
      ],
      multipartUploadId: `upload-${asset.track}`,
      sizeBytes: 10,
      uploadMode: "multipart",
    }));
    mocks.loadMeetingSession.mockResolvedValue({ ...baseMeeting, assets });
    mocks.listMeetingRecordingUploadParts.mockResolvedValue([
      { etag: '"e8dc4081b13434b45189a720b77b6818"', partNumber: 1, sizeBytes: 8 },
      { etag: '"7bed657a775c37c2570786d0cbeefd88"', partNumber: 2, sizeBytes: 2 },
    ]);
    mocks.headMeetingRecordingObject
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockImplementation((storageKey: string) =>
        Promise.resolve({
          checksumSha256: null,
          contentLength: 10,
          contentType: "audio/webm;codecs=opus",
          etag: '"83b4d77c56fe20f85c6e50a48d229a45-2"',
          sha256: storageKey.includes("system") ? "c".repeat(64) : "b".repeat(64),
        }),
      );
    mocks.markMeetingSessionVerified.mockResolvedValue(new Date("2026-08-10T03:00:00.000Z"));
    mocks.completeMeetingRecordingMultipartUpload
      .mockRejectedValueOnce(
        Object.assign(new Error("already completed"), { name: "NoSuchUpload" }),
      )
      .mockImplementationOnce(() => Promise.resolve());

    const result = await completeSmallSavedMeeting({
      manifestSha256: MANIFEST_SHA,
      meetingId: "meeting",
      organizationId: "org",
      ownerId: "owner",
    });

    expect(result).toEqual({
      completed: true,
      meetingId: "meeting",
      recoveryCopyDeleteAfter: "2026-08-10T03:00:00.000Z",
      state: "workspace-verified",
    });
    expect(mocks.completeMeetingRecordingMultipartUpload).toHaveBeenCalledTimes(2);
    expect(mocks.markMeetingSessionVerified).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.loadMeetingSession.mockResolvedValue({
      ...baseMeeting,
      assets,
      recoveryCopyDeleteAfter: new Date("2026-08-10T03:00:00.000Z"),
      status: "workspace-verified",
    });
    const repeated = await completeSmallSavedMeeting({
      manifestSha256: MANIFEST_SHA,
      meetingId: "meeting",
      organizationId: "org",
      ownerId: "owner",
    });
    expect(repeated).toMatchObject({
      completed: false,
      recoveryCopyDeleteAfter: "2026-08-10T03:00:00.000Z",
    });
    expect(mocks.completeMeetingRecordingMultipartUpload).not.toHaveBeenCalled();
    expect(mocks.enqueueMeetingPlaybackJobs).toHaveBeenCalledWith([
      { meetingId: "meeting", organizationId: "org" },
    ]);
  });
});

describe("Saved Meeting private read service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes ordinary members to meetings they own while administrators can list the workspace", async () => {
    mocks.listMeetingSessionsForAccess.mockResolvedValue([]);

    await listSavedMeetings({
      memberRole: "hr",
      organizationId: "org",
      userId: "user",
    });
    expect(mocks.listMeetingSessionsForAccess).toHaveBeenLastCalledWith({
      includeAllPrivateMeetings: false,
      organizationId: "org",
      userId: "user",
    });

    await listSavedMeetings({
      memberRole: "admin",
      organizationId: "org",
      userId: "user",
    });
    expect(mocks.listMeetingSessionsForAccess).toHaveBeenLastCalledWith({
      includeAllPrivateMeetings: true,
      organizationId: "org",
      userId: "user",
    });
  });

  it("does not sign or expose playback storage for an unauthorized meeting", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue(null);

    const result = await createMeetingPlaybackAuthorization({
      meetingId: "meeting",
      memberRole: "viewer",
      organizationId: "org",
      userId: "viewer",
    });

    expect(result).toBeNull();
    expect(mocks.presignRecordingGetObjectUrl).not.toHaveBeenCalled();
  });

  it("returns only a short-lived URL after authorized ready playback lookup", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      assets: [
        {
          status: "ready",
          storageKey: "private/playback.webm",
          track: "playback",
        },
      ],
      id: "meeting",
      status: "ready",
    });
    mocks.presignRecordingGetObjectUrl.mockResolvedValue(
      "https://r2.invalid/private/playback.webm",
    );

    const result = await createMeetingPlaybackAuthorization({
      meetingId: "meeting",
      memberRole: "admin",
      organizationId: "org",
      userId: "admin",
    });

    expect(result).toEqual({
      expiresAt: expect.any(String),
      url: "https://r2.invalid/private/playback.webm",
    });
    expect(result).not.toHaveProperty("storageKey");
  });

  it("starts a fresh retry budget only after an authorized explicit retry", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue({
      assets: [],
      id: "meeting",
      status: "processing-failed",
    });

    const result = await retryMeetingPlayback({
      meetingId: "meeting",
      memberRole: "admin",
      organizationId: "org",
      userId: "admin",
    });

    expect(result).toEqual({ state: "processing" });
    expect(mocks.enqueueMeetingPlaybackJobs).toHaveBeenCalledWith([
      { meetingId: "meeting", organizationId: "org" },
    ]);
  });

  it("does not reveal or enqueue an unauthorized retry target", async () => {
    mocks.loadMeetingSessionForAccess.mockResolvedValue(null);

    const result = await retryMeetingPlayback({
      meetingId: "meeting",
      memberRole: "viewer",
      organizationId: "org",
      userId: "viewer",
    });

    expect(result).toBeNull();
    expect(mocks.enqueueMeetingPlaybackJobs).not.toHaveBeenCalled();
  });
});
