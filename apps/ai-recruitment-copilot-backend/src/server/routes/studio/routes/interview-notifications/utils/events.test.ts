import { describe, expect, it } from "vitest";
import {
  buildHumanInterviewEvaluationSummary,
  buildHumanInterviewRoundProgression,
  buildInterviewReminderSchedule,
  resolveHumanMeetingEventInterviewLink,
  resolveInterviewNotificationCompanyName,
} from "./events";

describe("human interview round progression", () => {
  it("starts after AI HR and advances from the latest passed human round", () => {
    expect(buildHumanInterviewRoundProgression([])).toEqual({
      currentRoundNumber: 2,
      previousRoundName: "HR 初面",
      previousRoundNumber: 1,
    });
    expect(
      buildHumanInterviewRoundProgression([{ label: "技术一面" }, { label: "技术二面" }]),
    ).toEqual({
      currentRoundNumber: 4,
      previousRoundName: "技术二面",
      previousRoundNumber: 3,
    });
  });
});

describe("interview notification reminder schedule", () => {
  it("creates T-24h and T-1h reminders when both are still in the future", () => {
    expect(
      buildInterviewReminderSchedule(
        new Date("2026-08-22T10:00:00.000Z"),
        new Date("2026-08-20T10:00:00.000Z"),
      ),
    ).toEqual([
      { availableAt: new Date("2026-08-21T10:00:00.000Z"), offsetMinutes: 1440 },
      { availableAt: new Date("2026-08-22T09:00:00.000Z"), offsetMinutes: 60 },
    ]);
  });

  it("does not backfill reminders whose trigger time has passed", () => {
    expect(
      buildInterviewReminderSchedule(
        new Date("2026-08-20T10:30:00.000Z"),
        new Date("2026-08-20T10:00:00.000Z"),
      ),
    ).toEqual([]);
  });
});

describe("human interview evaluation summary", () => {
  it("formats every completed human round selected by the event query", () => {
    const summary = buildHumanInterviewEvaluationSummary([
      { interviewerNames: ["肥仔"], label: "业务一面", roundNumber: 2 },
      { interviewerNames: ["肥仔", "李四"], label: "业务二面", roundNumber: 3 },
    ]);
    expect(summary).toContain("第 1 轮 AI HR 初面评价");
    expect(summary).toContain("第 2 轮 业务一面评价");
    expect(summary).toContain("第 3 轮 业务二面评价");
    expect(summary).toContain("面试官：肥仔、李四");
    expect(summary).toContain("综合评级：未收集到");
  });
});

describe("interview notification company name", () => {
  it("uses the company name from context settings", () => {
    expect(resolveInterviewNotificationCompanyName("  ACE科技  ", "test")).toBe("ACE科技");
  });

  it("falls back to the workspace name when the context company name is blank", () => {
    expect(resolveInterviewNotificationCompanyName("   ", "test")).toBe("test");
    expect(resolveInterviewNotificationCompanyName(null, "test")).toBe("test");
  });
});

describe("human meeting event links", () => {
  it("links completion summaries to the recruiting record without signing a candidate invite", () => {
    const previousAuthSecret = process.env.BETTER_AUTH_SECRET;
    const previousBaseUrl = process.env.BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_URL = "https://recruiting.example.com";
    try {
      expect(
        resolveHumanMeetingEventInterviewLink({
          candidateInviteExpiresAt: new Date("2026-08-27T10:00:00.000Z"),
          candidateInviteTokenHash: "candidate-token-hash",
          humanRoundId: "round_1",
          interviewRecordId: "record_1",
          meetingId: "meeting_1",
          organizationSlug: "workspace_1",
          type: "human_interview_completed",
        }),
      ).toBe("https://recruiting.example.com/w/workspace_1/studio/resumes/record_1");
    } finally {
      if (previousAuthSecret === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = previousAuthSecret;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBaseUrl;
      }
    }
  });
});
