import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  addMeetingNote: vi.fn(),
  completeSmallSavedMeeting: vi.fn(),
  createMeetingPlaybackAuthorization: vi.fn(),
  createMultipartSavedMeeting: vi.fn(),
  createSmallSavedMeeting: vi.fn(),
  editMeetingNote: vi.fn(),
  getMeetingNotes: vi.fn(),
  getMeetingShareSettings: vi.fn(),
  getSavedMeetingDetail: vi.fn(),
  listSavedMeetings: vi.fn(),
  reassignSavedMeetingOwner: vi.fn(),
  removeMeetingNote: vi.fn(),
  retryMeetingPlayback: vi.fn(),
  updateMeetingShare: vi.fn(),
}));

vi.mock("./service", () => mocks);
vi.mock("./collaboration-service", () => mocks);

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { meetingsRouter } from "./route";

const MEETING_ID = "00000000-0000-4000-8000-000000000072";
const MANIFEST_SHA = "a".repeat(64);
const MIC_SHA = "b".repeat(64);
const SYSTEM_SHA = "c".repeat(64);
const createInput = {
  assets: [
    {
      contentType: "audio/webm;codecs=opus",
      durationMs: 15_000,
      fragmentCount: 1,
      sha256: MIC_SHA,
      sizeBytes: 5,
      track: "microphone" as const,
    },
    {
      contentType: "audio/webm;codecs=opus",
      durationMs: 15_000,
      fragmentCount: 1,
      sha256: SYSTEM_SHA,
      sizeBytes: 8,
      track: "system" as const,
    },
  ],
  id: MEETING_ID,
  manifestSha256: MANIFEST_SHA,
  savedAt: "2026-08-09T02:01:00.000Z",
  startedAt: "2026-08-09T02:00:00.000Z",
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: "org-72" } as never);
      c.set("member", { role: "admin" } as never);
      c.set("user", { id: "user-72" } as never);
      await next();
    })
    .route("/meetings", meetingsRouter);
}

const client = testClient(makeApp());

describe("Meeting Buddy small Saved Meeting control plane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates object-level upload instructions using the client idempotency identity", async () => {
    mocks.createSmallSavedMeeting.mockResolvedValue({
      created: true,
      meetingId: MEETING_ID,
      state: "uploading",
      uploads: [
        {
          contentType: "audio/webm;codecs=opus",
          expiresAt: "2026-08-09T02:06:00.000Z",
          method: "PUT",
          sizeBytes: 5,
          track: "microphone",
          url: "https://r2.invalid/microphone",
        },
        {
          contentType: "audio/webm;codecs=opus",
          expiresAt: "2026-08-09T02:06:00.000Z",
          method: "PUT",
          sizeBytes: 8,
          track: "system",
          url: "https://r2.invalid/system",
        },
      ],
    });

    const response = await client.meetings.$post({ json: createInput });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      meetingId: MEETING_ID,
      state: "uploading",
      uploads: [{ method: "PUT", track: "microphone" }, { track: "system" }],
    });
    expect(mocks.createSmallSavedMeeting).toHaveBeenCalledWith({
      input: createInput,
      organizationId: "org-72",
      ownerId: "user-72",
    });
  });

  it("rejects an idempotency conflict instead of creating another meeting", async () => {
    mocks.createSmallSavedMeeting.mockResolvedValue({
      conflict: true,
      message: "Meeting Session 已绑定另一份本地录音清单",
    });

    const response = await client.meetings.$post({ json: createInput });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Meeting Session 已绑定另一份本地录音清单",
    });
  });

  it("creates a resumable multipart plan for large logical source tracks", async () => {
    const firstPartBytes = 8 * 1024 * 1024;
    const multipartInput = {
      ...createInput,
      assets: createInput.assets.map((asset) => ({
        ...asset,
        parts: [
          {
            md5Base64: "6NxAgbE0NLRRiacgt3toGA==",
            offsetBytes: 0,
            partNumber: 1,
            sizeBytes: firstPartBytes,
          },
          {
            md5Base64: "e+1lendcN8JXB4bQy+79iA==",
            offsetBytes: firstPartBytes,
            partNumber: 2,
            sizeBytes: 2,
          },
        ],
        sizeBytes: firstPartBytes + 2,
      })),
    };
    mocks.createMultipartSavedMeeting.mockResolvedValue({
      created: false,
      meetingId: MEETING_ID,
      state: "uploading",
      uploads: [
        {
          expiresAt: "2026-08-09T02:06:00.000Z",
          headers: { "content-md5": "e+1lendcN8JXB4bQy+79iA==" },
          method: "PUT",
          offsetBytes: firstPartBytes,
          partNumber: 2,
          sizeBytes: 2,
          track: "microphone",
          url: "https://r2.invalid/microphone-part-2",
        },
      ],
    });

    const response = await client.meetings.multipart.$post({ json: multipartInput });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "uploading",
      uploads: [{ partNumber: 2, track: "microphone" }],
    });
    expect(mocks.createMultipartSavedMeeting).toHaveBeenCalledWith({
      input: multipartInput,
      organizationId: "org-72",
      ownerId: "user-72",
    });
  });

  it("verifies both source objects before completing idempotently", async () => {
    mocks.completeSmallSavedMeeting.mockResolvedValue({
      completed: true,
      meetingId: MEETING_ID,
      state: "workspace-verified",
    });

    const response = await client.meetings[":id"].complete.$post({
      json: { manifestSha256: MANIFEST_SHA },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      meetingId: MEETING_ID,
      state: "workspace-verified",
    });
    expect(mocks.completeSmallSavedMeeting).toHaveBeenCalledWith({
      manifestSha256: MANIFEST_SHA,
      meetingId: MEETING_ID,
      organizationId: "org-72",
      ownerId: "user-72",
    });
  });

  it("lists private Saved Meetings using owner-or-administrator authorization", async () => {
    mocks.listSavedMeetings.mockResolvedValue([
      {
        creator: { id: "owner-74", image: null, name: "Alice" },
        durationMs: 62_000,
        id: MEETING_ID,
        processingState: "ready",
        recordingAvailable: true,
        savedAt: "2026-08-09T04:00:00.000Z",
        title: "录制记录-2608091200",
      },
    ]);

    const response = await client.meetings.$get();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      records: [{ id: MEETING_ID, recordingAvailable: true }],
    });
    expect(mocks.listSavedMeetings).toHaveBeenCalledWith({
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("returns the same 404 for a missing or unauthorized private meeting", async () => {
    mocks.getSavedMeetingDetail.mockResolvedValue(null);

    const response = await client.meetings[":id"].$get({ param: { id: MEETING_ID } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Meeting Session 不存在" });
    expect(mocks.getSavedMeetingDetail).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("signs playback only after the same full meeting authorization", async () => {
    mocks.createMeetingPlaybackAuthorization.mockResolvedValue({
      expiresAt: "2026-08-09T04:06:00.000Z",
      url: "https://r2.invalid/playback.webm",
    });

    const response = await client.meetings[":id"].playback.$get({ param: { id: MEETING_ID } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      expiresAt: "2026-08-09T04:06:00.000Z",
      url: "https://r2.invalid/playback.webm",
    });
    expect(mocks.createMeetingPlaybackAuthorization).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("accepts an authorized explicit playback retry", async () => {
    mocks.retryMeetingPlayback.mockResolvedValue({ state: "processing" });

    const response = await client.meetings[":id"].playback.retry.$post({
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ state: "processing" });
    expect(mocks.retryMeetingPlayback).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      userId: "user-72",
    });
  });

  it("rejects a playback retry when the resolved meeting role is read-only", async () => {
    mocks.retryMeetingPlayback.mockResolvedValue("forbidden");

    const response = await client.meetings[":id"].playback.retry.$post({
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "无权重试会议处理" });
  });

  it("returns timestamped notes only after meeting access is authorized", async () => {
    mocks.getMeetingNotes.mockResolvedValue([
      {
        author: { id: "editor", name: "Editor" },
        body: "决定下周跟进",
        createdAt: "2026-08-09T06:00:00.000Z",
        id: "note-1",
        meetingTimeMs: 5000,
        updatedAt: "2026-08-09T06:00:00.000Z",
      },
    ]);

    const response = await client.meetings[":id"].notes.$get({ param: { id: MEETING_ID } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      records: [{ id: "note-1", meetingTimeMs: 5000 }],
    });
  });

  it("rejects a viewer attempting to create a meeting note", async () => {
    mocks.addMeetingNote.mockResolvedValue("forbidden");

    const response = await client.meetings[":id"].notes.$post({
      json: { body: "不能写入", meetingTimeMs: 5000 },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(403);
  });

  it("updates selected grants and workspace visibility through the share subresource", async () => {
    mocks.updateMeetingShare.mockResolvedValue("updated");

    const response = await client.meetings[":id"].share.$put({
      json: {
        grants: [{ role: "editor", userId: "editor" }],
        visibility: "workspace",
      },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(mocks.updateMeetingShare).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      share: { grants: [{ role: "editor", userId: "editor" }], visibility: "workspace" },
      userId: "user-72",
    });
  });

  it("lets an administrator reassign custody to a current workspace member", async () => {
    mocks.reassignSavedMeetingOwner.mockResolvedValue("updated");

    const response = await client.meetings[":id"].share.owner.$post({
      json: { userId: "new-owner" },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(200);
    expect(mocks.reassignSavedMeetingOwner).toHaveBeenCalledWith({
      meetingId: MEETING_ID,
      memberRole: "admin",
      organizationId: "org-72",
      targetUserId: "new-owner",
      userId: "user-72",
    });
  });

  it("rejects owner reassignment while the current owner is still a workspace member", async () => {
    mocks.reassignSavedMeetingOwner.mockResolvedValue("not-custodied");

    const response = await client.meetings[":id"].share.owner.$post({
      json: { userId: "new-owner" },
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(409);
  });
});
