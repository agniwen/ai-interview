/* oxlint-disable max-lines -- binding, auto-match, HR-race, and import scenarios share one database fixture. */
// POST /:id/bind 集成测试（直接连接真实 PG 数据库，不 mock db/dao）。
// Integration tests for the bind endpoint — hit the real Postgres dev database
// through the actual route + DAO; only the permission middleware is bypassed.

import { testClient } from "hono/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  department,
  jobDescription,
  jobDescriptionVersion,
  member,
  organization,
  resumeEvaluationVersion,
  resumePoolEvent,
  resumePoolItem,
  resumeJobMatchCandidate,
  resumeJobMatchRun,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  createResumePoolItem,
  bindResumePoolItemJobDescription,
  importPoolItemToResumeLibrary,
  loadResumePoolItem,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import type { ImportPoolItemDependencies } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { listRecruitingJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { matchNewMailResumePoolItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/utils/job-match/service";
import type { MailResumeJobMatchServiceDependencies } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/utils/job-match/service";
import { createResumePoolRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/route";
import type { ResumePoolRouterDependencies } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/route";
import { deleteFixtureResumePoolItems } from "../../../../../../test-utils/db-fixture-cleanup";

const mocks = {
  cloneSemanticIndex: vi.fn<ImportPoolItemDependencies["cloneSemanticIndex"]>(),
  enqueueCandidateQuestionGeneration:
    vi.fn<ResumePoolRouterDependencies["enqueueCandidateQuestionGenerationForRecordBestEffort"]>(),
  enqueueResumePoolReviewGeneration:
    vi.fn<ResumePoolRouterDependencies["enqueueResumePoolReviewGenerationBestEffort"]>(),
  enqueueResumeReviewGeneration:
    vi.fn<ResumePoolRouterDependencies["enqueueResumeReviewGenerationForRecordBestEffort"]>(),
  findDuplicateMatches: vi.fn<ImportPoolItemDependencies["findDuplicateMatches"]>(),
};

const ORG_A = "resume_pool_bind_org_a";
const ORG_B = "resume_pool_bind_org_b";
const USER_A = "resume_pool_bind_user_a";
const USER_B = "resume_pool_bind_user_b";
const DEPARTMENT_A = "resume_pool_bind_department_a";
const DEPARTMENT_B = "resume_pool_bind_department_b";
const JD_A = "resume_pool_bind_jd_a";
const JD_A_REPLACEMENT = "resume_pool_bind_jd_a_replacement";
const JD_B = "resume_pool_bind_jd_b";
const NOW = new Date("2026-06-14T09:00:00.000Z");

const PROFILE: ResumeProfile = {
  age: null,
  email: "candidate@example.com",
  gender: null,
  name: "候选人甲",
  personalStrengths: [],
  phone: "13800138000",
  projectExperiences: [],
  schools: [],
  skills: ["React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 3,
};

const qualitativeDimension = {
  basis: "job" as const,
  evaluation: "候选人事实与岗位要求一致。",
  level: "recommended" as const,
};
const qualitativeEvaluation = {
  conciseOverall: "候选人的核心经验与岗位要求匹配，建议进入下一轮。",
  detailedOverall: {
    judgment: "整体匹配。",
    matchingEvidence: "有相关项目经验。",
    risks: "需确认项目规模。",
  },
  dimensions: {
    educationBackground: qualitativeDimension,
    experienceRelevance: qualitativeDimension,
    potential: qualitativeDimension,
    projectMatch: qualitativeDimension,
    skillMatch: qualitativeDimension,
    stability: qualitativeDimension,
  },
  recommendationLevel: "recommended" as const,
  schemaVersion: 2 as const,
  seniorityRecommendation: null,
  teamPositioning: null,
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORG_A } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "owner" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: USER_A } as never);
      await next();
    })
    .route(
      "/",
      createResumePoolRouter({
        enqueueCandidateQuestionGenerationForRecordBestEffort:
          mocks.enqueueCandidateQuestionGeneration,
        enqueueResumePoolReviewGenerationBestEffort: mocks.enqueueResumePoolReviewGeneration,
        enqueueResumeReviewGenerationForRecordBestEffort: mocks.enqueueResumeReviewGeneration,
        importPoolItemToResumeLibrary: (input) =>
          importPoolItemToResumeLibrary(input, {
            cloneSemanticIndex: mocks.cloneSemanticIndex,
            findDuplicateMatches: mocks.findDuplicateMatches,
          }),
        requirePermission: () => async (_c, next) => await next(),
      }),
    );
}

const client = testClient(makeApp());

async function seedPoolItem(overrides: {
  contentHash: string;
  jobDescriptionId?: string | null;
  resumeFileName?: string;
  resumeProfile?: ResumeProfile;
}) {
  const resumeProfile = overrides.resumeProfile ?? PROFILE;
  return await createResumePoolItem({
    candidateEmail: resumeProfile.email,
    candidateName: resumeProfile.name,
    candidatePhone: resumeProfile.phone,
    contentHash: overrides.contentHash,
    createdBy: USER_A,
    jobDescriptionId: overrides.jobDescriptionId ?? null,
    notes: null,
    organizationId: ORG_A,
    resumeFileName: overrides.resumeFileName ?? "candidate.pdf",
    resumeProfile,
    resumeText: "候选人甲 OCR 原文",
    scope: "private",
    storageKey: "attachments/resume-pool/bind-test.pdf",
    targetRole: "前端工程师",
  });
}

async function seedMailMatchBatch(poolItemId: string, requested: boolean): Promise<string> {
  const batchId = crypto.randomUUID();
  const batchItemId = crypto.randomUUID();
  await db.insert(resumeUploadBatch).values({
    createdAt: NOW,
    createdBy: USER_A,
    dedupPolicy: "skip",
    id: batchId,
    jdMode: "auto",
    jobDescriptionId: null,
    jobMatchRequestedAt: requested ? NOW : null,
    organizationId: ORG_A,
    resumePoolScope: "public",
    status: "completed",
    target: "resume_pool",
    totalCount: 1,
    updatedAt: NOW,
  });
  await db.insert(resumeUploadBatchItem).values({
    batchId,
    fileSize: 100,
    id: batchItemId,
    orderIndex: 0,
    organizationId: ORG_A,
    originalFileName: "candidate.pdf",
    poolItemId,
    status: "succeeded",
    storageKey: "attachments/resume-pool/bind-test.pdf",
  });
  await db
    .update(resumePoolItem)
    .set({ sourceChannel: "mail_ingest" })
    .where(eq(resumePoolItem.id, poolItemId));
  return batchItemId;
}

async function matchDependencies(
  selectedJobDescriptionId = JD_A_REPLACEMENT,
): Promise<MailResumeJobMatchServiceDependencies> {
  const jobs = await listRecruitingJobDescriptions(ORG_A);
  return {
    listPublishedJobs: vi.fn(() => Promise.resolve(jobs)),
    rankCandidates: vi.fn(() =>
      Promise.resolve({
        candidates: [
          {
            jobDescriptionId: selectedJobDescriptionId,
            matchScore: 88,
            rank: 1,
            reason: "综合经历最匹配",
          },
          {
            jobDescriptionId: selectedJobDescriptionId === JD_A ? JD_A_REPLACEMENT : JD_A,
            matchScore: 76,
            rank: 2,
            reason: "技能部分匹配",
          },
        ],
        selectedJobDescriptionId,
      }),
    ),
    recallCandidates: vi.fn((input) =>
      Promise.resolve({
        diagnostics: { aboveThresholdCount: 2, eligibleCount: 2, vectorHitCount: 2 },
        recommendations: [
          {
            departmentName: "Resume Pool Bind Department A",
            description: null,
            id: JD_A,
            name: "前端工程师",
            reasons: [],
            score: 20,
            similarity: { skillRole: 0.2 },
          },
          {
            departmentName: "Resume Pool Bind Department A",
            description: null,
            id: JD_A_REPLACEMENT,
            name: "资深前端工程师",
            reasons: [],
            score: 18,
            similarity: { skillRole: 0.18 },
          },
        ],
        resume: { id: input.resume.id },
        status: "ready" as const,
      }),
    ),
  };
}

async function cleanup() {
  await deleteFixtureResumePoolItems({
    organizationIds: [ORG_A, ORG_B],
    userIds: [USER_A, USER_B],
  });
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_A));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_B));
  await db.delete(department).where(eq(department.organizationId, ORG_A));
  await db.delete(department).where(eq(department.organizationId, ORG_B));
  await db.delete(member).where(eq(member.userId, USER_A));
  await db.delete(member).where(eq(member.userId, USER_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_A));
  await db.delete(user).where(eq(user.id, USER_B));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "resume-pool-bind-a@example.com",
      emailVerified: false,
      id: USER_A,
      name: "resume-pool-bind-a",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "resume-pool-bind-b@example.com",
      emailVerified: false,
      id: USER_B,
      name: "resume-pool-bind-b",
      updatedAt: NOW,
    },
  ]);
  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Resume Pool Bind Org A", slug: "resume-pool-bind-org-a" },
    { createdAt: NOW, id: ORG_B, name: "Resume Pool Bind Org B", slug: "resume-pool-bind-org-b" },
  ]);
  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "resume_pool_bind_member_a",
      organizationId: ORG_A,
      role: "owner",
      userId: USER_A,
    },
    {
      createdAt: NOW,
      id: "resume_pool_bind_member_b",
      organizationId: ORG_B,
      role: "owner",
      userId: USER_B,
    },
  ]);
  await db.insert(department).values([
    {
      createdAt: NOW,
      createdBy: USER_A,
      id: DEPARTMENT_A,
      name: "Resume Pool Bind Department A",
      organizationId: ORG_A,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USER_B,
      id: DEPARTMENT_B,
      name: "Resume Pool Bind Department B",
      organizationId: ORG_B,
      updatedAt: NOW,
    },
  ]);
  await db.insert(jobDescription).values([
    {
      createdAt: NOW,
      createdBy: USER_A,
      departmentId: DEPARTMENT_A,
      evaluationMode: "legacy",
      id: JD_A,
      lifecycleStatus: "published",
      name: "前端工程师",
      organizationId: ORG_A,
      prompt: "负责前端开发。",
      publishedAt: NOW,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USER_B,
      departmentId: DEPARTMENT_B,
      evaluationMode: "legacy",
      id: JD_B,
      lifecycleStatus: "published",
      name: "后端工程师",
      organizationId: ORG_B,
      prompt: "负责后端开发。",
      publishedAt: NOW,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USER_A,
      departmentId: DEPARTMENT_A,
      evaluationMode: "legacy",
      id: JD_A_REPLACEMENT,
      lifecycleStatus: "published",
      name: "资深前端工程师",
      organizationId: ORG_A,
      prompt: "负责资深前端开发。",
      publishedAt: NOW,
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

describe("POST /:id/bind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueResumePoolReviewGeneration.mockResolvedValue(true);
  });

  it("returns 400 when the job description does not exist", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-bind-nonexistent-jd" });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: "does-not-exist" },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "所选在招岗位不存在。" });
  });

  it("returns 400 when the job description belongs to another organization", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-bind-cross-org-jd" });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_B },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "所选在招岗位不存在。" });
  });

  it("binds an unbound pool item to a job description in the same organization", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-bind-success" });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_A },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toBeNull();
    expect(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      (body as { jobDescriptionId: string | null; jobDescriptionName: string | null })
        ?.jobDescriptionId,
    ).toBe(JD_A);
    // 详情 DTO 现在带出关联岗位名，供简历详情页「关联岗位」字段展示。
    expect(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      (
        body as {
          jobBindingMode: "automatic" | "manual" | null;
          jobDescriptionId: string | null;
          jobDescriptionName: string | null;
        }
      )?.jobDescriptionName,
    ).toBe("前端工程师");
    expect(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      (body as { jobBindingMode: "automatic" | "manual" | null })?.jobBindingMode,
    ).toBe("manual");

    const [row] = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, poolItemId));
    expect(row?.jobDescriptionId).toBe(JD_A);
    expect(mocks.enqueueResumePoolReviewGeneration).toHaveBeenCalledWith({
      jobDescriptionId: JD_A,
      organizationId: ORG_A,
      poolItemId,
    });
  });

  it("returns 404 when the pool item does not exist", async () => {
    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_A },
      param: { id: "does-not-exist" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "记录不存在。" });
  });

  it("treats rebinding to the current job as an idempotent success", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-bind-already-bound",
      jobDescriptionId: JD_A,
    });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_A },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(200);
    // SAFETY: The successful bind response follows ResumePoolDetail's binding-mode contract.
    expect(
      // Existing bindings have no explicit binding mode and must not be guessed.
      ((await response.json()) as { jobBindingMode: "automatic" | "manual" | null }).jobBindingMode,
    ).toBeNull();

    const [row] = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, poolItemId));
    expect(row?.jobDescriptionId).toBe(JD_A);
  });

  it("allows HR to rebind and records the old and new jobs without a reason", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-bind-replacement",
      jobDescriptionId: JD_A,
    });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_A_REPLACEMENT },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(200);
    const [row] = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, poolItemId));
    expect(row?.jobDescriptionId).toBe(JD_A_REPLACEMENT);
    const events = await db
      .select({ payload: resumePoolEvent.payload })
      .from(resumePoolEvent)
      .where(eq(resumePoolEvent.poolItemId, poolItemId));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            fromJobDescriptionId: JD_A,
            matchRunId: null,
            selectedCandidateRank: null,
            source: "hr_rebind",
            toJobDescriptionId: JD_A_REPLACEMENT,
          }),
        }),
      ]),
    );
  });
});

describe("new mail resume automatic job matching", () => {
  it("binds AI Top1 and persists the full low-score candidate list", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-mail-auto-match" });
    const batchItemId = await seedMailMatchBatch(poolItemId, true);

    const result = await matchNewMailResumePoolItem(
      { batchItemId, organizationId: ORG_A, poolItemId },
      await matchDependencies(),
    );

    expect(result).toEqual({ handled: true, jobDescriptionId: JD_A_REPLACEMENT });
    const detail = await loadResumePoolItem({
      organizationId: ORG_A,
      poolItemId,
      userId: USER_A,
    });
    expect(detail?.jobBindingMode).toBe("automatic");
    const [run] = await db
      .select()
      .from(resumeJobMatchRun)
      .where(eq(resumeJobMatchRun.poolItemId, poolItemId));
    expect(run).toMatchObject({
      model: expect.any(String),
      promptVersion: "mail-resume-job-rerank-v1",
      selectedJobDescriptionId: JD_A_REPLACEMENT,
      selectionMethod: "ai_rerank",
      status: "succeeded",
    });
    const candidates = await db
      .select()
      .from(resumeJobMatchCandidate)
      .where(eq(resumeJobMatchCandidate.runId, run?.id ?? "missing"));
    expect(candidates).toHaveLength(2);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobDescriptionId: JD_A, vectorScore: 20 }),
        expect.objectContaining({ jobDescriptionId: JD_A_REPLACEMENT, vectorScore: 18 }),
      ]),
    );
    const events = await db
      .select({ payload: resumePoolEvent.payload })
      .from(resumePoolEvent)
      .where(eq(resumePoolEvent.poolItemId, poolItemId));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            fromJobDescriptionId: null,
            matchRunId: run?.id,
            selectedCandidateRank: 1,
            selectionMethod: "ai_rerank",
            source: "auto_match",
            toJobDescriptionId: JD_A_REPLACEMENT,
          }),
        }),
      ]),
    );
  });

  it("leaves AI metadata empty when an exact filename directly selects the job", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-mail-filename-exact",
      resumeFileName: "候选人-前端工程师.pdf",
    });
    const batchItemId = await seedMailMatchBatch(poolItemId, true);
    const dependencies = await matchDependencies();

    const result = await matchNewMailResumePoolItem(
      { batchItemId, organizationId: ORG_A, poolItemId },
      dependencies,
    );

    expect(result).toEqual({ handled: true, jobDescriptionId: JD_A });
    expect(dependencies.rankCandidates).not.toHaveBeenCalled();
    const [run] = await db
      .select()
      .from(resumeJobMatchRun)
      .where(eq(resumeJobMatchRun.poolItemId, poolItemId));
    expect(run).toMatchObject({
      model: null,
      promptVersion: null,
      selectedJobDescriptionId: JD_A,
      selectionMethod: "filename_exact",
      status: "succeeded",
    });
  });

  it("records the selected vector candidate's actual recall rank after AI fallback", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-mail-vector-fallback-rank",
      resumeProfile: { ...PROFILE, targetRoles: [] },
    });
    const batchItemId = await seedMailMatchBatch(poolItemId, true);
    const dependencies = await matchDependencies();
    dependencies.recallCandidates = vi.fn((input) =>
      Promise.resolve({
        diagnostics: { aboveThresholdCount: 1, eligibleCount: 1, vectorHitCount: 1 },
        recommendations: [
          {
            departmentName: "Resume Pool Bind Department A",
            description: null,
            id: JD_A,
            name: "前端工程师",
            reasons: [],
            score: 18,
            similarity: { skillRole: 0.18 },
          },
          {
            departmentName: "Resume Pool Bind Department A",
            description: null,
            id: JD_A_REPLACEMENT,
            name: "资深前端工程师",
            reasons: [],
            score: 20,
            similarity: { skillRole: 0.2 },
          },
        ],
        resume: { id: input.resume.id },
        status: "ready" as const,
      }),
    );
    dependencies.rankCandidates = vi.fn(() => Promise.reject(new Error("AI unavailable")));

    const result = await matchNewMailResumePoolItem(
      { batchItemId, organizationId: ORG_A, poolItemId },
      dependencies,
    );

    expect(result).toEqual({ handled: true, jobDescriptionId: JD_A_REPLACEMENT });
    const [run] = await db
      .select()
      .from(resumeJobMatchRun)
      .where(eq(resumeJobMatchRun.poolItemId, poolItemId));
    expect(run).toMatchObject({
      model: expect.any(String),
      promptVersion: "mail-resume-job-rerank-v1",
      selectionMethod: "vector_fallback",
    });
    const events = await db
      .select({ payload: resumePoolEvent.payload })
      .from(resumePoolEvent)
      .where(eq(resumePoolEvent.poolItemId, poolItemId));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            selectedCandidateRank: 2,
            selectionMethod: "vector_fallback",
            toJobDescriptionId: JD_A_REPLACEMENT,
          }),
        }),
      ]),
    );
  });

  it("does not run or change historical mail batches without the new marker", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-mail-historical" });
    const batchItemId = await seedMailMatchBatch(poolItemId, false);
    const dependencies = await matchDependencies();

    const result = await matchNewMailResumePoolItem(
      { batchItemId, organizationId: ORG_A, poolItemId },
      dependencies,
    );

    expect(result).toEqual({ handled: false, jobDescriptionId: null });
    expect(dependencies.listPublishedJobs).not.toHaveBeenCalled();
    const runs = await db
      .select()
      .from(resumeJobMatchRun)
      .where(eq(resumeJobMatchRun.poolItemId, poolItemId));
    expect(runs).toHaveLength(0);
  });

  it("keeps an HR binding made while AI is ranking and marks the run superseded", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-mail-hr-race" });
    const batchItemId = await seedMailMatchBatch(poolItemId, true);
    const dependencies = await matchDependencies(JD_A_REPLACEMENT);
    const defaultRankCandidates = dependencies.rankCandidates;
    dependencies.rankCandidates = vi.fn(async (profile, candidates, options) => {
      await bindResumePoolItemJobDescription({
        actorId: USER_A,
        jobDescriptionId: JD_A,
        organizationId: ORG_A,
        poolItemId,
      });
      return await defaultRankCandidates(profile, candidates, options);
    });

    const result = await matchNewMailResumePoolItem(
      { batchItemId, organizationId: ORG_A, poolItemId },
      dependencies,
    );

    expect(result).toEqual({ handled: true, jobDescriptionId: JD_A });
    const [run] = await db
      .select({ status: resumeJobMatchRun.status })
      .from(resumeJobMatchRun)
      .where(eq(resumeJobMatchRun.poolItemId, poolItemId));
    expect(run?.status).toBe("superseded");
  });

  it("does not mislabel an HR binding as automatic when HR picks the same AI Top1", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-mail-hr-same-top1-race" });
    const batchItemId = await seedMailMatchBatch(poolItemId, true);
    const dependencies = await matchDependencies(JD_A_REPLACEMENT);
    const defaultRankCandidates = dependencies.rankCandidates;
    dependencies.rankCandidates = vi.fn(async (profile, candidates, options) => {
      await bindResumePoolItemJobDescription({
        actorId: USER_A,
        jobDescriptionId: JD_A_REPLACEMENT,
        organizationId: ORG_A,
        poolItemId,
      });
      return await defaultRankCandidates(profile, candidates, options);
    });

    const result = await matchNewMailResumePoolItem(
      { batchItemId, organizationId: ORG_A, poolItemId },
      dependencies,
    );

    expect(result).toEqual({ handled: true, jobDescriptionId: JD_A_REPLACEMENT });
    const events = await db
      .select({ payload: resumePoolEvent.payload })
      .from(resumePoolEvent)
      .where(eq(resumePoolEvent.poolItemId, poolItemId));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: expect.objectContaining({ source: "hr_rebind" }) }),
      ]),
    );
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: expect.objectContaining({ source: "auto_match" }) }),
      ]),
    );
  });
});

describe("POST /:id/import job association", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCandidateQuestionGeneration.mockResolvedValue(true);
    mocks.enqueueResumeReviewGeneration.mockResolvedValue({
      runId: "resume-pool-import-review-run",
      status: "enqueued",
    });
    mocks.findDuplicateMatches.mockResolvedValue([]);
  });

  it("exposes the selected job on the pool item after import", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-import-bind-success" });

    const response = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionId: JD_A,
        jobDescriptionMode: "bind",
      },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(201);

    const detailResponse = await client[":id"].$get({ param: { id: poolItemId } });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      jobDescriptionId: JD_A,
      jobDescriptionName: "前端工程师",
    });
    expect(mocks.enqueueResumeReviewGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueResumeReviewGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescriptionId: JD_A,
        poolItemId,
        source: "resume_pool_import",
      }),
    );
  });

  it("copies a same-job qualitative evaluation into the recruiting record history", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-import-reuse-qualitative",
      jobDescriptionId: JD_A,
    });
    const jobDescriptionVersionId = `pool-import-version-${crypto.randomUUID()}`;
    const generatedAt = new Date("2026-08-28T02:00:00.000Z");
    await db.insert(jobDescriptionVersion).values({
      createdAt: generatedAt,
      createdBy: USER_A,
      id: jobDescriptionVersionId,
      jobDescriptionId: JD_A,
      jobDescriptionName: "前端工程师",
      organizationId: ORG_A,
      prompt: "负责前端开发。",
      version: 1,
    });
    await db
      .update(resumePoolItem)
      .set({
        qualitativeJobDescriptionVersionId: jobDescriptionVersionId,
        qualitativeRecommendationLevel: "recommended",
        qualitativeResumeEvaluation: qualitativeEvaluation,
        qualitativeResumeSummary: qualitativeEvaluation.conciseOverall,
        resumeEvaluationContractVersion: "qualitative-v2",
        resumeEvaluationGeneratedAt: generatedAt,
        resumeEvaluationInputHash: "pool-input-hash",
      })
      .where(eq(resumePoolItem.id, poolItemId));

    const result = await importPoolItemToResumeLibrary(
      {
        dedupPolicy: "force",
        importedBy: USER_A,
        jobDescriptionId: JD_A,
        organizationId: ORG_A,
        poolItemId,
      },
      {
        cloneSemanticIndex: mocks.cloneSemanticIndex,
        findDuplicateMatches: mocks.findDuplicateMatches,
      },
    );
    if (result.status !== "imported") {
      throw new Error("Expected the pool item to be imported.");
    }
    const [record] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, result.resumeRecordId));
    const history = await db
      .select()
      .from(resumeEvaluationVersion)
      .where(eq(resumeEvaluationVersion.resumeRecordId, result.resumeRecordId));

    expect(record).toMatchObject({
      qualitativeJobDescriptionVersionId: jobDescriptionVersionId,
      qualitativeRecommendationLevel: "recommended",
      qualitativeResumeEvaluation: qualitativeEvaluation,
      resumeEvaluationArtifactMode: "qualitative",
      resumeReviewStatus: "ready",
    });
    expect(history).toEqual([
      expect.objectContaining({
        contractVersion: "qualitative-v2",
        jobDescriptionVersionId,
        numericScore: null,
        recommendationLevel: "recommended",
      }),
    ]);
  });

  it("creates the first AI interview round when importing directly into AI interview", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-import-ai-stage" });

    const response = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        initialRecruitmentStage: "ai_interview",
        jobDescriptionId: JD_A,
        jobDescriptionMode: "bind",
      },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(201);
    const [record] = await db
      .select({ id: studioInterview.id, pipelineStage: studioInterview.pipelineStage })
      .from(studioInterview)
      .where(eq(studioInterview.resumeSourcePoolItemId, poolItemId));
    expect(record?.pipelineStage).toBe("ai_interview");
    const rounds = record
      ? await db
          .select({ status: studioInterviewSchedule.status })
          .from(studioInterviewSchedule)
          .where(eq(studioInterviewSchedule.interviewRecordId, record.id))
      : [];
    expect(rounds).toEqual([{ status: "pending" }]);
  });

  it("replaces the pool item job when explicitly reimported for another job", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-reimport-replace-job" });

    const firstResponse = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionId: JD_A,
        jobDescriptionMode: "bind",
      },
      param: { id: poolItemId },
    });
    expect(firstResponse.status).toBe(201);

    const secondResponse = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionId: JD_A_REPLACEMENT,
        jobDescriptionMode: "bind",
        reimport: true,
      },
      param: { id: poolItemId },
    });
    expect(secondResponse.status).toBe(201);

    const detailResponse = await client[":id"].$get({ param: { id: poolItemId } });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      jobDescriptionId: JD_A_REPLACEMENT,
      jobDescriptionName: "资深前端工程师",
    });
  });

  it("keeps the existing pool item job when imported without selecting a job", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-import-without-job",
      jobDescriptionId: JD_A,
    });

    const response = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionMode: "none",
      },
      param: { id: poolItemId },
    });
    expect(response.status).toBe(201);

    const detailResponse = await client[":id"].$get({ param: { id: poolItemId } });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      jobDescriptionId: JD_A,
      jobDescriptionName: "前端工程师",
    });
    expect(mocks.enqueueResumeReviewGeneration).not.toHaveBeenCalled();
  });
});
