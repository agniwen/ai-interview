import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import {
  candidate,
  candidateResume,
  department,
  jobDescription,
  recruitingNodeState,
  recruitingEvent,
  organization,
  recruitingRecord,
  recruitingResumeEvaluation,
  studioInterview,
} from "@app/db-schema";
import type { ResumeReview } from "@app/db-schema/resume-review";
import { createDatabase } from "./index";
import {
  createRecruitingRecords,
  deleteRecruitingRecords,
  updateRecruitingRecords,
} from "./recruiting-records";
import { recruitingRecordReadModel as read } from "./recruiting-read-model";

const dimension = { rationale: "历史测试依据", score: 60 };
const review: ResumeReview = {
  biasScan: { items: [] },
  dimensions: {
    educationBackground: dimension,
    experienceRelevance: dimension,
    potential: dimension,
    projectMatch: dimension,
    skillMatch: dimension,
    stability: dimension,
  },
  levelRecommendation: { level: "中级", rationale: "历史评估" },
  nextStep: {
    action: "hold",
    disclaimer: "以上为初步结论",
    interviewFocus: [],
    rationale: "等待确认",
  },
  overall: { baseScore: 60, conclusion: "历史结论", scoreRationale: "历史依据" },
  schemaVersion: 4,
  strengths: [{ evidence: null, impact: "可用", point: "技能" }],
  teamPositioning: { rationale: "历史依据", suggestion: "待定" },
  weaknesses: [{ evidence: null, impact: "待确认", point: "经验" }],
};
const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
suite("招聘拆表写入和并发边界", () => {
  if (testUrl && !new URL(testUrl).pathname.includes("_test_")) {
    throw new Error("招聘集成测试必须使用独立测试库");
  }
  const client = postgres(testUrl ?? "postgres://localhost/unused", { max: 2 });
  const db = createDatabase(client);
  const org = `record-test-${crypto.randomUUID()}`;
  const ids: string[] = [];
  beforeAll(async () => {
    await db.insert(organization).values({ id: org, name: "隔离招聘测试", slug: org });
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(read.organizationId, org));
    await db.delete(studioInterview).where(eq(studioInterview.organizationId, org));
    await db.delete(candidate).where(eq(candidate.organizationId, org));
    await db.delete(jobDescription).where(eq(jobDescription.organizationId, org));
    await db.delete(department).where(eq(department.organizationId, org));
    await db.delete(organization).where(eq(organization.id, org));
    await client.end();
  });
  async function create() {
    const id = crypto.randomUUID();
    ids.push(id);
    const [row] = await createRecruitingRecords(db, {
      candidateEmail: "same@example.com",
      candidateName: "测试候选人",
      id,
      organizationId: org,
      resumeContentHash: "original",
      resumeStorageKey: "original.pdf",
    });
    if (!row) {
      throw new Error("招聘测试创建未返回记录");
    }
    return row;
  }
  it("创建各自的人才和简历，保留招聘身份，不按邮箱合并", async () => {
    const first = await create();
    const second = await create();
    expect(first.candidateId).not.toBe(second.candidateId);
    expect(first.resumeId).not.toBe(second.resumeId);
    expect(first.candidateName).toBe("测试候选人");
    expect(first.pipelineStage).toBe("screening");
    expect(first.status).toBe("pending");
  });
  it("联系方式更新同步搜索，并支持同一事务读到更新值", async () => {
    const row = await create();
    const [updated] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      candidateName: "张工程师",
    });
    expect(updated?.candidateName).toBe("张工程师");
    expect(updated?.searchText).toContain("张工程师");
  });
  it("替换简历产生新版本，不修改已有评估的材料引用", async () => {
    const row = await create();
    const evaluationId = crypto.randomUUID();
    await db.insert(recruitingResumeEvaluation).values({
      artifact: { legacy: true },
      contractVersion: "legacy-unknown",
      id: evaluationId,
      organizationId: org,
      recruitingRecordId: row.id,
      resumeId: row.resumeId,
      status: "succeeded",
    });
    await db
      .update(recruitingRecord)
      .set({ currentEvaluationId: evaluationId })
      .where(eq(recruitingRecord.id, row.id));
    const [updated] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeContentHash: "replacement",
      resumeStorageKey: "replacement.pdf",
    });
    expect(updated?.resumeId).not.toBe(row.resumeId);
    expect(updated?.currentEvaluationId).toBeNull();
    const [history] = await db
      .select()
      .from(recruitingResumeEvaluation)
      .where(eq(recruitingResumeEvaluation.id, evaluationId));
    expect(history?.resumeId).toBe(row.resumeId);
  });
  it("旧重评任务不能覆盖新任务，失败仍保留成功历史", async () => {
    const row = await create();
    await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationAttemptMode: "legacy",
      resumeReviewRunId: "old",
      resumeReviewStatus: "queued",
    });
    await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationAttemptMode: "legacy",
      resumeReviewRunId: "new",
      resumeReviewStatus: "queued",
    });
    const stale = await updateRecruitingRecords(
      db,
      and(eq(read.id, row.id), eq(read.resumeReviewRunId, "old")),
      { resumeReviewError: "迟到结果", resumeReviewStatus: "failed" },
    );
    expect(stale).toEqual([]);
    const [published] = await updateRecruitingRecords(
      db,
      and(eq(read.id, row.id), eq(read.resumeReviewRunId, "new")),
      { resumeEvaluationArtifactMode: "legacy", resumeReview: review, resumeReviewStatus: "ready" },
    );
    expect(published?.currentEvaluationId).toBeTruthy();
    const currentId = published?.currentEvaluationId;
    await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationAttemptMode: "legacy",
      resumeReviewRunId: "retry",
      resumeReviewStatus: "queued",
    });
    const [failed] = await updateRecruitingRecords(
      db,
      and(eq(read.id, row.id), eq(read.resumeReviewRunId, "retry")),
      { resumeReviewError: "评估服务暂不可用", resumeReviewStatus: "failed" },
    );
    expect(failed?.currentEvaluationId).toBe(currentId);
    expect(failed?.resumeReviewStatus).toBe("failed");
    expect(failed?.resumeReview).toEqual(review);
    expect(failed?.resumeEvaluationStatus).toBeNull();
  });
  it("岗位升级取消运行时保留成功结果并拒绝迟到任务", async () => {
    const row = await create();
    const [published] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationArtifactMode: "legacy",
      resumeReview: review,
      resumeReviewRunId: "successful-before-upgrade",
      resumeReviewStatus: "ready",
    });
    await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationAttemptMode: "legacy",
      resumeReviewRunId: "obsolete-upgrade",
      resumeReviewStatus: "queued",
    });
    const [invalidated] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationAttemptMode: null,
      resumeReviewError: null,
      resumeReviewQueuedAt: null,
      resumeReviewRunId: null,
      resumeReviewStatus: "ready",
    });
    expect(invalidated?.activeEvaluationId).toBeNull();
    expect(invalidated?.currentEvaluationId).toBe(published?.currentEvaluationId);
    expect(invalidated?.resumeReview).toEqual(review);
    expect(invalidated?.resumeReviewRunId).toBe("successful-before-upgrade");
    const stale = await updateRecruitingRecords(
      db,
      and(eq(read.id, row.id), eq(read.resumeReviewRunId, "obsolete-upgrade")),
      {
        resumeEvaluationArtifactMode: "legacy",
        resumeReview: review,
        resumeReviewStatus: "ready",
      },
    );
    expect(stale).toEqual([]);
  });
  it("简历换版和删除之后旧评估任务不能重新写入或复活记录", async () => {
    const row = await create();
    await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeParseStatus: "ready",
      resumeText: "旧正文",
    });
    await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationAttemptMode: "legacy",
      resumeReviewRunId: "old-material",
      resumeReviewStatus: "queued",
    });
    const [revised] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeText: "新正文",
    });
    expect(revised?.activeEvaluationId).toBeNull();
    expect(
      await updateRecruitingRecords(
        db,
        and(eq(read.id, row.id), eq(read.resumeReviewRunId, "old-material")),
        { resumeReviewError: "late", resumeReviewStatus: "failed" },
      ),
    ).toEqual([]);
    await deleteRecruitingRecords(db, eq(read.id, row.id));
    expect(
      await updateRecruitingRecords(db, eq(read.id, row.id), {
        resumeReviewError: "later",
        resumeReviewStatus: "failed",
      }),
    ).toEqual([]);
    expect(await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, row.id))).toEqual(
      [],
    );
  });
  it("解析排队转就绪仍使用同一版本，已就绪内容修改才新建版本", async () => {
    const [queued] = await createRecruitingRecords(db, {
      candidateName: "版本测试",
      organizationId: org,
      resumeParseStatus: "queued",
      resumeStorageKey: "queued.pdf",
    });
    if (!queued) {
      throw new Error("创建失败");
    }
    const [ready] = await updateRecruitingRecords(db, eq(read.id, queued.id), {
      resumeContentHash: "hash-v1",
      resumeParseStatus: "ready",
      resumeText: "第一版正文",
    });
    expect(ready?.resumeId).toBe(queued.resumeId);
    const [revised] = await updateRecruitingRecords(db, eq(read.id, queued.id), {
      resumeText: "更正正文",
    });
    expect(revised?.resumeId).not.toBe(queued.resumeId);
    if (!queued.resumeId) {
      throw new Error("简历版本缺失");
    }
    const [history] = await db
      .select()
      .from(candidateResume)
      .where(eq(candidateResume.id, queued.resumeId));
    expect(history?.text).toBe("第一版正文");
    expect(history?.version).toBe(1);
  });
  it("排队时间立即可读，重复处理中更新保持同一尝试", async () => {
    const row = await create();
    const queuedAt = new Date("2026-09-05T00:00:00Z");
    const [queued] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationAttemptMode: "qualitative",
      resumeReviewQueuedAt: queuedAt,
      resumeReviewRunId: "queue-time",
      resumeReviewStatus: "queued",
    });
    expect(queued?.resumeReviewQueuedAt).toEqual(queuedAt);
    const [processing] = await updateRecruitingRecords(
      db,
      and(eq(read.id, row.id), eq(read.resumeReviewRunId, "queue-time")),
      { resumeReviewStatus: "processing" },
    );
    expect(processing?.activeEvaluationId).toBe(queued?.activeEvaluationId);
    expect(processing?.resumeReviewQueuedAt).toEqual(queuedAt);
  });
  it("人工筛选淘汰同时结束招聘并留下流程事件", async () => {
    const row = await create();
    const [closed] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      hrResumeAssessment: "岗位经历不匹配",
      resumeEvaluationStatus: "fail",
    });
    expect(closed).toMatchObject({
      closeReason: "resume_rejected",
      currentStage: "closed",
      outcome: "rejected",
      resumeEvaluationStatus: "fail",
    });
    const events = await db
      .select()
      .from(recruitingEvent)
      .where(eq(recruitingEvent.recruitingRecordId, row.id));
    expect(events.length).toBeGreaterThan(0);
  });
  it("直接 AI 创建明确跳过前序节点，不伪造筛选通过", async () => {
    const [row] = await createRecruitingRecords(db, {
      candidateName: "直接面试",
      organizationId: org,
      pipelineStage: "ai_interview",
    });
    if (!row) {
      throw new Error("创建失败");
    }
    expect(row.currentStage).toBe("ai_interview");
    expect(row.resumeEvaluationStatus).toBeNull();
    const [screening] = await db
      .select()
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, row.id),
          eq(recruitingNodeState.node, "screening"),
        ),
      );
    expect(screening).toMatchObject({ result: null, status: "skipped" });
  });
  it("改岗位使旧筛选失效，同时间戳的新结果仍能成为当前结果", async () => {
    const row = await create();
    const departmentId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const changedAt = new Date("2026-09-05T00:00:00Z");
    await db.insert(department).values({ id: departmentId, name: "版本部门", organizationId: org });
    await db
      .insert(jobDescription)
      .values({ departmentId, id: jobId, name: "新岗位", organizationId: org, prompt: "岗位要求" });
    const oldId = crypto.randomUUID();
    await db.insert(recruitingResumeEvaluation).values({
      artifact: { old: true },
      contractVersion: "legacy-screening",
      createdAt: changedAt,
      id: oldId,
      kind: "resume_screening",
      organizationId: org,
      recruitingRecordId: row.id,
      resumeId: row.resumeId,
      status: "succeeded",
    });
    const [changed] = await updateRecruitingRecords(db, eq(read.id, row.id), {
      jobDescriptionId: jobId,
      updatedAt: changedAt,
    });
    expect(changed?.resumeScreeningResult).toBeNull();
    expect(changed?.resumeScreeningStatus).toBe("idle");
    await db.insert(recruitingResumeEvaluation).values({
      artifact: { fresh: true },
      contractVersion: "legacy-screening",
      createdAt: changedAt,
      id: crypto.randomUUID(),
      kind: "resume_screening",
      organizationId: org,
      recruitingRecordId: row.id,
      resumeId: row.resumeId,
      status: "succeeded",
    });
    const [fresh] = await db.select().from(read).where(eq(read.id, row.id));
    expect(fresh?.resumeScreeningResult).toEqual({ fresh: true });
    const [history] = await db
      .select()
      .from(recruitingResumeEvaluation)
      .where(eq(recruitingResumeEvaluation.id, oldId));
    expect(history?.artifact).toEqual({ old: true });
  });
  it("普通资料更新不能绕过流程推进检查", async () => {
    const row = await create();
    await expect(
      updateRecruitingRecords(db, eq(read.id, row.id), { pipelineStage: "offer" }),
    ).rejects.toThrow("流程变化");
  });
  it("删除新记录解除评估循环引用，保留同ID旧源记录", async () => {
    const row = await create();
    // 专门验证迁移源保护，旧表 fixture 只存在于隔离库。
    await db
      .insert(studioInterview)
      .values({ candidateName: "旧源快照", id: row.id, organizationId: org });
    await updateRecruitingRecords(db, eq(read.id, row.id), {
      resumeEvaluationArtifactMode: "legacy",
      resumeReview: review,
      resumeReviewStatus: "ready",
    });
    expect(await deleteRecruitingRecords(db, eq(read.id, row.id))).toEqual([{ id: row.id }]);
    expect(await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, row.id))).toEqual(
      [],
    );
    const [source] = await db.select().from(studioInterview).where(eq(studioInterview.id, row.id));
    expect(source?.candidateName).toBe("旧源快照");
    expect(
      await updateRecruitingRecords(db, eq(read.id, row.id), {
        resumeReviewError: "迟到任务",
        resumeReviewStatus: "failed",
      }),
    ).toEqual([]);
  });
});
