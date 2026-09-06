import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  organization,
  user,
  humanInterviewRound,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewMeetingInterviewer,
} from "@app/db-schema/schema";
import { db } from "../../../../../../../lib/server/db";
import { loadStudioHumanInterviewReviewScope } from "../human-interview-review-access";

const orgId = "review_access_test_org";
const creatorId = "review_access_test_creator";
const reviewerId = "review_access_test_reviewer";
const meetingId = "review_access_test_meeting";
const candidates = ["review_access_test_candidate_a", "review_access_test_candidate_b"] as const;
const rounds = ["review_access_test_round_a", "review_access_test_round_b"] as const;
const now = new Date("2026-09-03T03:00:00Z");
const input = {
  candidateId: candidates[1],
  organizationId: orgId,
  roundId: rounds[1],
  userId: reviewerId,
  visibility: { kind: "all" as const },
};

async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, orgId));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(inArray(user.id, [creatorId, reviewerId]));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values(
    [creatorId, reviewerId].map((id) => ({
      createdAt: now,
      email: `${id}@example.test`,
      emailVerified: false,
      id,
      name: id,
      updatedAt: now,
    })),
  );
  await db.insert(organization).values({ createdAt: now, id: orgId, name: orgId, slug: orgId });
  await createRecruitingRecords(
    db,
    candidates.map((id) => ({
      candidateName: id,
      createdBy: creatorId,
      id,
      interviewQuestions: [],
      organizationId: orgId,
      pipelineStage: "second_interview" as const,
    })),
  );
  await db.insert(humanInterviewRound).values(
    rounds.map((id, index) => ({
      format: "online" as const,
      id,
      label: `业务${index + 1}面`,
      organizationId: orgId,
      recruitingRecordId: index === 0 ? candidates[0] : candidates[1],
      roundKind: "second_interview" as const,
      sortOrder: index,
    })),
  );
  await db.insert(humanInterviewMeeting).values({
    createdAt: now,
    id: meetingId,
    organizationId: orgId,
    status: "ended",
    title: "Review scope fixture",
  });
  await db
    .insert(humanInterviewMeetingRound)
    .values(rounds.map((roundId) => ({ meetingId, organizationId: orgId, roundId })));
  await db
    .insert(humanInterviewMeetingInterviewer)
    .values({ meetingId, organizationId: orgId, role: "host", userId: reviewerId });
});
afterAll(cleanup);

describe("authenticated review database scope", () => {
  it("keeps the evaluation linked to the non-cancelled meeting when a newer attempt was cancelled", async () => {
    const cancelledId = "review_access_test_cancelled";
    await db.insert(humanInterviewMeeting).values({
      createdAt: new Date(now.getTime() + 1000),
      id: cancelledId,
      organizationId: orgId,
      status: "cancelled",
      title: "Cancelled replacement",
    });
    await db
      .insert(humanInterviewMeetingRound)
      .values({ meetingId: cancelledId, organizationId: orgId, roundId: rounds[1] });
    try {
      const scope = await loadStudioHumanInterviewReviewScope(input);
      expect(scope).toMatchObject({ meetingId, roundId: rounds[1] });
    } finally {
      await db.delete(humanInterviewMeeting).where(eq(humanInterviewMeeting.id, cancelledId));
    }
  });
  it("returns the requested candidate and round, not the first round linked to a meeting", async () => {
    const scope = await loadStudioHumanInterviewReviewScope(input);
    expect(scope).toMatchObject({
      candidateName: candidates[1],
      meetingId,
      roundId: rounds[1],
      userId: reviewerId,
    });
  });
  it("rejects another candidate, workspace, or unassigned actor", async () => {
    expect(
      await loadStudioHumanInterviewReviewScope({ ...input, candidateId: candidates[0] }),
    ).toBeNull();
    expect(
      await loadStudioHumanInterviewReviewScope({ ...input, organizationId: "other_org" }),
    ).toBeNull();
    expect(await loadStudioHumanInterviewReviewScope({ ...input, userId: creatorId })).toBeNull();
  });
  it("enforces recruiting visibility before exposing the evaluation", async () => {
    expect(
      await loadStudioHumanInterviewReviewScope({ ...input, visibility: { kind: "none" } }),
    ).toBeNull();
    expect(
      await loadStudioHumanInterviewReviewScope({
        ...input,
        visibility: { kind: "restricted", userIds: [] },
      }),
    ).toBeNull();
    expect(
      await loadStudioHumanInterviewReviewScope({
        ...input,
        visibility: { kind: "restricted", userIds: [reviewerId] },
      }),
    ).toBeNull();
    expect(
      await loadStudioHumanInterviewReviewScope({
        ...input,
        visibility: { kind: "restricted", userIds: [creatorId] },
      }),
    ).toMatchObject({ roundId: rounds[1] });
  });
});
