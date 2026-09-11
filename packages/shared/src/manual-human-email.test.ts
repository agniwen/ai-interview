import { expect, it } from "vitest";
import {
  availableManualHumanEmails,
  isConfirmedManualHumanEmail,
  manualHumanEmailBlockedReason,
} from "./manual-human-email";

const valid = {
  candidateStatus: "pending",
  expiresAt: new Date("2026-09-21"),
  hasCurrentReschedule: false,
  hasValidLink: true,
  meetingStatus: "scheduled",
  now: new Date("2026-09-10"),
  roundStatus: "pending",
  scheduledAt: new Date("2026-09-20"),
  startedAt: null,
  validUntil: new Date("2026-09-20T01:00:00Z"),
};
it("offers invitation before acceptance, confirmation and reminder after acceptance", () => {
  expect(availableManualHumanEmails(valid)).toEqual(["human_candidate_invitation_requested"]);
  expect(availableManualHumanEmails({ ...valid, candidateStatus: "accepted" })).toEqual([
    "human_interview_confirmed",
    "human_interview_reminder",
  ]);
});
it("requires a recorded current schedule change for rescheduling", () => {
  expect(availableManualHumanEmails({ ...valid, hasCurrentReschedule: true })[0]).toBe(
    "human_interview_rescheduled",
  );
  expect(availableManualHumanEmails(valid)).not.toContain("human_interview_rescheduled");
});
it.each([
  { candidateStatus: "declined" },
  { candidateStatus: "expired" },
  { hasValidLink: false },
  { roundStatus: "completed" },
  { meetingStatus: "ended" },
  { meetingStatus: "in_progress" },
  { scheduledAt: null },
  { validUntil: new Date("2026-09-09") },
  { validUntil: null },
  { startedAt: new Date("2026-09-10") },
  { expiresAt: new Date("2026-09-09") },
])("blocks invalid state: %o", (change) => {
  expect(availableManualHumanEmails({ ...valid, ...change })).toEqual([]);
});
it("cancelled historical rounds allow cancellation only even without a valid link", () => {
  expect(
    availableManualHumanEmails({ ...valid, hasValidLink: false, roundStatus: "cancelled" }),
  ).toEqual(["human_interview_cancelled"]);
});

it.each(["pending", "sent", "accepted"])(
  "allows %s after scheduled start while the meeting has not actually started",
  (candidateStatus) => {
    const context = { ...valid, candidateStatus, now: new Date("2026-09-20T00:00:19Z") };
    expect(availableManualHumanEmails(context)).toEqual([
      candidateStatus === "accepted"
        ? "human_interview_confirmed"
        : "human_candidate_invitation_requested",
    ]);
    expect(manualHumanEmailBlockedReason(context)).toBeNull();
  },
);
it("allows at exact start but blocks at exact end with a specific reason", () => {
  expect(availableManualHumanEmails({ ...valid, now: valid.scheduledAt })).toEqual([
    "human_candidate_invitation_requested",
  ]);
  const ended = { ...valid, now: valid.validUntil };
  expect(availableManualHumanEmails(ended)).toEqual([]);
  expect(manualHumanEmailBlockedReason(ended)).toContain("结束时间");
  expect(manualHumanEmailBlockedReason({ ...valid, startedAt: valid.now })).toContain("实际开始");
  expect(manualHumanEmailBlockedReason({ ...valid, candidateStatus: "declined" })).toContain(
    "已拒绝",
  );
});

const manual = {
  confirmedAt: "2026-09-10T00:00:00.000Z",
  confirmedBy: "hr",
  eventType: "human_interview_cancelled",
  meetingId: "meeting",
  organizationId: "org",
  recipient: "candidate@example.com",
  requestId: "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf6",
  roundId: "round",
  subject: "取消通知",
  text: "已取消",
  version: 1,
};
const event = {
  actorUserId: "hr",
  humanMeetingId: "meeting",
  humanRoundId: "round",
  organizationId: "org",
  payloadSnapshot: { manualHumanEmail: manual, schemaVersion: 1, timeZone: "Asia/Shanghai" },
  type: manual.eventType,
};
const delivery = {
  audienceType: "candidate",
  channel: "email",
  recipientAddress: manual.recipient,
  renderedContent: manual.text,
  renderedSubject: manual.subject,
};
it("only accepts complete matching manual authorization", () => {
  expect(isConfirmedManualHumanEmail(event, delivery)).toBe(true);
  expect(isConfirmedManualHumanEmail({ ...event, payloadSnapshot: {} }, delivery)).toBe(false);
});
it.each([
  { actorUserId: "other" },
  { organizationId: "other" },
  { humanMeetingId: "other" },
  { humanRoundId: "other" },
  { type: "human_interview_reminder" },
])("rejects mismatched event %o", (change) => {
  expect(isConfirmedManualHumanEmail({ ...event, ...change }, delivery)).toBe(false);
});
it.each([
  { recipientAddress: "other@example.com" },
  { channel: "feishu" },
  { audienceType: "meeting_interviewer" },
  { renderedContent: "changed" },
  { renderedSubject: "changed" },
])("rejects mismatched delivery %o", (change) => {
  expect(isConfirmedManualHumanEmail(event, { ...delivery, ...change })).toBe(false);
});
