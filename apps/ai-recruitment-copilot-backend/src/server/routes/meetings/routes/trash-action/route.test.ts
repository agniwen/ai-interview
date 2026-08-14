import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({ trashSavedMeeting: vi.fn() }));
vi.mock("../../lifecycle-service", () => mocks);

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { meetingTrashActionRouter } from "./route";

function makeClient() {
  const app = factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: "org-84" } as never);
      c.set("user", { id: "user-84" } as never);
      await next();
    })
    .route("/meetings/:id/trash", meetingTrashActionRouter);
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
