import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  organization,
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  user,
} from "@app/db-schema/schema";
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
    .delete(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.organizationId, ORG_ID));
  await db
    .delete(recruitingNotificationEvent)
    .where(eq(recruitingNotificationEvent.organizationId, ORG_ID));
  await db.delete(humanInterviewMeeting).where(eq(humanInterviewMeeting.organizationId, ORG_ID));
  await db.delete(humanInterviewRound).where(eq(humanInterviewRound.organizationId, ORG_ID));
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORG_ID));
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
  await createRecruitingRecords(db, {
    candidateEmail: "assignment-candidate@example.com",
    candidateName: "候选人",
    id: CANDIDATE_ID,
    organizationId: ORG_ID,
  });
  await db.insert(humanInterviewRound).values({
    format: "online",
    id: ROUND_ID,
    label: "技术复面",
    organizationId: ORG_ID,
    recruitingRecordId: CANDIDATE_ID,
    roundKind: "second_interview",
    scheduledAt: START_TIME,
  });
  await db.insert(humanInterviewMeeting).values({
    id: MEETING_ID,
    organizationId: ORG_ID,
    scheduledAt: START_TIME,
    title: "候选人 - 技术复面",
    validUntil: new Date("2026-09-30T07:00:00.000Z"),
  });
  await db.insert(humanInterviewMeetingRound).values({
    candidateInviteStatus: "accepted",
    candidateRespondedAt: new Date("2026-08-24T06:00:00.000Z"),
    invitationVersion: 1,
    meetingId: MEETING_ID,
    organizationId: ORG_ID,
    roundId: ROUND_ID,
  });
  await db.insert(humanInterviewMeetingInterviewer).values([
    { meetingId: MEETING_ID, organizationId: ORG_ID, role: "host", userId: INTERVIEWER_A_ID },
    {
      meetingId: MEETING_ID,
      organizationId: ORG_ID,
      role: "interviewer",
      userId: INTERVIEWER_B_ID,
    },
  ]);
  await db.insert(humanInterviewRoundInterviewer).values([
    { organizationId: ORG_ID, roundId: ROUND_ID, userId: INTERVIEWER_A_ID },
    { organizationId: ORG_ID, roundId: ROUND_ID, userId: INTERVIEWER_B_ID },
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

    const expiresAt = new Date("2026-09-29T06:00:00.000Z");
    const inviteToken = buildCandidateInviteToken({
      exp: expiresAt.getTime(),
      meetingId: MEETING_ID,
      roundId: ROUND_ID,
    });
    await db
      .update(humanInterviewMeetingRound)
      .set({
        candidateInviteExpiresAt: expiresAt,
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: hashInviteToken(inviteToken),
        candidateRespondedAt: null,
      })
      .where(eq(humanInterviewMeetingRound.meetingId, MEETING_ID));

    await respondHumanInterviewCandidateInvitation({ action: "accept", inviteToken });
    const events = await db
      .select({ type: recruitingNotificationEvent.type })
      .from(recruitingNotificationEvent)
      .where(eq(recruitingNotificationEvent.humanMeetingId, MEETING_ID));

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
    await db.delete(humanInterviewMeeting).where(eq(humanInterviewMeeting.id, MEETING_ID));
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
      .select({ type: recruitingNotificationEvent.type })
      .from(recruitingNotificationEvent)
      .where(eq(recruitingNotificationEvent.humanMeetingId, created.id));
    expect(events).toEqual([{ type: "human_candidate_invitation_requested" }]);
    const assignments = await db
      .select({
        confirmedScheduleVersion: humanInterviewRoundInterviewer.confirmedScheduleVersion,
        status: humanInterviewRoundInterviewer.status,
      })
      .from(humanInterviewRoundInterviewer)
      .where(eq(humanInterviewRoundInterviewer.roundId, ROUND_ID));
    expect(assignments).toEqual([
      { confirmedScheduleVersion: 1, status: "confirmed" },
      { confirmedScheduleVersion: 1, status: "confirmed" },
    ]);
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "false";
  });

  it("creates reminders immediately after candidate acceptance", async () => {
    const expiresAt = new Date("2026-09-29T06:00:00.000Z");
    const inviteToken = buildCandidateInviteToken({
      exp: expiresAt.getTime(),
      meetingId: MEETING_ID,
      roundId: ROUND_ID,
    });
    await db
      .update(humanInterviewMeetingRound)
      .set({
        candidateInviteExpiresAt: expiresAt,
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: hashInviteToken(inviteToken),
        candidateRespondedAt: null,
      })
      .where(eq(humanInterviewMeetingRound.meetingId, MEETING_ID));

    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";
    await respondHumanInterviewCandidateInvitation({ action: "accept", inviteToken });

    const formalEvents = await db
      .select({ type: recruitingNotificationEvent.type })
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.humanMeetingId, MEETING_ID),
          eq(recruitingNotificationEvent.type, "human_interview_confirmed"),
        ),
      );
    expect(formalEvents).toHaveLength(1);
    const interviewerConfirmationEvents = await db
      .select({ type: recruitingNotificationEvent.type })
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.humanMeetingId, MEETING_ID),
          eq(recruitingNotificationEvent.type, "human_interviewer_confirmation_requested"),
        ),
      );
    expect(interviewerConfirmationEvents).toHaveLength(0);
    const reminderEvents = await db
      .select({ type: recruitingNotificationEvent.type })
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.humanMeetingId, MEETING_ID),
          eq(recruitingNotificationEvent.type, "human_interview_reminder"),
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
      .update(humanInterviewMeetingRound)
      .set({
        candidateInviteExpiresAt: expiresAt,
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: hashInviteToken(inviteToken),
        candidateRespondedAt: null,
      })
      .where(eq(humanInterviewMeetingRound.meetingId, MEETING_ID));

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
      .select({ payload: recruitingNotificationEvent.payloadSnapshot })
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.humanMeetingId, MEETING_ID),
          eq(recruitingNotificationEvent.type, "human_invitation_exception"),
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
      .select({ id: recruitingNotificationEvent.id })
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.humanMeetingId, MEETING_ID),
          eq(recruitingNotificationEvent.type, "human_invitation_exception"),
        ),
      );
    expect(events).toHaveLength(0);
  });
});
