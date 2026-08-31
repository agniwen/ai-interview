import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@app/server/lib/server/db";
import {
  interviewNotificationEvent,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import {
  recordHumanInterviewInvitationException,
  respondHumanInterviewCandidateInvitation,
} from "./human-interview-candidate-response";
import { buildCandidateInviteToken, hashInviteToken } from "./human-interview-meeting-access";
import { createHumanInterviewMeeting } from "./human-interview-meetings";

const CANDIDATE_ID = "test_assignment_candidate";
const INTERVIEWER_A_ID = "test_assignment_interviewer_a";
const INTERVIEWER_B_ID = "test_assignment_interviewer_b";
const MEETING_ID = "test_assignment_meeting";
const ORG_ID = "test_assignment_org";
const ROUND_ID = "test_assignment_round";
const START_TIME = new Date("2026-09-30T06:00:00.000Z");

async function cleanup() {
  await db
    .delete(interviewNotificationEvent)
    .where(eq(interviewNotificationEvent.organizationId, ORG_ID));
  await db
    .delete(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.organizationId, ORG_ID));
  await db
    .delete(studioHumanInterviewRound)
    .where(eq(studioHumanInterviewRound.organizationId, ORG_ID));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, INTERVIEWER_A_ID));
  await db.delete(user).where(eq(user.id, INTERVIEWER_B_ID));
}

async function seedScenario() {
  await db.insert(user).values([
    {
      email: "assignment-interviewer-a@example.com",
      emailVerified: true,
      id: INTERVIEWER_A_ID,
      name: "面试官 A",
    },
    {
      email: "assignment-interviewer-b@example.com",
      emailVerified: true,
      id: INTERVIEWER_B_ID,
      name: "面试官 B",
    },
  ]);
  await db.insert(organization).values({ id: ORG_ID, name: "指派状态测试", slug: ORG_ID });
  await db.insert(studioInterview).values({
    candidateEmail: "assignment-candidate@example.com",
    candidateName: "候选人",
    id: CANDIDATE_ID,
    organizationId: ORG_ID,
  });
  await db.insert(studioHumanInterviewRound).values({
    format: "online",
    id: ROUND_ID,
    interviewRecordId: CANDIDATE_ID,
    label: "技术复面",
    organizationId: ORG_ID,
    scheduledAt: START_TIME,
  });
  await db.insert(studioHumanInterviewMeeting).values({
    id: MEETING_ID,
    organizationId: ORG_ID,
    scheduledAt: START_TIME,
    title: "候选人 - 技术复面",
    validUntil: new Date("2026-09-30T07:00:00.000Z"),
  });
  await db.insert(studioHumanInterviewMeetingRound).values({
    candidateInviteStatus: "accepted",
    candidateRespondedAt: new Date("2026-08-24T06:00:00.000Z"),
    invitationVersion: 1,
    meetingId: MEETING_ID,
    roundId: ROUND_ID,
  });
  await db.insert(studioHumanInterviewMeetingInterviewer).values([
    { meetingId: MEETING_ID, role: "host", userId: INTERVIEWER_A_ID },
    { meetingId: MEETING_ID, role: "interviewer", userId: INTERVIEWER_B_ID },
  ]);
  await db.insert(studioHumanInterviewRoundInterviewer).values([
    { roundId: ROUND_ID, userId: INTERVIEWER_A_ID },
    { roundId: ROUND_ID, userId: INTERVIEWER_B_ID },
  ]);
}

describe("human interviewer assignment state", () => {
  const previousNotificationFlag = process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
  const previousAuthSecret = process.env.BETTER_AUTH_SECRET;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    process.env.BETTER_AUTH_SECRET = "test-only-human-assignment-secret";
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "false";
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await seedScenario();
  });

  afterAll(async () => {
    await cleanup();
    vi.useRealTimers();
    if (previousNotificationFlag === undefined) {
      delete process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
    } else {
      process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = previousNotificationFlag;
    }
    if (previousAuthSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = previousAuthSecret;
    }
  });

  it("does not require interviewer responses for formal confirmation", async () => {
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";

    const expiresAt = new Date("2026-08-30T06:00:00.000Z");
    const inviteToken = buildCandidateInviteToken({
      exp: expiresAt.getTime(),
      meetingId: MEETING_ID,
      roundId: ROUND_ID,
    });
    await db
      .update(studioHumanInterviewMeetingRound)
      .set({
        candidateInviteExpiresAt: expiresAt,
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: hashInviteToken(inviteToken),
        candidateRespondedAt: null,
      })
      .where(eq(studioHumanInterviewMeetingRound.meetingId, MEETING_ID));

    await respondHumanInterviewCandidateInvitation({ action: "accept", inviteToken });
    const events = await db
      .select({ type: interviewNotificationEvent.type })
      .from(interviewNotificationEvent)
      .where(eq(interviewNotificationEvent.humanMeetingId, MEETING_ID));

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "human_invitation_accepted" },
        { type: "human_interview_confirmed" },
      ]),
    );
    expect(events).not.toContainEqual({ type: "human_interviewer_confirmation_requested" });
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "false";
  });

  it("notifies only the candidate when HR first creates the meeting", async () => {
    await db
      .delete(studioHumanInterviewMeeting)
      .where(eq(studioHumanInterviewMeeting.id, MEETING_ID));
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";

    const created = await createHumanInterviewMeeting({
      createdBy: INTERVIEWER_A_ID,
      input: {
        notes: null,
        roundIds: [ROUND_ID],
        scheduledAt: START_TIME.toISOString(),
        title: "候选人 - 技术复面",
        validUntil: new Date("2026-09-30T07:00:00.000Z").toISOString(),
      },
      organizationId: ORG_ID,
    });

    const events = await db
      .select({ type: interviewNotificationEvent.type })
      .from(interviewNotificationEvent)
      .where(eq(interviewNotificationEvent.humanMeetingId, created.id));
    expect(events).toEqual([{ type: "human_candidate_invitation_requested" }]);
    const assignments = await db
      .select({
        confirmedScheduleVersion: studioHumanInterviewRoundInterviewer.confirmedScheduleVersion,
        status: studioHumanInterviewRoundInterviewer.status,
      })
      .from(studioHumanInterviewRoundInterviewer)
      .where(eq(studioHumanInterviewRoundInterviewer.roundId, ROUND_ID));
    expect(assignments).toEqual([
      { confirmedScheduleVersion: 1, status: "confirmed" },
      { confirmedScheduleVersion: 1, status: "confirmed" },
    ]);
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "false";
  });

  it("creates reminders immediately after candidate acceptance", async () => {
    const expiresAt = new Date("2026-08-30T06:00:00.000Z");
    const inviteToken = buildCandidateInviteToken({
      exp: expiresAt.getTime(),
      meetingId: MEETING_ID,
      roundId: ROUND_ID,
    });
    await db
      .update(studioHumanInterviewMeetingRound)
      .set({
        candidateInviteExpiresAt: expiresAt,
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: hashInviteToken(inviteToken),
        candidateRespondedAt: null,
      })
      .where(eq(studioHumanInterviewMeetingRound.meetingId, MEETING_ID));

    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";
    await respondHumanInterviewCandidateInvitation({ action: "accept", inviteToken });

    const formalEvents = await db
      .select({ type: interviewNotificationEvent.type })
      .from(interviewNotificationEvent)
      .where(
        and(
          eq(interviewNotificationEvent.humanMeetingId, MEETING_ID),
          eq(interviewNotificationEvent.type, "human_interview_confirmed"),
        ),
      );
    expect(formalEvents).toHaveLength(1);
    const interviewerConfirmationEvents = await db
      .select({ type: interviewNotificationEvent.type })
      .from(interviewNotificationEvent)
      .where(
        and(
          eq(interviewNotificationEvent.humanMeetingId, MEETING_ID),
          eq(interviewNotificationEvent.type, "human_interviewer_confirmation_requested"),
        ),
      );
    expect(interviewerConfirmationEvents).toHaveLength(0);
    const reminderEvents = await db
      .select({ type: interviewNotificationEvent.type })
      .from(interviewNotificationEvent)
      .where(
        and(
          eq(interviewNotificationEvent.humanMeetingId, MEETING_ID),
          eq(interviewNotificationEvent.type, "human_interview_reminder"),
        ),
      );
    expect(reminderEvents).toHaveLength(2);
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "false";
  });

  it("records a signed expired candidate invitation as an actionable exception", async () => {
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";
    const expiresAt = new Date("2026-08-24T06:00:00.000Z");
    const inviteToken = buildCandidateInviteToken({
      exp: expiresAt.getTime(),
      meetingId: MEETING_ID,
      roundId: ROUND_ID,
    });
    await db
      .update(studioHumanInterviewMeetingRound)
      .set({
        candidateInviteExpiresAt: expiresAt,
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: hashInviteToken(inviteToken),
        candidateRespondedAt: null,
      })
      .where(eq(studioHumanInterviewMeetingRound.meetingId, MEETING_ID));

    await expect(
      respondHumanInterviewCandidateInvitation({ action: "accept", inviteToken }),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      recordHumanInterviewInvitationException({
        exceptionType: "invitation_expired",
        inviteToken,
      }),
    ).resolves.toBe(true);

    const [event] = await db
      .select({ payload: interviewNotificationEvent.payloadSnapshot })
      .from(interviewNotificationEvent)
      .where(
        and(
          eq(interviewNotificationEvent.humanMeetingId, MEETING_ID),
          eq(interviewNotificationEvent.type, "human_invitation_exception"),
        ),
      );
    expect(event?.payload).toMatchObject({
      exceptionType: "邀请已过期",
      suggestedAction: expect.stringContaining("重新发起"),
    });
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "false";
  });

  it("does not record invitation exception events while notifications are disabled", async () => {
    const inviteToken = buildCandidateInviteToken({
      exp: new Date("2026-08-24T06:00:00.000Z").getTime(),
      meetingId: MEETING_ID,
      roundId: ROUND_ID,
    });

    await expect(
      recordHumanInterviewInvitationException({
        exceptionType: "invitation_expired",
        inviteToken,
      }),
    ).resolves.toBe(false);

    const events = await db
      .select({ id: interviewNotificationEvent.id })
      .from(interviewNotificationEvent)
      .where(
        and(
          eq(interviewNotificationEvent.humanMeetingId, MEETING_ID),
          eq(interviewNotificationEvent.type, "human_invitation_exception"),
        ),
      );
    expect(events).toHaveLength(0);
  });
});
