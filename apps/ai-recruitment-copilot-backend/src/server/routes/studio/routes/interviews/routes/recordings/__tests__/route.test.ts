import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  presignRecordingGetObjectUrl: vi.fn(),
  resolveCandidateIdForRound: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mocks.limit,
        }),
      }),
    }),
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  presignRecordingGetObjectUrl: mocks.presignRecordingGetObjectUrl,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds",
  () => ({
    resolveCandidateIdForRound: mocks.resolveCandidateIdForRound,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { recordingsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/recordings/route";

const ORG_ID = "org_recordings_route";
const ROUND_ID = "round_recordings_route";
const CONVERSATION_ID = "conversation_recordings_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: ORG_ID } as never);
      await next();
    })
    .route("/:id/recordings", recordingsRouter);
}

describe("recordingsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCandidateIdForRound.mockResolvedValue("candidate_1");
  });

  it("returns a presigned recording URL for a completed recording in the same round", async () => {
    mocks.limit.mockResolvedValue([
      {
        recordingFileKey: "recordings/round.mp4",
        recordingStatus: "completed",
        scheduleEntryId: ROUND_ID,
      },
    ]);
    mocks.presignRecordingGetObjectUrl.mockResolvedValue("https://s3.example/recording.mp4");

    const res = await makeApp().request(`/${ROUND_ID}/recordings/${CONVERSATION_ID}`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      expiresInSeconds: 600,
      url: "https://s3.example/recording.mp4",
    });
    expect(mocks.resolveCandidateIdForRound).toHaveBeenCalledWith(ROUND_ID, ORG_ID);
    expect(mocks.presignRecordingGetObjectUrl).toHaveBeenCalledWith("recordings/round.mp4", 600);
  });

  it("returns 404 when the conversation is not part of the requested round", async () => {
    mocks.limit.mockResolvedValue([
      {
        recordingFileKey: "recordings/other.mp4",
        recordingStatus: "completed",
        scheduleEntryId: "other_round",
      },
    ]);

    const res = await makeApp().request(`/${ROUND_ID}/recordings/${CONVERSATION_ID}`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "未找到该轮录像。" });
  });

  it("returns 404 before reading storage metadata when the round is outside the organization", async () => {
    mocks.resolveCandidateIdForRound.mockResolvedValue(null);

    const res = await makeApp().request(`/${ROUND_ID}/recordings/${CONVERSATION_ID}`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "记录不存在。" });
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.presignRecordingGetObjectUrl).not.toHaveBeenCalled();
  });

  it("returns 409 when the recording is not completed yet", async () => {
    mocks.limit.mockResolvedValue([
      {
        recordingFileKey: "recordings/round.mp4",
        recordingStatus: "processing",
        scheduleEntryId: ROUND_ID,
      },
    ]);

    const res = await makeApp().request(`/${ROUND_ID}/recordings/${CONVERSATION_ID}`);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "录像尚未生成完成, 请稍后再试。",
      status: "processing",
    });
  });
});
