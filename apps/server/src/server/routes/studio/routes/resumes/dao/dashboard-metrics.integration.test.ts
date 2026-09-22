import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { closeRecruitingRecordTx } from "@app/database/recruiting-pipeline";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  aiInterviewRound,
  candidate,
  department,
  humanInterviewRound,
  jobDescription,
  organization,
  recruitingOffer,
  user,
} from "@app/db-schema/schema";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import { loadRecruitingDashboardMetrics } from "./metrics";
import { queryPaginatedResumeRecords } from "./resumes";

const url = process.env.RECRUITING_TEST_DATABASE_URL;
if (url && (url !== process.env.DATABASE_URL || !new URL(url).pathname.includes("_test_"))) {
  throw new Error("数据看板测试仅可在隔离库执行");
}

const org = `dashboard-${crypto.randomUUID()}`;
const creatorA = `${org}-creator-a`;
const creatorB = `${org}-creator-b`;
const departmentId = `${org}-department`;
const jobIds = {
  active: `${org}-job-active`,
  paused: `${org}-job-paused`,
  stopped: `${org}-job-stopped`,
} as const;
const recordIds = {
  ai: `${org}-ai`,
  archived: `${org}-archived`,
  hired: `${org}-hired`,
  onboarding: `${org}-onboarding`,
  second: `${org}-second`,
} as const;
const allRecordIds = Object.values(recordIds);

describe.skipIf(!url)("招聘数据看板聚合", () => {
  beforeAll(async () => {
    await db.insert(user).values([
      { email: `${creatorA}@example.test`, id: creatorA, name: "甲 HR" },
      { email: `${creatorB}@example.test`, id: creatorB, name: "乙 HR", remark: "复面组" },
    ]);
    await db.insert(organization).values({ id: org, name: org, slug: org });
    await db.insert(department).values({
      id: departmentId,
      name: "研发部",
      organizationId: org,
    });
    await db.insert(jobDescription).values([
      {
        departmentId,
        headcount: 3,
        id: jobIds.active,
        lifecycleStatus: "published",
        name: "招聘中岗位",
        organizationId: org,
        prompt: "招聘中",
        recruitingStatus: "active",
      },
      {
        departmentId,
        headcount: 4,
        id: jobIds.paused,
        lifecycleStatus: "published",
        name: "暂停岗位",
        organizationId: org,
        prompt: "已暂停",
        recruitingStatus: "paused",
      },
      {
        departmentId,
        headcount: 5,
        id: jobIds.stopped,
        lifecycleStatus: "published",
        name: "停止岗位",
        organizationId: org,
        prompt: "已停止",
        recruitingStatus: "stopped",
      },
    ]);
    await createRecruitingRecords(db, [
      {
        candidateName: "已归档候选人",
        createdBy: creatorB,
        id: recordIds.archived,
        organizationId: org,
        outcome: "archived",
        pipelineStage: "closed",
      },
      {
        candidateName: "AI 阶段候选人",
        createdBy: creatorA,
        id: recordIds.ai,
        organizationId: org,
        pipelineStage: "ai_interview",
      },
      {
        candidateName: "复面阶段候选人",
        createdBy: creatorB,
        id: recordIds.second,
        organizationId: org,
        pipelineStage: "second_interview",
      },
      {
        candidateName: "待入职候选人",
        createdBy: creatorA,
        id: recordIds.onboarding,
        organizationId: org,
        pipelineStage: "onboarding",
      },
      {
        candidateName: "已入职候选人",
        createdBy: creatorA,
        id: recordIds.hired,
        organizationId: org,
        pipelineStage: "onboarding",
      },
    ]);
    await db.transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        closeReason: "onboarded",
        operatorId: creatorA,
        organizationId: org,
        outcome: "hired",
        recordId: recordIds.hired,
      }),
    );
    await db.insert(aiInterviewRound).values({
      id: `${org}-active-ai`,
      organizationId: org,
      recruitingRecordId: recordIds.ai,
      roundLabel: "待开始 AI 面试",
      sortOrder: 0,
      status: "pending",
    });
    await db.insert(humanInterviewRound).values({
      format: "online",
      id: `${org}-active-human`,
      label: "待处理真人复面",
      organizationId: org,
      recruitingRecordId: recordIds.second,
      roundKind: "second_interview",
      status: "pending",
    });
    await db.insert(aiInterviewRound).values({
      id: `${org}-archived-ai`,
      organizationId: org,
      recruitingRecordId: recordIds.archived,
      roundLabel: "归档 AI 面试",
      sortOrder: 0,
      status: "completed",
    });
    await db.insert(humanInterviewRound).values({
      completedAt: new Date(),
      format: "online",
      id: `${org}-archived-human`,
      label: "归档真人复面",
      organizationId: org,
      recruitingRecordId: recordIds.archived,
      roundKind: "second_interview",
      status: "completed",
    });
    await db.insert(recruitingOffer).values({
      baseSalary: 30_000,
      id: `${org}-archived-offer`,
      organizationId: org,
      position: "归档岗位",
      recruitingRecordId: recordIds.archived,
      sentAt: new Date(),
      status: "sent",
      version: 1,
    });
  }, 120_000);

  afterAll(async () => {
    await deleteRecruitingRecords(db, inArray(recruitingRecordReadModel.id, allRecordIds));
    await db.delete(candidate).where(eq(candidate.organizationId, org));
    await db.delete(jobDescription).where(eq(jobDescription.organizationId, org));
    await db.delete(department).where(eq(department.organizationId, org));
    await db.delete(organization).where(eq(organization.id, org));
    await db.delete(user).where(inArray(user.id, [creatorA, creatorB]));
  }, 120_000);

  it("按累计进入下一环节生成单调漏斗", async () => {
    const metrics = await loadRecruitingDashboardMetrics(org);

    expect(metrics.cumulativeFunnel).toEqual({
      enteredInterview: 4,
      enteredOffer: 2,
      enteredSecondInterview: 3,
      hired: 1,
      resumesAdded: 4,
    });
  });

  it("在招岗位和岗位缺口仅统计招聘中岗位", async () => {
    const metrics = await loadRecruitingDashboardMetrics(org);

    expect(metrics.summary.activeJobs).toBe(1);
    expect(metrics.summary.vacancies).toBe(3);
    expect(metrics.summary.unconfiguredHeadcount).toBe(0);
    expect(metrics.vacancies).toEqual([
      expect.objectContaining({
        gap: 3,
        headcount: 3,
        id: jobIds.active,
        name: "招聘中岗位",
      }),
    ]);
  });

  it("按招聘记录创建人汇总 HR 招聘进展", async () => {
    const metrics = await loadRecruitingDashboardMetrics(org);

    expect(
      metrics.recruiterProgress.map((row) => ({
        name: row.userName,
        remark: row.userRemark,
        total: row.total,
      })),
    ).toEqual([
      { name: "甲 HR", remark: null, total: 3 },
      { name: "乙 HR", remark: "复面组", total: 1 },
    ]);
  });

  it("从活动、Offer 状态和汇总中排除已归档候选人", async () => {
    const metrics = await loadRecruitingDashboardMetrics(org);

    expect(metrics.activity.reduce((sum, row) => sum + row.resumesAdded, 0)).toBe(4);
    expect(metrics.summary.aiCompleted30d).toBe(0);
    expect(metrics.summary.humanCompleted30d).toBe(0);
    expect(metrics.summary.offersSent30d).toBe(0);
    expect(metrics.offerStatuses).toEqual([]);
  });

  it("让待办数量和跳转后的候选人数量保持一致", async () => {
    const metrics = await loadRecruitingDashboardMetrics(org);
    const aiPending = await queryPaginatedResumeRecords(org, { dashboardAction: "ai_pending" });
    const humanPending = await queryPaginatedResumeRecords(org, {
      dashboardAction: "human_pending",
    });

    expect(metrics.actions.find((item) => item.key === "ai_pending")?.count).toBe(aiPending.total);
    expect(metrics.actions.find((item) => item.key === "human_pending")?.count).toBe(
      humanPending.total,
    );
    expect(aiPending.records.map((record) => record.id)).toEqual([recordIds.ai]);
    expect(humanPending.records.map((record) => record.id)).toEqual([recordIds.second]);
  });
});
