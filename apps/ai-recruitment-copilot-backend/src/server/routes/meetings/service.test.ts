import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildMeetingRecordingAssetKey: vi.fn(),
  createOrLoadMeetingSession: vi.fn(),
  headMeetingRecordingObject: vi.fn(),
  loadMeetingSession: vi.fn(),
  markMeetingSessionVerified: vi.fn(),
  presignMeetingRecordingPutObject: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildMeetingRecordingAssetKey: mocks.buildMeetingRecordingAssetKey,
  headMeetingRecordingObject: mocks.headMeetingRecordingObject,
  presignMeetingRecordingPutObject: mocks.presignMeetingRecordingPutObject,
}));
vi.mock("./dao", () => ({
  createOrLoadMeetingSession: mocks.createOrLoadMeetingSession,
  loadMeetingSession: mocks.loadMeetingSession,
  markMeetingSessionVerified: mocks.markMeetingSessionVerified,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { completeSmallSavedMeeting, createSmallSavedMeeting } from "./service";

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
  });
});
