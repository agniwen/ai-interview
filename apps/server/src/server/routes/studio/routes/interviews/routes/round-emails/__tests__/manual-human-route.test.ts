import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import type { Env } from "../../../../../../../type";
import { createManualHumanEmailRouter } from "../human-route";
import { currentReschedulePayload } from "../application/manual-human-email";

const meetingId = "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf6";
const roundId = "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf7";
const path = `/${meetingId}/${roundId}`;
function setup(authorized = true) {
  const preview = vi.fn().mockResolvedValue({ options: [] });
  const confirm = vi.fn().mockResolvedValue({ status: "pending" });
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("activeOrg", {
      createdAt: new Date(),
      id: "org",
      logo: null,
      metadata: null,
      name: "Org",
      slug: "org",
    });
    // SAFETY: Only the authenticated user's id is consumed by this route.
    c.set("user", { id: "hr" } as NonNullable<Env["Variables"]["user"]>);
    await next();
  });
  app.route(
    "/",
    createManualHumanEmailRouter({
      confirm,
      preview,
      requireResumeRead: async (_c, next) => {
        await next();
      },
      requireUpdate: async (c, next) => {
        if (!authorized) {
          return c.json({ message: "Forbidden" }, 403);
        }
        await next();
      },
      visibility: vi.fn().mockResolvedValue({ mode: "all" }),
    }),
  );
  return { app, confirm, preview };
}
it("preview never sends and scopes the read to the logged-in actor", async () => {
  const { app, confirm, preview } = setup();
  const response = await app.request(`${path}/preview`);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(preview).toHaveBeenCalledExactlyOnceWith({
    actorUserId: "hr",
    meetingId,
    organizationId: "org",
    roundId,
    visibility: { mode: "all" },
  });
  expect(confirm).not.toHaveBeenCalled();
});
it.each([
  {},
  { confirmationToken: "token", confirmed: false, type: "human_interview_cancelled" },
  { confirmationToken: "token", confirmed: true, type: "ai_interview_invited" },
])("blocks missing confirmation or unsupported type %o", async (body) => {
  const { app, confirm } = setup();
  const response = await app.request(`${path}/confirm`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.status).toBe(400);
  expect(confirm).not.toHaveBeenCalled();
});
it("passes exactly the chosen type and signed confirmation to the command", async () => {
  const { app, confirm } = setup();
  const response = await app.request(`${path}/confirm`, {
    body: JSON.stringify({
      confirmationToken: "token",
      confirmed: true,
      type: "human_interview_rescheduled",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.status).toBe(202);
  expect(confirm).toHaveBeenCalledExactlyOnceWith(
    { actorUserId: "hr", meetingId, organizationId: "org", roundId, visibility: { mode: "all" } },
    "human_interview_rescheduled",
    "token",
  );
});
it("requires update permission for both endpoints", async () => {
  const { app, confirm, preview } = setup(false);
  const read = await app.request(`${path}/preview`);
  const write = await app.request(`${path}/confirm`, { method: "POST" });
  expect(read.status).toBe(403);
  expect(write.status).toBe(403);
  expect(preview).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});
it("does not reuse an old schedule change for a newer meeting version", () => {
  const meeting = {
    scheduledAt: new Date("2026-09-20T02:00:00Z"),
    validUntil: new Date("2026-09-20T03:00:00Z"),
  };
  const payload = {
    interviewEndTime: meeting.validUntil.toISOString(),
    interviewStartTime: meeting.scheduledAt.toISOString(),
    oldInterviewEndTime: "2026-09-19T03:00:00.000Z",
    oldInterviewStartTime: "2026-09-19T02:00:00.000Z",
    schemaVersion: 1 as const,
    timeZone: "Asia/Shanghai",
  };
  expect(currentReschedulePayload(payload, meeting)).not.toBeNull();
  expect(
    currentReschedulePayload({ ...payload, oldInterviewStartTime: undefined }, meeting),
  ).toBeNull();
  expect(
    currentReschedulePayload(payload, { ...meeting, scheduledAt: new Date("2026-09-21") }),
  ).toBeNull();
});
