import { describe, expect, it, vi } from "vitest";
import { resolveHumanMeetingUpdateAccess } from "./human-meeting-update-access";

const input = {
  headers: new Headers(),
  meetingId: "meeting_1",
  memberRole: "member",
  organizationId: "org_1",
  userId: "user_1",
};

describe("human meeting update access", () => {
  it("allows a user with workspace update permission without requiring a meeting relation", async () => {
    await expect(
      resolveHumanMeetingUpdateAccess(input, {
        canUpdateHumanInterviews: vi.fn(() => Promise.resolve(true)),
      }),
    ).resolves.toBe(true);
  });

  it("denies an assigned interviewer when workspace update permission is absent", async () => {
    await expect(
      resolveHumanMeetingUpdateAccess(input, {
        canUpdateHumanInterviews: vi.fn(() => Promise.resolve(false)),
      }),
    ).resolves.toBe(false);
  });
});
