import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  organization,
  user,
  studioInterview,
  studioHumanInterviewRound,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewMeetingInterviewer,
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
  await db.insert(studioInterview).values(
    candidates.map((id) => ({
      candidateName: id,
      createdBy: creatorId,
      id,
      interviewQuestions: [],
      organizationId: orgId,
      pipelineStage: "human_interview" as const,
    })),
  );
  await db.insert(studioHumanInterviewRound).values(
    rounds.map((id, index) => ({
      format: "online" as const,
      id,
      interviewRecordId: index === 0 ? candidates[0] : candidates[1],
      label: `业务${index + 1}面`,
      organizationId: orgId,
      sortOrder: index,
    })),
  );
  await db.insert(studioHumanInterviewMeeting).values({
    id: meetingId,
    organizationId: orgId,
    status: "ended",
    title: "Review scope fixture",
  });
  await db
    .insert(studioHumanInterviewMeetingRound)
    .values(rounds.map((roundId) => ({ meetingId, roundId })));
  await db
    .insert(studioHumanInterviewMeetingInterviewer)
    .values({ meetingId, role: "host", userId: reviewerId });
});
afterAll(cleanup);

describe("authenticated review database scope", () => {
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
