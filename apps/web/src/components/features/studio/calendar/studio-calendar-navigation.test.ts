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
          candidateAvatarVersion: null,
          candidateName: "张三",
          evaluationConclusion: "none",
          interviewRecordId: "record-ai",
          jobDescriptionId: null,
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
          candidateAvatarVersion: null,
          candidateName: "李四",
          evaluationConclusion: "none",
          interviewRecordId: "record-human",
          jobDescriptionId: null,
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
          candidateAvatarVersion: null,
          candidateName: "王五",
          evaluationConclusion: "none",
          interviewRecordId: "record-hidden",
          jobDescriptionId: null,
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
