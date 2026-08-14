import { describe, expect, it, vi } from "vitest";
import {
  buildMeetingPurgeJobId,
  buildMeetingPurgeQueuePrefix,
  meetingPurgeJobSchema,
  reconcileMeetingPurgeJob,
} from "./meeting-purge";

describe("Meeting purge queue", () => {
  it("isolates queues by database and uses one stable job per meeting", () => {
    const env = {
      DATABASE_URL: "postgres://arc@example.test:5432/meeting_purge",
    } as NodeJS.ProcessEnv;
    expect(buildMeetingPurgeQueuePrefix(env)).toMatch(/^arc:meeting-purge:/);
    expect(buildMeetingPurgeJobId({ meetingId: "meeting:84", organizationId: "org-84" })).toBe(
      "meeting-purge-meeting-84",
    );
    expect(
      meetingPurgeJobSchema.parse({ meetingId: "meeting-84", organizationId: "org-84" }),
    ).toEqual({
      meetingId: "meeting-84",
      organizationId: "org-84",
    });
  });

  it("does not enqueue another active delivery for the same meeting", async () => {
    const add = vi.fn();
    await reconcileMeetingPurgeJob(
      {
        add,
        getJob: vi.fn().mockResolvedValue({
          getState: vi.fn().mockResolvedValue("active"),
          remove: vi.fn(),
        }),
      },
      { meetingId: "meeting-84", organizationId: "org-84" },
    );
    expect(add).not.toHaveBeenCalled();
  });

  it("replaces a completed delivery so reconciliation can finish a partial purge", async () => {
    const remove = vi.fn();
    const add = vi.fn();
    await reconcileMeetingPurgeJob(
      {
        add,
        getJob: vi.fn().mockResolvedValue({
          getState: vi.fn().mockResolvedValue("completed"),
          remove,
        }),
      },
      { meetingId: "meeting-84", organizationId: "org-84" },
    );
    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
});
