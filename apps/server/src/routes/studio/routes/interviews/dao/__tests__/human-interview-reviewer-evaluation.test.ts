import { loadRoundReviewerEvaluations } from "../human-interview-round-evaluations";
import { readFileSync } from "node:fs";
import { createRecruitingRecords } from "@app/database/recruiting-records";
import { createHumanInterviewEvaluationDao } from "@app/meeting-processing/human-interview";
import {
  meetingSession,
  meetingTranscriptRevision,
  organization,
  recruitingRecord,
  recruitingNodeState,
  humanInterviewEvaluationSnapshot,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewMeetingInterviewer,
  humanInterviewRound,
  humanInterviewReviewerEvaluation,
  humanInterviewEvaluationDocumentSync,
  user,
} from "@app/db-schema/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../../../../../../infrastructure/db/index";

const id = `reviewer-isolation-${crypto.randomUUID()}`;
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
  await db.insert(user).values({
    email: `${id}-second@example.com`,
    emailVerified: false,
    id: `${id}-second`,
    name: "第二面试官",
  });
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
  await db
    .update(recruitingRecord)
    .set({ currentStage: "second_interview" })
    .where(eq(recruitingRecord.id, id));
  await db
    .update(recruitingNodeState)
    .set({ effectiveHumanRoundId: id, status: "pending" })
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, id),
        eq(recruitingNodeState.node, "second_interview"),
      ),
    );
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
  await db.insert(humanInterviewMeetingInterviewer).values(
    [id, `${id}-second`].map((userId) => ({
      meetingId: id,
      organizationId: id,
      role: "interviewer" as const,
      userId,
    })),
  );
});

afterAll(async () => {
  await db.delete(recruitingNodeState).where(eq(recruitingNodeState.recruitingRecordId, id));
  await db.delete(organization).where(eq(organization.id, id));
  await db.delete(user).where(eq(user.id, id));
  await db.delete(user).where(eq(user.id, `${id}-second`));
});

it("isolates drafts and preserves the first decisive submission against conflicting later input", async () => {
  let notifications = 0;
  const dao = createHumanInterviewEvaluationDao(db, {
    enqueueHumanInterviewRoundCompletion: () => {
      notifications += 1;
      return Promise.resolve();
    },
    loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
  });
  const shared = {
    meetingSessionId: id,
    organizationId: id,
    roundId: id,
    transcriptRevisionId: oldRevision,
  };
  expect(
    await dao.saveHumanInterviewEvaluationDraft({
      ...shared,
      actorId: id,
      evaluation: { ...evaluation, overallEvaluation: "甲的草稿" },
      expectedVersion: 0,
    }),
  ).toBe(true);
  expect(
    await dao.saveHumanInterviewEvaluationDraft({
      ...shared,
      actorId: `${id}-second`,
      evaluation: { ...evaluation, overallEvaluation: "乙的草稿" },
      expectedVersion: 0,
    }),
  ).toBe(true);
  expect(
    await dao.saveHumanInterviewEvaluationDraft({
      ...shared,
      actorId: id,
      evaluation,
      expectedVersion: 0,
    }),
  ).toBe(false);
  expect(
    await dao.loadHumanInterviewReview({
      meetingId: id,
      organizationId: id,
      reviewerId: id,
      roundId: id,
    }),
  ).toMatchObject({ evaluation: { overallEvaluation: "甲的草稿" }, evaluationVersion: 1 });
  const beforeSubmission = await loadRoundReviewerEvaluations([id], id);
  expect(beforeSubmission.get(id)).toBeUndefined();
  const job = await dao.requestHumanInterviewEvaluation({
    force: false,
    meetingSessionId: id,
    organizationId: id,
  });
  expect(job).not.toBeNull();
  expect(
    await dao.publishHumanInterviewEvaluation({
      ...shared,
      evaluation: { ...evaluation, overallEvaluation: "AI 建议" },
    }),
  ).toBe(true);
  expect(
    await dao.loadHumanInterviewReview({
      meetingId: id,
      organizationId: id,
      reviewerId: id,
      roundId: id,
    }),
  ).toMatchObject({
    aiEvaluation: { overallEvaluation: "AI 建议" },
    evaluation: { overallEvaluation: "甲的草稿" },
  });
  expect(
    await dao.submitHumanInterviewEvaluation({
      ...shared,
      actorId: id,
      evaluation: { ...evaluation, overallEvaluation: "甲不推荐" },
      expectedVersion: 1,
      outcome: "fail",
    }),
  ).toBe(true);
  const [candidateAfterRejection] = await db
    .select()
    .from(recruitingRecord)
    .where(eq(recruitingRecord.id, id));
  expect(candidateAfterRejection).toMatchObject({
    currentStage: "closed",
    outcome: "rejected",
  });
  expect(
    await dao.loadHumanInterviewReview({
      meetingId: id,
      organizationId: id,
      reviewerId: `${id}-second`,
      roundId: id,
    }),
  ).toMatchObject({
    evaluation: { overallEvaluation: "乙的草稿" },
    evaluationStatus: "draft",
    lockedOutcome: "fail",
    roundOutcome: "fail",
    roundStatus: "completed",
  });
  expect(
    await dao.saveHumanInterviewEvaluationDraft({
      ...shared,
      actorId: `${id}-second`,
      evaluation: { ...evaluation, draftOutcome: "pass" },
      expectedVersion: 1,
    }),
  ).toBe(true);
  const forcedDraft = await dao.loadHumanInterviewReview({
    meetingId: id,
    organizationId: id,
    reviewerId: `${id}-second`,
    roundId: id,
  });
  expect(forcedDraft?.evaluation?.draftOutcome).toBe("fail");
  expect(
    await dao.submitHumanInterviewEvaluation({
      ...shared,
      actorId: `${id}-second`,
      evaluation: { ...evaluation, overallEvaluation: "乙推荐" },
      expectedVersion: 2,
      outcome: "pass",
    }),
  ).toBe(true);
  expect(
    await dao.submitHumanInterviewEvaluation({
      ...shared,
      actorId: id,
      evaluation,
      expectedVersion: 2,
      outcome: "pass",
    }),
  ).toBe(false);
  const review = await dao.loadHumanInterviewReview({
    meetingId: id,
    organizationId: id,
    reviewerId: id,
    roundId: id,
  });
  expect(review).toMatchObject({
    aiEvaluation: { overallEvaluation: "AI 建议" },
    outcome: "fail",
    roundOutcome: "fail",
  });
  expect(review?.reviewerEvaluations).toHaveLength(2);
  expect(notifications).toBe(1);
  const syncJobs = await db
    .select()
    .from(humanInterviewEvaluationDocumentSync)
    .where(eq(humanInterviewEvaluationDocumentSync.roundId, id));
  expect(syncJobs).toHaveLength(1);
  const personal = await db
    .select()
    .from(humanInterviewReviewerEvaluation)
    .where(eq(humanInterviewReviewerEvaluation.roundId, id));
  expect(personal).toHaveLength(2);
  const displayed = await loadRoundReviewerEvaluations([id], id);
  expect(displayed.get(id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        evaluation: expect.objectContaining({ overallEvaluation: "甲不推荐" }),
        outcome: "fail",
        reviewerId: id,
        reviewerName: "测试面试官",
      }),
      expect.objectContaining({
        evaluation: expect.objectContaining({ overallEvaluation: "乙推荐" }),
        outcome: "fail",
        reviewerId: `${id}-second`,
        reviewerName: "第二面试官",
      }),
    ]),
  );
  const otherOrganization = await loadRoundReviewerEvaluations([id], "different-org");
  expect(otherOrganization.size).toBe(0);
});

it("backfills attributed and unattributed history without reopening rounds or creating sync jobs", async () => {
  const ids = ["known", "unknown", "ai"].map((suffix) => `${id}-${suffix}`);
  await db.insert(humanInterviewRound).values(
    ids.map((roundId, index) => ({
      evaluation,
      evaluationStatus: index === 2 ? ("draft" as const) : ("submitted" as const),
      evaluationSubmittedAt: index === 2 ? null : new Date(),
      evaluationUpdatedBy: index === 0 ? id : null,
      format: "online" as const,
      id: roundId,
      label: "历史轮次",
      organizationId: id,
      outcome: index === 2 ? null : ("fail" as const),
      recruitingRecordId: id,
      roundKind: "second_interview" as const,
      status: index === 2 ? ("pending" as const) : ("completed" as const),
    })),
  );
  await db.insert(humanInterviewEvaluationSnapshot).values({
    evaluation,
    id: `${id}-ai-snapshot`,
    organizationId: id,
    roundId: ids[2],
    source: "ai_generated",
  });
  const before = await db
    .select()
    .from(humanInterviewRound)
    .where(inArray(humanInterviewRound.id, ids));
  const migration = readFileSync(
    new URL(
      "../../../../../../../../web/drizzle/20261008075843_interviewer-evaluations/migration.sql",
      import.meta.url,
    ),
    "utf-8",
  );
  const backfill = migration.slice(
    migration.indexOf("INSERT INTO human_interview_reviewer_evaluation"),
  );
  // Scope the real migration mapping to this test's fixtures; never backfill unrelated rows in a shared test database.
  await db.execute(
    sql.raw(
      backfill.replace(
        "FROM human_interview_round r",
        `FROM (SELECT * FROM human_interview_round WHERE id IN (${ids.map((value) => `'${value}'`).join(",")})) r`,
      ),
    ),
  );
  const migrated = await db
    .select()
    .from(humanInterviewReviewerEvaluation)
    .where(inArray(humanInterviewReviewerEvaluation.roundId, ids));
  expect(migrated).toHaveLength(2);
  expect(migrated.find((item) => item.roundId === ids[0])).toMatchObject({
    evaluation,
    legacy: true,
    outcome: "fail",
    reviewerId: id,
  });
  expect(migrated.find((item) => item.roundId === ids[1])).toMatchObject({
    evaluation,
    legacy: true,
    outcome: "fail",
    reviewerId: null,
  });
  expect(
    await db.select().from(humanInterviewRound).where(inArray(humanInterviewRound.id, ids)),
  ).toEqual(before);
  expect(
    await db
      .select()
      .from(humanInterviewEvaluationDocumentSync)
      .where(inArray(humanInterviewEvaluationDocumentSync.roundId, ids)),
  ).toHaveLength(0);
});

it.each(["fail", "pass"] as const)(
  "retains first %s when another interviewer submits inconclusive",
  async (firstOutcome) => {
    await db
      .update(recruitingRecord)
      .set({
        closeDetails: null,
        closeReason: null,
        closedAt: null,
        closedFromNode: null,
        currentStage: "second_interview",
        outcome: "in_pipeline",
      })
      .where(eq(recruitingRecord.id, id));
    const roundId = `${id}-decision-${firstOutcome}`;
    await db.insert(humanInterviewRound).values({
      format: "online",
      id: roundId,
      label: "拒绝测试",
      organizationId: id,
      recruitingRecordId: id,
      roundKind: "second_interview",
    });
    await db
      .insert(humanInterviewMeetingRound)
      .values({ meetingId: id, organizationId: id, roundId });
    await db
      .update(recruitingNodeState)
      .set({ effectiveHumanRoundId: roundId, result: null, status: "pending" })
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, id),
          eq(recruitingNodeState.node, "second_interview"),
        ),
      );
    const dao = createHumanInterviewEvaluationDao(db, {
      enqueueHumanInterviewRoundCompletion: () => Promise.resolve(),
      loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
    });
    const shared = {
      evaluation,
      meetingSessionId: id,
      organizationId: id,
      roundId,
      transcriptRevisionId: oldRevision,
    };
    expect(
      await dao.submitHumanInterviewEvaluation({
        ...shared,
        actorId: id,
        expectedVersion: 0,
        outcome: firstOutcome,
      }),
    ).toBe(true);
    const [beforeAllSubmitted] = await db
      .select()
      .from(recruitingRecord)
      .where(eq(recruitingRecord.id, id));
    expect(beforeAllSubmitted).toMatchObject(
      firstOutcome === "fail"
        ? { currentStage: "closed", outcome: "rejected" }
        : { outcome: "in_pipeline" },
    );
    expect(
      await dao.submitHumanInterviewEvaluation({
        ...shared,
        actorId: `${id}-second`,
        expectedVersion: 0,
        outcome: "inconclusive",
      }),
    ).toBe(true);
    const [afterAllSubmitted] = await db
      .select()
      .from(recruitingRecord)
      .where(eq(recruitingRecord.id, id));
    expect(afterAllSubmitted).toMatchObject(
      firstOutcome === "fail"
        ? { currentStage: "closed", outcome: "rejected" }
        : { outcome: "in_pipeline" },
    );
    const [completedRound] = await db
      .select()
      .from(humanInterviewRound)
      .where(eq(humanInterviewRound.id, roundId));
    expect(completedRound).toMatchObject({ outcome: firstOutcome, status: "completed" });
  },
);

it.each([
  ["inconclusive", "pass", "pass"],
  ["inconclusive", "fail", "fail"],
  ["inconclusive", "inconclusive", "inconclusive"],
  ["pass", "fail", "pass"],
  ["fail", "pass", "fail"],
] as const)("round matrix: %s then %s results in %s", async (first, second, result) => {
  const roundId = `${id}-matrix-${first}-${second}`;
  await db
    .update(recruitingRecord)
    .set({
      closeDetails: null,
      closeReason: null,
      closedAt: null,
      closedFromNode: null,
      currentStage: "second_interview",
      outcome: "in_pipeline",
    })
    .where(eq(recruitingRecord.id, id));
  await db.insert(humanInterviewRound).values({
    format: "online",
    id: roundId,
    label: `矩阵 ${first} → ${second}`,
    organizationId: id,
    recruitingRecordId: id,
    roundKind: "second_interview",
  });
  await db
    .insert(humanInterviewMeetingRound)
    .values({ meetingId: id, organizationId: id, roundId });
  await db
    .update(recruitingNodeState)
    .set({ effectiveHumanRoundId: roundId, result: null, status: "pending" })
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, id),
        eq(recruitingNodeState.node, "second_interview"),
      ),
    );
  let notifications = 0;
  const dao = createHumanInterviewEvaluationDao(db, {
    enqueueHumanInterviewRoundCompletion: () => {
      notifications += 1;
      return Promise.resolve();
    },
    loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
  });
  const shared = {
    meetingSessionId: id,
    organizationId: id,
    roundId,
    transcriptRevisionId: oldRevision,
  };
  expect(
    await dao.submitHumanInterviewEvaluation({
      ...shared,
      actorId: id,
      evaluation: { ...evaluation, overallEvaluation: "第一人的独立评价" },
      expectedVersion: 0,
      outcome: first,
    }),
  ).toBe(true);
  const intermediate = await dao.loadHumanInterviewReview({
    meetingId: id,
    organizationId: id,
    reviewerId: `${id}-second`,
    roundId,
  });
  expect(intermediate).toMatchObject({
    evaluationStatus: "not_started",
    lockedOutcome: first === "inconclusive" ? null : first,
    roundStatus: first === "inconclusive" ? "pending" : "completed",
  });
  const [firstRound] = await db
    .select()
    .from(humanInterviewRound)
    .where(eq(humanInterviewRound.id, roundId));
  const [openRecord] = await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, id));
  expect(openRecord.outcome).toBe(first === "fail" ? "rejected" : "in_pipeline");
  expect(
    await dao.submitHumanInterviewEvaluation({
      ...shared,
      actorId: `${id}-second`,
      evaluation: { ...evaluation, overallEvaluation: "第二人的独立评价" },
      expectedVersion: 0,
      outcome: second,
    }),
  ).toBe(true);
  const [round] = await db
    .select()
    .from(humanInterviewRound)
    .where(eq(humanInterviewRound.id, roundId));
  expect(round).toMatchObject({ outcome: result, status: "completed" });
  const [record] = await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, id));
  expect(record).toMatchObject(
    result === "fail"
      ? { currentStage: "closed", outcome: "rejected" }
      : { currentStage: "second_interview", outcome: "in_pipeline" },
  );
  const personal = await db
    .select()
    .from(humanInterviewReviewerEvaluation)
    .where(eq(humanInterviewReviewerEvaluation.roundId, roundId));
  expect(personal).toHaveLength(2);
  expect(personal.find((row) => row.reviewerId === id)).toMatchObject({
    evaluation: { overallEvaluation: "第一人的独立评价" },
    outcome: first,
  });
  expect(personal.find((row) => row.reviewerId === `${id}-second`)).toMatchObject({
    evaluation: { overallEvaluation: "第二人的独立评价" },
    outcome: result,
  });
  const [finalRound] = await db
    .select()
    .from(humanInterviewRound)
    .where(eq(humanInterviewRound.id, roundId));
  if (first !== "inconclusive") {
    expect(finalRound.completedAt).toEqual(firstRound.completedAt);
  }
  expect(notifications).toBe(1);
});

it("serializes simultaneous opposite submissions without losing either evaluation", async () => {
  const roundId = `${id}-simultaneous`;
  await db
    .update(recruitingRecord)
    .set({
      closeDetails: null,
      closeReason: null,
      closedAt: null,
      closedFromNode: null,
      currentStage: "second_interview",
      outcome: "in_pipeline",
    })
    .where(eq(recruitingRecord.id, id));
  await db.insert(humanInterviewRound).values({
    format: "online",
    id: roundId,
    label: "同时提交相反结论",
    organizationId: id,
    recruitingRecordId: id,
    roundKind: "second_interview",
  });
  await db
    .insert(humanInterviewMeetingRound)
    .values({ meetingId: id, organizationId: id, roundId });
  await db
    .update(recruitingNodeState)
    .set({ effectiveHumanRoundId: roundId, result: null, status: "pending" })
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, id),
        eq(recruitingNodeState.node, "second_interview"),
      ),
    );
  let notifications = 0;
  const dao = createHumanInterviewEvaluationDao(db, {
    enqueueHumanInterviewRoundCompletion: () => {
      notifications += 1;
      return Promise.resolve();
    },
    loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
  });
  const results = await Promise.all(
    (["pass", "fail"] as const).map((outcome, index) =>
      dao.submitHumanInterviewEvaluation({
        actorId: index === 0 ? id : `${id}-second`,
        evaluation: { ...evaluation, overallEvaluation: `并发评价 ${index}` },
        expectedVersion: 0,
        meetingSessionId: id,
        organizationId: id,
        outcome,
        roundId,
        transcriptRevisionId: oldRevision,
      }),
    ),
  );
  expect(results).toEqual([true, true]);
  const [round] = await db
    .select()
    .from(humanInterviewRound)
    .where(eq(humanInterviewRound.id, roundId));
  expect(round.status).toBe("completed");
  expect(["pass", "fail"]).toContain(round.outcome);
  const personal = await db
    .select()
    .from(humanInterviewReviewerEvaluation)
    .where(eq(humanInterviewReviewerEvaluation.roundId, roundId));
  expect(personal).toHaveLength(2);
  expect(personal.every((row) => row.outcome === round.outcome && row.submittedAt)).toBe(true);
  expect(new Set(personal.map((row) => row.evaluation.overallEvaluation)).size).toBe(2);
  expect(notifications).toBe(1);
  const syncJobs = await db
    .select()
    .from(humanInterviewEvaluationDocumentSync)
    .where(eq(humanInterviewEvaluationDocumentSync.roundId, roundId));
  expect(syncJobs).toHaveLength(1);
});
