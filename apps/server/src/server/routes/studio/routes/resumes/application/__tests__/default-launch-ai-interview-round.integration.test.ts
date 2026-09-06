import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import type { RecruitingRecordValues } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";
import {
  department,
  recruitingEvent,
  recruitingContextSnapshot,
  jobDescription,
  organization,
  aiInterviewRound,
  recruitingNodeState,
  user,
} from "@app/db-schema/schema";
import { persistLaunchAiInterviewRound } from "../default-launch-ai-interview-round";

const ORG_ID = "atomic_launch_org";
const USER_ID = "atomic_launch_user";
const DEPARTMENT_ID = "atomic_launch_department";
const JOB_ID = "atomic_launch_job";
const ROLLBACK_CANDIDATE_ID = "atomic_launch_rollback_candidate";
const CONCURRENT_CANDIDATE_ID = "atomic_launch_concurrent_candidate";
const STRUCTURED_CANDIDATE_ID = "atomic_launch_structured_candidate";
const STALE_STRUCTURED_CANDIDATE_ID = "atomic_launch_stale_structured_candidate";
const NOW = new Date("2026-07-29T12:00:00.000Z");

async function cleanup() {
  const candidateIds = [
    ROLLBACK_CANDIDATE_ID,
    CONCURRENT_CANDIDATE_ID,
    STRUCTURED_CANDIDATE_ID,
    STALE_STRUCTURED_CANDIDATE_ID,
  ];
  await deleteRecruitingRecords(db, inArray(recruitingRecordReadModel.id, candidateIds));
  await db.delete(jobDescription).where(eq(jobDescription.id, JOB_ID));
  await db.delete(department).where(eq(department.id, DEPARTMENT_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

function launchInput(
  interviewRecordId: string,
  roundId: string,
  decisionAuditLogId: string,
  launchAuditLogId: string,
) {
  return {
    actorId: USER_ID,
    decisionAuditLogId,
    interviewRecordId,
    launchAuditLogId,
    now: NOW,
    organizationId: ORG_ID,
    schedule: {
      createdAt: NOW,
      createdBy: USER_ID,
      id: roundId,
      organizationId: ORG_ID,
      recruitingRecordId: interviewRecordId,
      roundLabel: "AI 面试",
      sortOrder: 0,
      status: "pending" as const,
      updatedAt: NOW,
    },
    visibilityScope: { kind: "all" as const },
  };
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "atomic-launch@example.invalid",
    emailVerified: false,
    id: USER_ID,
    name: "Atomic Launch Recruiter",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "Atomic Launch Org",
    slug: ORG_ID,
  });
  await db.insert(department).values({
    createdAt: NOW,
    id: DEPARTMENT_ID,
    name: "Engineering",
    organizationId: ORG_ID,
    updatedAt: NOW,
  });
  await db.insert(jobDescription).values({
    createdAt: NOW,
    departmentId: DEPARTMENT_ID,
    evaluationMode: "legacy",
    id: JOB_ID,
    lifecycleStatus: "published",
    name: "Engineer",
    organizationId: ORG_ID,
    prompt: "Build reliable systems.",
    publishedAt: NOW,
    updatedAt: NOW,
  });
  await createRecruitingRecords(db, [
    {
      candidateName: "Rollback Candidate",
      createdAt: NOW,
      createdBy: USER_ID,
      id: ROLLBACK_CANDIDATE_ID,
      jobDescriptionId: JOB_ID,
      organizationId: ORG_ID,
      resumeEvaluationStatus: "pass",
      resumeParseStatus: "ready",
      updatedAt: NOW,
    },
    {
      candidateName: "Concurrent Candidate",
      createdAt: NOW,
      createdBy: USER_ID,
      id: CONCURRENT_CANDIDATE_ID,
      interviewQuestions: [
        {
          difficulty: "easy",
          order: 1,
          question: "请介绍最近负责的项目。",
        },
      ],
      jobDescriptionId: JOB_ID,
      organizationId: ORG_ID,
      resumeEvaluationStatus: "pass",
      resumeParseStatus: "ready",
      updatedAt: NOW,
    },
    {
      candidateName: "Structured Candidate",
      createdAt: NOW,
      createdBy: USER_ID,
      id: STRUCTURED_CANDIDATE_ID,
      jobDescriptionId: JOB_ID,
      organizationId: ORG_ID,
      resumeEvaluationStatus: "pass",
      resumeParseStatus: "ready",
      resumeReviewRunId: "structured-run-current",
      resumeReviewStatus: "ready",
      structuredCompositeScore: 80,
      structuredGateSortRank: 2,
      structuredGateStatus: "failed",
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      structuredResumeEvaluation: {
        gates: { effectiveStatus: "failed" },
        grade: "matched",
        runId: "structured-run-current",
      } as RecruitingRecordValues["structuredResumeEvaluation"],
      structuredScoreGrade: "matched",
      updatedAt: NOW,
    },
    {
      candidateName: "Stale Structured Candidate",
      createdAt: NOW,
      createdBy: USER_ID,
      id: STALE_STRUCTURED_CANDIDATE_ID,
      jobDescriptionId: JOB_ID,
      organizationId: ORG_ID,
      resumeEvaluationStatus: "pass",
      resumeParseStatus: "ready",
      resumeReviewRunId: "structured-run-replacement",
      resumeReviewStatus: "queued",
      structuredCompositeScore: 80,
      structuredGateSortRank: 2,
      structuredGateStatus: "failed",
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      structuredResumeEvaluation: {
        gates: { effectiveStatus: "failed" },
        grade: "matched",
        runId: "structured-run-stale",
      } as RecruitingRecordValues["structuredResumeEvaluation"],
      structuredScoreGrade: "matched",
      updatedAt: NOW,
    },
  ]);
}, 30_000);

afterAll(cleanup);

describe("atomic AI interview launch persistence", () => {
  it("rechecks and binds risky structured-evaluation confirmation inside the transaction", async () => {
    await expect(
      persistLaunchAiInterviewRound(
        launchInput(
          STRUCTURED_CANDIDATE_ID,
          "atomic_launch_structured_round_rejected",
          "atomic_launch_structured_decision_rejected",
          "atomic_launch_structured_audit_rejected",
        ),
      ),
    ).resolves.toEqual({
      ok: false,
      reason: "structured_evaluation_confirmation_required",
    });

    await expect(
      persistLaunchAiInterviewRound({
        ...launchInput(
          STRUCTURED_CANDIDATE_ID,
          "atomic_launch_structured_round",
          "atomic_launch_structured_decision",
          "atomic_launch_structured_audit",
        ),
        structuredEvaluationConfirmation: {
          gateStatus: "failed",
          grade: "matched",
          runId: "structured-run-current",
        },
      }),
    ).resolves.toEqual({
      ok: true,
      roundId: "atomic_launch_structured_round",
    });

    const [launchAudit] = await db
      .select({ detail: recruitingEvent.detail })
      .from(recruitingEvent)
      .where(eq(recruitingEvent.id, "atomic_launch_structured_audit"));
    expect(launchAudit?.detail).toMatchObject({
      personalizedQuestionCount: 0,
      questionCount: 0,
    });
  });

  it("does not treat an artifact from a replaced run as the current structured evaluation", async () => {
    await expect(
      persistLaunchAiInterviewRound(
        launchInput(
          STALE_STRUCTURED_CANDIDATE_ID,
          "atomic_launch_stale_structured_round",
          "atomic_launch_stale_structured_decision",
          "atomic_launch_stale_structured_audit",
        ),
      ),
    ).resolves.toEqual({
      ok: true,
      roundId: "atomic_launch_stale_structured_round",
    });
  });

  it.each([null, "fail"] as const)(
    "rejects unapproved screening %s without writes",
    async (screeningResult) => {
      await db
        .update(recruitingNodeState)
        .set({ result: screeningResult, status: screeningResult ? "completed" : "pending" })
        .where(
          and(
            eq(recruitingNodeState.recruitingRecordId, ROLLBACK_CANDIDATE_ID),
            eq(recruitingNodeState.node, "screening"),
          ),
        );
      await expect(
        persistLaunchAiInterviewRound(
          launchInput(ROLLBACK_CANDIDATE_ID, "blocked-round", "blocked-decision", "blocked-audit"),
        ),
      ).resolves.toEqual({ ok: false, reason: "screening_not_passed" });
      expect(
        await db
          .select()
          .from(aiInterviewRound)
          .where(eq(aiInterviewRound.recruitingRecordId, ROLLBACK_CANDIDATE_ID)),
      ).toEqual([]);
      await db
        .update(recruitingNodeState)
        .set({ result: "pass", status: "completed" })
        .where(
          and(
            eq(recruitingNodeState.recruitingRecordId, ROLLBACK_CANDIDATE_ID),
            eq(recruitingNodeState.node, "screening"),
          ),
        );
    },
  );

  it("rolls back every write when the final audit fails", async () => {
    await expect(
      persistLaunchAiInterviewRound(
        launchInput(
          ROLLBACK_CANDIDATE_ID,
          "atomic_launch_rollback_round",
          "atomic_launch_duplicate_audit",
          "atomic_launch_stale_structured_audit",
        ),
      ),
    ).rejects.toThrow();

    const [candidate] = await db
      .select({
        interviewQuestions: recruitingRecordReadModel.interviewQuestions,
        pipelineStage: recruitingRecordReadModel.pipelineStage,
        resumeEvaluationStatus: recruitingRecordReadModel.resumeEvaluationStatus,
      })
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, ROLLBACK_CANDIDATE_ID));
    expect(candidate).toEqual({
      interviewQuestions: [],
      pipelineStage: "screening",
      resumeEvaluationStatus: "pass",
    });
    const [rounds, snapshots, audits] = await Promise.all([
      db
        .select()
        .from(aiInterviewRound)
        .where(eq(aiInterviewRound.recruitingRecordId, ROLLBACK_CANDIDATE_ID)),
      db
        .select()
        .from(recruitingContextSnapshot)
        .where(eq(recruitingContextSnapshot.recruitingRecordId, ROLLBACK_CANDIDATE_ID)),
      db
        .select()
        .from(recruitingEvent)
        .where(eq(recruitingEvent.recruitingRecordId, ROLLBACK_CANDIDATE_ID)),
    ]);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("recruiting_node_updated");
    expect({ rounds, snapshots }).toEqual({
      rounds: [],
      snapshots: [],
    });
  });

  it("serializes concurrent launches and keeps one complete winner", async () => {
    const results = await Promise.all([
      persistLaunchAiInterviewRound(
        launchInput(
          CONCURRENT_CANDIDATE_ID,
          "atomic_launch_concurrent_round_a",
          "atomic_launch_decision_a",
          "atomic_launch_audit_a",
        ),
      ),
      persistLaunchAiInterviewRound(
        launchInput(
          CONCURRENT_CANDIDATE_ID,
          "atomic_launch_concurrent_round_b",
          "atomic_launch_decision_b",
          "atomic_launch_audit_b",
        ),
      ),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({
      ok: false,
      reason: "stage_conflict",
    });
    const [candidate] = await db
      .select({
        interviewQuestions: recruitingRecordReadModel.interviewQuestions,
        pipelineStage: recruitingRecordReadModel.pipelineStage,
        resumeEvaluationStatus: recruitingRecordReadModel.resumeEvaluationStatus,
      })
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, CONCURRENT_CANDIDATE_ID));
    expect(candidate).toMatchObject({
      interviewQuestions: [
        {
          difficulty: "easy",
          order: 1,
          question: "请介绍最近负责的项目。",
        },
      ],
      pipelineStage: "ai_interview",
      resumeEvaluationStatus: "pass",
    });
    const snapshots = await db
      .select()
      .from(recruitingContextSnapshot)
      .where(
        and(
          eq(recruitingContextSnapshot.recruitingRecordId, CONCURRENT_CANDIDATE_ID),
          eq(recruitingContextSnapshot.status, "active"),
        ),
      );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.aiRoundId).toMatch(/^atomic_launch_concurrent_round_[ab]$/);
    expect(snapshots[0]?.payload.personalizedQuestions).toEqual([]);
  });
});
