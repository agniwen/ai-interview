import { createRecruitingRecords } from "@app/database/recruiting-records";
import { createHumanInterviewEvaluationDao } from "@app/meeting-processing/human-interview";
import {
  meetingSession,
  meetingTranscriptRevision,
  organization,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";

const id = `evaluation-draft-${crypto.randomUUID()}`;
const oldRevision = `${id}-old`;
const newRevision = `${id}-new`;
const evaluation = {
  detailedAnalysis: "基于原始转录确认",
  evidenceTurnIds: [],
  overallEvaluation: "确认通过",
  professionalSkill: "良",
  rating: "B" as const,
  risks: "待核实",
  rolePosition: "执行者",
  salaryRecommendation: "",
  seniorityPosition: "高级",
  strengths: "沟通清晰",
};

beforeAll(async () => {
  await db
    .insert(user)
    .values({ email: `${id}@example.com`, emailVerified: false, id, name: "测试面试官" });
  await db
    .insert(organization)
    .values({ createdAt: new Date(), id, name: "并发评价测试", slug: id });
  await createRecruitingRecords(db, {
    candidateName: "测试候选人",
    createdBy: id,
    id,
    interviewQuestions: [],
    organizationId: id,
  });
  await db.insert(humanInterviewRound).values({
    format: "online",
    id,
    label: "一面",
    organizationId: id,
    recruitingRecordId: id,
    roundKind: "second_interview",
  });
  await db.insert(meetingSession).values({
    id,
    manifestSha256: "a".repeat(64),
    organizationId: id,
    ownerId: id,
    savedAt: new Date(),
    startedAt: new Date(),
    status: "ready",
    title: "并发提交测试",
    transcriptionStatus: "ready",
  });
  await db.insert(meetingTranscriptRevision).values(
    [oldRevision, newRevision].map((revisionId, index) => ({
      id: revisionId,
      kind: "human" as const,
      meetingId: id,
      model: "manual",
      organizationId: id,
      pipelineVersion: "human-v1",
      provider: "human",
      region: "local",
      revision: index + 1,
      sourceManifestSha256: "a".repeat(64),
    })),
  );
  await db
    .update(meetingSession)
    .set({ activeTranscriptRevisionId: oldRevision })
    .where(eq(meetingSession.id, id));
  await db.insert(humanInterviewMeeting).values({
    id,
    organizationId: id,
    processingMeetingSessionId: id,
    status: "ended",
    title: "并发提交测试",
  });
  await db
    .insert(humanInterviewMeetingRound)
    .values({ meetingId: id, organizationId: id, roundId: id });
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, id));
  await db.delete(user).where(eq(user.id, id));
});

it("publishes an unrated AI draft and preserves it in the review and snapshot", async () => {
  const dao = createHumanInterviewEvaluationDao(db, {
    enqueueHumanInterviewRoundCompletion: () => Promise.resolve(),
    loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
  });
  await db
    .update(humanInterviewRound)
    .set({ evaluationStatus: "generating", evaluationTranscriptRevisionId: oldRevision })
    .where(eq(humanInterviewRound.id, id));
  const draft = { ...evaluation, professionalSkill: "-", rating: null, risks: "-" };
  expect(
    await dao.publishHumanInterviewEvaluation({
      evaluation: draft,
      meetingSessionId: id,
      organizationId: id,
      roundId: id,
      transcriptRevisionId: oldRevision,
    }),
  ).toBe(true);
  const review = await dao.loadHumanInterviewReview({
    meetingId: id,
    organizationId: id,
    roundId: id,
  });
  expect(review).toMatchObject({ evaluation: draft, evaluationStatus: "draft" });
  expect(
    await dao.listHumanInterviewEvaluationSnapshotsForAnalysis({ organizationId: id, roundId: id }),
  ).toMatchObject([{ evaluation: draft, source: "ai_generated" }]);
  await db
    .update(humanInterviewRound)
    .set({ evaluationStatus: "generating" })
    .where(eq(humanInterviewRound.id, id));
  const error =
    "AI 评价未通过证据复核。\n第 1 次复核：risks 无可靠证据\n第 2 次复核：评级依据仍不足";
  await dao.markHumanInterviewEvaluationFailed({
    error,
    roundId: id,
    transcriptRevisionId: oldRevision,
  });
  expect(
    await dao.loadHumanInterviewReview({ meetingId: id, organizationId: id, roundId: id }),
  ).toMatchObject({ evaluationError: error, evaluationStatus: "failed" });
});
