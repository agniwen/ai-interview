import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createMeetingRestoreRouter } from "./routes/restore/route";
import { createMeetingTrashActionRouter } from "./routes/trash-action/route";
import { createMeetingTrashRouter } from "./routes/trash/route";
import { createMeetingsRouter } from "./route";

const mocks = {
  listTrashedSavedMeetings: vi.fn(),
  permanentlyPurgeSavedMeeting: vi.fn(),
  restoreSavedMeeting: vi.fn(),
  trashSavedMeeting: vi.fn(),
};

const meetingsRouter = createMeetingsRouter({
  meetingRestoreRouter: createMeetingRestoreRouter(mocks.restoreSavedMeeting),
  meetingTrashActionRouter: createMeetingTrashActionRouter({
    trashSavedMeeting: mocks.trashSavedMeeting,
  }),
  meetingTrashRouter: createMeetingTrashRouter(mocks.listTrashedSavedMeetings),
  permanentlyPurgeSavedMeeting: mocks.permanentlyPurgeSavedMeeting,
});

const MEETING_ID = "00000000-0000-4000-8000-000000000084";

function makeClient() {
  const app = factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: "org-84" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "member" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: "user-84" } as never);
      await next();
    })
    .route("/meetings", meetingsRouter);
  return testClient(app);
}

describe("Meeting lifecycle routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trashes, lists, restores and permanently purges through lifecycle endpoints", async () => {
    mocks.trashSavedMeeting.mockResolvedValue({
      purgeAfter: "2026-08-16T08:00:00.000Z",
      state: "trashed",
    });
    mocks.listTrashedSavedMeetings.mockResolvedValue({
      page: 1,
      pageSize: 10,
      records: [
        {
          creator: { id: "user-84", image: null, name: "Owner" },
          id: MEETING_ID,
          purgeAfter: "2026-08-16T08:00:00.000Z",
          savedAt: "2026-08-09T08:00:00.000Z",
          title: "Meeting",
          trashedAt: "2026-08-09T09:00:00.000Z",
        },
      ],
      total: 1,
      totalPages: 1,
    });
    mocks.restoreSavedMeeting.mockResolvedValue({ state: "restored" });
    mocks.permanentlyPurgeSavedMeeting.mockResolvedValue({ state: "purging" });
    const client = makeClient();

    const trashResponse = await client.meetings[":id"].trash.$post({
      param: { id: MEETING_ID },
    });
    expect(trashResponse.status).toBe(200);
    const listResponse = await client.meetings.trash.$get({
      query: { page: "1", pageSize: "10" },
    });
    expect(await listResponse.json()).toMatchObject({
      page: 1,
      pageSize: 10,
      records: [{ id: MEETING_ID }],
      total: 1,
      totalPages: 1,
    });
    const restoreResponse = await client.meetings[":id"].restore.$post({
      param: { id: MEETING_ID },
    });
    expect(restoreResponse.status).toBe(200);
    const purgeResponse = await client.meetings[":id"].$delete({
      param: { id: MEETING_ID },
      query: {},
    });
    expect(purgeResponse.status).toBe(202);
    expect(mocks.permanentlyPurgeSavedMeeting).toHaveBeenCalledWith({
      actorId: "user-84",
      localRecoveryCleanup: "not-reported",
      meetingId: MEETING_ID,
      organizationId: "org-84",
    });
  });

  it("keeps an uploading meeting in trash when restore capacity is full", async () => {
    mocks.restoreSavedMeeting.mockResolvedValue({ state: "capacity" });
    const response = await makeClient().meetings[":id"].restore.$post({
      param: { id: MEETING_ID },
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "meeting-upload-capacity-exhausted",
    });
  });
});
