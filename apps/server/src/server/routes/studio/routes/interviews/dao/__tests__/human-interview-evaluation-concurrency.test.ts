import { createHumanInterviewEvaluationDao } from "@app/meeting-processing/human-interview";
import {
  meetingSession,
  meetingTranscriptRevision,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@app/db-schema/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";

const id = `evaluation-lock-${crypto.randomUUID()}`;
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
  await db.insert(studioInterview).values({
    candidateName: "测试候选人",
    createdBy: id,
    id,
    interviewQuestions: [],
    organizationId: id,
  });
  await db
    .insert(studioHumanInterviewRound)
    .values({ format: "online", id, interviewRecordId: id, label: "一面", organizationId: id });
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
  await db.insert(studioHumanInterviewMeeting).values({
    id,
    organizationId: id,
    processingMeetingSessionId: id,
    status: "ended",
    title: "并发提交测试",
  });
  await db.insert(studioHumanInterviewMeetingRound).values({ meetingId: id, roundId: id });
});

afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, id));
  await db.delete(user).where(eq(user.id, id));
});

it("prevents transcript correction until the submitted evaluation transaction commits", async () => {
  const dao = createHumanInterviewEvaluationDao(db, {
    enqueueHumanInterviewRoundCompletion: async () => {
      // This callback runs after saving the evaluation but before committing it.
      // A separate connection must not publish a newer transcript in that window.
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`set local lock_timeout = '100ms'`);
          await tx
            .update(meetingSession)
            .set({ activeTranscriptRevisionId: newRevision })
            .where(eq(meetingSession.id, id));
        }),
      ).rejects.toMatchObject({ cause: { code: "55P03" } });
    },
    loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
  });
  await expect(
    dao.submitHumanInterviewEvaluation({
      actorId: id,
      evaluation,
      meetingSessionId: id,
      organizationId: id,
      outcome: "pass",
      roundId: id,
      transcriptRevisionId: oldRevision,
    }),
  ).resolves.toBe(true);
  expect(
    await dao.listHumanInterviewEvaluationSnapshotsForAnalysis({ organizationId: id, roundId: id }),
  ).toMatchObject([{ evaluation, source: "human_submitted", transcriptRevisionId: oldRevision }]);
  // Once the submission commits, the correction can proceed normally.
  await db
    .update(meetingSession)
    .set({ activeTranscriptRevisionId: newRevision })
    .where(eq(meetingSession.id, id));
  const [meeting] = await db
    .select({ revision: meetingSession.activeTranscriptRevisionId })
    .from(meetingSession)
    .where(eq(meetingSession.id, id));
  expect(meeting?.revision).toBe(newRevision);
});
