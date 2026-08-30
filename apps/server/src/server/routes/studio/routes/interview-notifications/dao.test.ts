import { describe, expect, it } from "vitest";
import { validateInterviewNotificationEventInput } from "./dao";

describe("interview notification event input", () => {
  it("accepts a versioned human meeting event", () => {
    expect(
      validateInterviewNotificationEventInput({
        dedupeKey: "human_interview_rescheduled:meeting_1:2",
        humanMeetingId: "meeting_1",
        organizationId: "org_1",
        payloadSnapshot: {
          candidateName: "候选人",
          schemaVersion: 1,
          timeZone: "Asia/Shanghai",
        },
        scopeType: "human_meeting",
        type: "human_interview_rescheduled",
      }),
    ).toMatchObject({
      humanMeetingId: "meeting_1",
      scopeType: "human_meeting",
      type: "human_interview_rescheduled",
    });
  });

  it("requires the entity id for each scope", () => {
    expect(() =>
      validateInterviewNotificationEventInput({
        dedupeKey: "ai_report_ready:round_1:1",
        organizationId: "org_1",
        payloadSnapshot: {
          schemaVersion: 1,
          timeZone: "Asia/Shanghai",
        },
        scopeType: "ai_round",
        type: "ai_report_ready",
      }),
    ).toThrow("通知作用域 ai_round 缺少对应实体 ID");
  });

  it("rejects unversioned payload snapshots", () => {
    // SAFETY: This intentionally invalid payload verifies runtime schema rejection.
    expect(() =>
      validateInterviewNotificationEventInput({
        dedupeKey: "ai_report_ready:round_1:1",
        organizationId: "org_1",
        payloadSnapshot: {
          schemaVersion: 2,
          timeZone: "Asia/Shanghai",
        } as never,
        scheduleEntryId: "round_1",
        scopeType: "ai_round",
        type: "ai_report_ready",
      }),
    ).toThrow();
  });
});
