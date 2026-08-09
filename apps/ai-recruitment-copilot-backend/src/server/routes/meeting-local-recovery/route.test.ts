import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  loadMeetingLocalRecoveryDirective: vi.fn(),
  recordMeetingLocalRecoveryCleanup: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/auth", () => ({
  authMiddleware: (c: { set: (key: string, value: unknown) => void }, next: () => unknown) => {
    c.set("user", { id: "former-owner-84" });
    return Promise.resolve(next());
  },
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/meetings/lifecycle-dao", () => mocks);

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { meetingLocalRecoveryRouter } from "./route";

const MANIFEST_SHA = "a".repeat(64);
const client = testClient(
  factory.createApp().route("/meeting-local-recovery", meetingLocalRecoveryRouter),
);

describe("Meeting local recovery route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the authenticated owner plus local manifest proof without workspace membership", async () => {
    mocks.loadMeetingLocalRecoveryDirective.mockResolvedValue("delete");
    mocks.recordMeetingLocalRecoveryCleanup.mockResolvedValue("recorded");

    const directive = await client["meeting-local-recovery"][":id"].$post({
      json: { manifestSha256: MANIFEST_SHA },
      param: { id: "meeting-84" },
    });
    expect(await directive.json()).toEqual({ deleteRequired: true });
    expect(mocks.loadMeetingLocalRecoveryDirective).toHaveBeenCalledWith({
      actorId: "former-owner-84",
      manifestSha256: MANIFEST_SHA,
      meetingId: "meeting-84",
    });

    const report = await client["meeting-local-recovery"][":id"].$put({
      json: { manifestSha256: MANIFEST_SHA, status: "deleted" },
      param: { id: "meeting-84" },
    });
    expect(report.status).toBe(204);
  });

  it("does not expose whether an unrelated proof matched", async () => {
    mocks.loadMeetingLocalRecoveryDirective.mockResolvedValue("retain");
    mocks.recordMeetingLocalRecoveryCleanup.mockResolvedValue("not-found");

    const directive = await client["meeting-local-recovery"][":id"].$post({
      json: { manifestSha256: MANIFEST_SHA },
      param: { id: "meeting-84" },
    });
    expect(await directive.json()).toEqual({ deleteRequired: false });
    const report = await client["meeting-local-recovery"][":id"].$put({
      json: { manifestSha256: MANIFEST_SHA, status: "deleted" },
      param: { id: "meeting-84" },
    });
    expect(report.status).toBe(204);
  });
});
