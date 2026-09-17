import { describe, expect, it } from "vitest";
import { studioCalendarEventDestination } from "./studio-calendar-navigation";

describe("studioCalendarEventDestination", () => {
  it("opens AI schedules on the AI interview stage", () => {
    expect(
      studioCalendarEventDestination(
        {
          kind: "ai",
        },
        {
          canOpenRecruitingRecord: true,
          candidateName: "张三",
          interviewRecordId: "record-ai",
          roundId: "round-ai",
          roundLabel: "AI 初面",
        },
      ),
    ).toEqual({ kind: "recruiting_record", recordId: "record-ai", tab: "rounds" });
  });

  it("opens human schedules on the human interview stage", () => {
    expect(
      studioCalendarEventDestination(
        {
          kind: "human",
          viewerInterviewerInviteToken: null,
        },
        {
          canOpenRecruitingRecord: true,
          candidateName: "李四",
          interviewRecordId: "record-human",
          roundId: "round-human",
          roundLabel: "技术复面",
        },
      ),
    ).toEqual({
      kind: "recruiting_record",
      recordId: "record-human",
      tab: "human-interview",
    });
  });

  it("opens the assigned interviewer meeting when the recruiting record is outside their scope", () => {
    expect(
      studioCalendarEventDestination(
        { kind: "human", viewerInterviewerInviteToken: "signed-token" },
        {
          canOpenRecruitingRecord: false,
          candidateName: "王五",
          interviewRecordId: "record-hidden",
          roundId: "round-hidden",
          roundLabel: "业务一面",
        },
      ),
    ).toEqual({ inviteToken: "signed-token", kind: "interviewer_meeting" });
  });

  it("does not navigate when an event has no linked candidate", () => {
    expect(
      studioCalendarEventDestination({ kind: "human", viewerInterviewerInviteToken: null }),
    ).toBeNull();
  });
});
