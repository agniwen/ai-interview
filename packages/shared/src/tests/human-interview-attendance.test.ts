import { describe, expect, it } from "vitest";
import {
  describeHumanInterviewAttendance,
  humanInterviewParticipantPresence,
} from "../human-interview-attendance";

const baseMeeting = {
  establishedAt: null,
  interviewers: [{ joinedAt: null, leftAt: null, role: "host" as const }],
  rounds: [{ joinedAt: null, leftAt: null }],
  scheduledAt: "2026-09-10T08:00:00.000Z",
  status: "scheduled" as const,
  validUntil: "2026-09-10T09:00:00.000Z",
};

describe("human interview attendance", () => {
  it("derives participant presence from the latest join and leave timestamps", () => {
    expect(humanInterviewParticipantPresence({ joinedAt: null, leftAt: null })).toBe("not_joined");
    expect(
      humanInterviewParticipantPresence({
        joinedAt: "2026-09-10T08:01:00.000Z",
        leftAt: null,
      }),
    ).toBe("present");
    expect(
      humanInterviewParticipantPresence({
        joinedAt: "2026-09-10T08:01:00.000Z",
        leftAt: "2026-09-10T08:20:00.000Z",
      }),
    ).toBe("left");
  });

  it("distinguishes who the meeting is waiting for", () => {
    expect(
      describeHumanInterviewAttendance(
        {
          ...baseMeeting,
          interviewers: [
            {
              joinedAt: "2026-09-10T08:01:00.000Z",
              leftAt: null,
              role: "host",
            },
          ],
        },
        new Date("2026-09-10T08:04:00.000Z"),
      ).status,
    ).toBe("waiting_candidate");
    expect(
      describeHumanInterviewAttendance(
        {
          ...baseMeeting,
          rounds: [{ joinedAt: "2026-09-10T08:01:00.000Z", leftAt: null }],
        },
        new Date("2026-09-10T08:04:00.000Z"),
      ).status,
    ).toBe("waiting_interviewer");
  });

  it("does not count observers as the required interviewer", () => {
    expect(
      describeHumanInterviewAttendance(
        {
          ...baseMeeting,
          interviewers: [
            {
              joinedAt: "2026-09-10T08:01:00.000Z",
              leftAt: null,
              role: "observer",
            },
          ],
          rounds: [{ joinedAt: "2026-09-10T08:01:00.000Z", leftAt: null }],
        },
        new Date("2026-09-10T08:04:00.000Z"),
      ).status,
    ).toBe("waiting_interviewer");
  });

  it("shows an expired unestablished meeting as not held before reconciliation completes", () => {
    expect(
      describeHumanInterviewAttendance(baseMeeting, new Date("2026-09-10T09:01:00.000Z")).status,
    ).toBe("not_held");
  });

  it("keeps a historical ended meeting ended even without establishment metadata", () => {
    expect(
      describeHumanInterviewAttendance(
        { ...baseMeeting, status: "ended" },
        new Date("2026-09-10T09:01:00.000Z"),
      ).status,
    ).toBe("ended");
  });
});
