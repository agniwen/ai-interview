import { createRecruitingRecords } from "@app/database/recruiting-records";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  department,
  recruitingNotificationEvent,
  jobDescription,
  organization,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
} from "@app/db-schema/schema";
import { db } from "../../../lib/server/db/index";
import { enqueueHumanMeetingEvents } from "./events";

const id = `notification-job-${crypto.randomUUID()}`;

beforeAll(async () => {
  await db.insert(organization).values({ createdAt: new Date(), id, name: "测试", slug: id });
  await db.insert(department).values({ id, name: "研发", organizationId: id });
  await db.insert(jobDescription).values({
    departmentId: id,
    id,
    name: "【测试2】前端技术经理",
    organizationId: id,
    prompt: "岗位 JD",
  });
  await createRecruitingRecords(db, {
    candidateName: "测试候选人",
    id,
    interviewQuestions: [],
    jobDescriptionId: id,
    organizationId: id,
    targetRole: "前端开发",
  });
  await db.insert(humanInterviewRound).values({
    format: "online",
    id,
    label: "业务二面",
    organizationId: id,
    outcome: "pass",
    recruitingRecordId: id,
    roundKind: "second_interview",
    status: "completed",
  });
  await db.insert(humanInterviewMeeting).values({ id, organizationId: id, title: "测试" });
  await db
    .insert(humanInterviewMeetingRound)
    .values({ meetingId: id, organizationId: id, roundId: id });
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, id));
});

describe("notification job context", () => {
  it("freezes the associated job name instead of the resume target role", async () => {
    const input = {
      actorUserId: null,
      meetingId: id,
      scheduleVersion: 1,
      type: "human_interview_completed" as const,
    };
    await db.transaction((tx) => enqueueHumanMeetingEvents(tx, input));
    const readEvents = () =>
      db
        .select()
        .from(recruitingNotificationEvent)
        .where(eq(recruitingNotificationEvent.organizationId, id));
    const created = await readEvents();
    expect(created[0]?.payloadSnapshot.jobName).toBe("【测试2】前端技术经理");

    await db
      .update(jobDescription)
      .set({ name: "后续修改的岗位名" })
      .where(eq(jobDescription.id, id));
    await db.transaction((tx) => enqueueHumanMeetingEvents(tx, input));
    const retried = await readEvents();
    expect(retried).toHaveLength(1);
    expect(retried[0]?.payloadSnapshot.jobName).toBe("【测试2】前端技术经理");
  });
});
