import { createRecruitingRecords } from "@app/database/recruiting-records";
import {
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  organization,
  user,
} from "@app/db-schema/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../lib/server/db";
import { listStudioCalendarEvents } from "./dao";

const prefix = "calendar_visibility_test_";
const organizationId = `${prefix}org`;
const creatorUserId = `${prefix}creator`;
const interviewerUserId = `${prefix}interviewer`;
const unrelatedUserId = `${prefix}unrelated`;
const candidateId = `${prefix}candidate`;
const roundId = `${prefix}round`;
const meetingId = `${prefix}meeting`;
const scheduledAt = new Date("2026-09-20T02:00:00.000Z");
const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;

if (
  testUrl &&
  (testUrl !== process.env.DATABASE_URL || !new URL(testUrl).pathname.includes("_test_"))
) {
  throw new Error("日程可见性测试仅可在隔离库执行");
}

async function cleanup() {
  await db.delete(organization).where(eq(organization.id, organizationId));
  await db
    .delete(user)
    .where(inArray(user.id, [creatorUserId, interviewerUserId, unrelatedUserId]));
}

describe.skipIf(!testUrl)("listStudioCalendarEvents visibility", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values(
      [creatorUserId, interviewerUserId, unrelatedUserId].map((id) => ({
        createdAt: scheduledAt,
        email: `${id}@example.test`,
        emailVerified: false,
        id,
        name: id,
        updatedAt: scheduledAt,
      })),
    );
    await db.insert(organization).values({
      createdAt: scheduledAt,
      id: organizationId,
      name: organizationId,
      slug: organizationId,
    });
    await createRecruitingRecords(db, {
      candidateName: "受邀候选人",
      createdBy: creatorUserId,
      id: candidateId,
      interviewQuestions: [],
      organizationId,
    });
    await db.insert(humanInterviewRound).values({
      format: "online",
      id: roundId,
      label: "业务一面",
      meetingUrl: "https://meeting.example.test/interview",
      organizationId,
      recruitingRecordId: candidateId,
      roundKind: "second_interview",
      scheduledAt,
    });
    await db.insert(humanInterviewMeeting).values({
      id: meetingId,
      organizationId,
      scheduledAt,
      title: "业务一面",
    });
    await db.insert(humanInterviewMeetingRound).values({ meetingId, organizationId, roundId });
    await db.insert(humanInterviewMeetingInterviewer).values({
      meetingId,
      organizationId,
      userId: interviewerUserId,
    });
    await db.insert(humanInterviewRoundInterviewer).values({
      organizationId,
      roundId,
      status: "confirmed",
      userId: interviewerUserId,
    });
  });

  afterAll(cleanup);

  const range = {
    end: new Date("2026-10-01T00:00:00.000Z"),
    organizationId,
    start: new Date("2026-09-01T00:00:00.000Z"),
  };

  it("includes a meeting assigned to the signed-in interviewer", async () => {
    const events = await listStudioCalendarEvents({
      ...range,
      viewerUserId: interviewerUserId,
      visibilityScope: { kind: "restricted", userIds: [interviewerUserId] },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      candidates: [
        expect.objectContaining({
          canOpenRecruitingRecord: false,
          interviewRecordId: candidateId,
        }),
      ],
      id: meetingId,
      interviewers: [{ id: interviewerUserId, name: interviewerUserId }],
      kind: "human",
      viewerInterviewerInviteToken: expect.any(String),
    });
  });

  it("does not expose the meeting to an unrelated member", async () => {
    await expect(
      listStudioCalendarEvents({
        ...range,
        viewerUserId: unrelatedUserId,
        visibilityScope: { kind: "restricted", userIds: [unrelatedUserId] },
      }),
    ).resolves.toEqual([]);
  });
});
