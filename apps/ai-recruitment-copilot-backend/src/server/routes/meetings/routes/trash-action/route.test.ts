import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createMeetingTrashActionRouter } from "./route";
import type { MeetingTrashActionDependencies } from "./route";

const mocks = {
  trashSavedMeeting: vi.fn<MeetingTrashActionDependencies["trashSavedMeeting"]>(),
};

const dependencies: MeetingTrashActionDependencies = mocks;

function makeClient() {
  const app = factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: "org-84" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: "user-84" } as never);
      await next();
    })
    .route("/meetings/:id/trash", createMeetingTrashActionRouter(dependencies));
  return testClient(app);
}

describe("Meeting trash route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the recoverable deadline", async () => {
    mocks.trashSavedMeeting.mockResolvedValue({
      purgeAfter: "2026-08-16T08:00:00.000Z",
      state: "trashed",
    });
    const response = await makeClient().meetings[":id"].trash.$post({
      param: { id: "meeting-84" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      purgeAfter: "2026-08-16T08:00:00.000Z",
      state: "trashed",
    });
  });

  it("does not allow an editor to lifecycle-delete a meeting", async () => {
    mocks.trashSavedMeeting.mockResolvedValue({ state: "forbidden" });
    const response = await makeClient().meetings[":id"].trash.$post({
      param: { id: "meeting-84" },
    });
    expect(response.status).toBe(403);
  });
});
