import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  completeSmallSavedMeeting: vi.fn(),
  createMultipartSavedMeeting: vi.fn(),
  createSmallSavedMeeting: vi.fn(),
}));

vi.mock("./service", () => mocks);

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
});
