import process from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq } from "drizzle-orm";
import postgres from "postgres";
import {
  candidate,
  candidateResume,
  organization,
  recruitingNodeState,
  recruitingRecord,
  recruitingResumeEvaluation,
} from "@app/db-schema/schema";
import { createDatabase } from "./index";
import type { Database } from "./index";
import {
  createRecruitingReadModel,
  recruitingRecordReadModel as read,
} from "./recruiting-read-model";

// 必须显式提供隔离测试库；不会读取应用的 DATABASE_URL 或 .env。
const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
const at = new Date("2026-09-01T10:00:00.000Z");
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

describe.skipIf(!testUrl)("新招聘只读投影（PostgreSQL）", () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;

  beforeAll(() => {
    if (!testUrl || !new URL(testUrl).pathname.includes("_test_")) {
      throw new Error("招聘投影测试必须使用名称包含 _test_ 的独立数据库");
    }
    client = postgres(testUrl, { max: 1 });
    db = createDatabase(client);
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  async function withFixture(
    run: (
      tx: Transaction,
      ids: { org: string; person: string; record: string; resume: string },
    ) => Promise<void>,
  ) {
    const prefix = `recruiting-read-${crypto.randomUUID()}`;
    const ids = {
      org: prefix,
      person: `${prefix}-person`,
      record: `${prefix}-record`,
      resume: `${prefix}-resume`,
    };
    const rollback = new Error("fixture rollback");
    try {
      await db.transaction(async (tx) => {
        await tx.insert(organization).values({ id: ids.org, name: "招聘投影测试", slug: ids.org });
        await tx.insert(candidate).values({
          email: "test@example.test",
          id: ids.person,
          name: "张三",
          organizationId: ids.org,
        });
        await tx.insert(candidateResume).values({
          candidateId: ids.person,
          id: ids.resume,
          organizationId: ids.org,
          parseStatus: "ready",
          parsedAt: at,
          searchCjkBigrams: ["中文"],
          skillsNormalized: ["typescript", "中文"],
          text: "原简历",
          version: 1,
        });
        await tx.insert(recruitingRecord).values({
          candidateId: ids.person,
          id: ids.record,
          organizationId: ids.org,
          resumeId: ids.resume,
        });
        await tx.insert(recruitingNodeState).values({
          node: "screening",
          organizationId: ids.org,
          recruitingRecordId: ids.record,
          status: "pending",
        });
        await run(tx, ids);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) {
        throw error;
      }
    }
  }

  it("正确解析字段类型，并支持尚无简历的直接面试记录", async () => {
    await withFixture(async (tx, ids) => {
      const [row] = await tx.select().from(read).where(eq(read.id, ids.record));
      expect(row).toMatchObject({
        candidateId: ids.person,
        candidateName: "张三",
        resumeId: ids.resume,
        resumeParsedAt: at,
        resumeReviewStatus: "idle",
        searchCjkBigrams: ["中文"],
        skillsNormalized: ["typescript", "中文"],
        status: "pending",
      });
      expect(row.createdAt).toBeInstanceOf(Date);
      await tx
        .update(recruitingRecord)
        .set({ resumeId: null })
        .where(eq(recruitingRecord.id, ids.record));
      const [empty] = await tx.select().from(read).where(eq(read.id, ids.record));
      expect(empty).toMatchObject({
        interviewQuestions: [],
        resumeId: null,
        resumeParseStatus: "unparsed",
        resumeParsedAt: null,
        resumeText: null,
        skillsNormalized: [],
      });
    });
  });

  it("失败重评保留成功内容，同时展示失败尝试，AI 推荐不改变人工筛选", async () => {
    await withFixture(async (tx, ids) => {
      const artifact = { overall: { recommendation: "推荐" }, schemaVersion: 2 };
      await tx.insert(recruitingResumeEvaluation).values([
        {
          artifact,
          completedAt: at,
          contractVersion: "qualitative-v2",
          id: `${ids.record}-success`,
          organizationId: ids.org,
          recruitingRecordId: ids.record,
          status: "succeeded",
        },
        {
          contractVersion: "qualitative-v2",
          errorMessage: "重评失败",
          id: `${ids.record}-failed`,
          organizationId: ids.org,
          recruitingRecordId: ids.record,
          runId: "new-run",
          startedAt: at,
          status: "failed",
        },
      ]);
      await tx
        .update(recruitingRecord)
        .set({
          activeEvaluationId: `${ids.record}-failed`,
          currentEvaluationId: `${ids.record}-success`,
        })
        .where(eq(recruitingRecord.id, ids.record));
      const [row] = await tx.select().from(read).where(eq(read.id, ids.record));
      expect(row).toMatchObject({
        qualitativeResumeEvaluation: artifact,
        resumeEvaluationArtifactMode: "qualitative",
        resumeEvaluationAttemptMode: "qualitative",
        resumeEvaluationStatus: null,
        resumeReviewError: "重评失败",
        resumeReviewGeneratedAt: at,
        resumeReviewQueuedAt: at,
        resumeReviewRunId: "new-run",
        resumeReviewStatus: "failed",
      });
      expect(row.structuredCompositeScore).toBeNull();
    });
  });

  it("筛选历史不扩大列表行数，同名投影可以安全自关联", async () => {
    await withFixture(async (tx, ids) => {
      await tx.insert(recruitingResumeEvaluation).values([
        {
          artifact: { passed: true },
          contractVersion: "legacy-screening-v1",
          createdAt: at,
          id: `${ids.record}-old`,
          kind: "resume_screening",
          organizationId: ids.org,
          recruitingRecordId: ids.record,
          resumeId: ids.resume,
          status: "succeeded",
        },
        {
          contractVersion: "legacy-screening-v1",
          createdAt: new Date(at.getTime() + 1),
          errorMessage: "规则筛选失败",
          id: `${ids.record}-new`,
          kind: "resume_screening",
          organizationId: ids.org,
          recruitingRecordId: ids.record,
          resumeId: ids.resume,
          status: "failed",
        },
      ]);
      const [row] = await tx.select().from(read).where(eq(read.id, ids.record));
      expect(row).toMatchObject({
        resumeEvaluationStatus: null,
        resumeScreeningError: "规则筛选失败",
        resumeScreeningResult: { passed: true },
        resumeScreeningStatus: "failed",
      });
      const [countRow] = await tx
        .select({ total: count() })
        .from(read)
        .where(eq(read.organizationId, ids.org));
      expect(countRow.total).toBe(1);
      const duplicate = createRecruitingReadModel("duplicate_record");
      const joined = await tx
        .select({ duplicate: duplicate.id, id: read.id })
        .from(read)
        .innerJoin(duplicate, eq(read.id, duplicate.id))
        .where(eq(read.organizationId, ids.org));
      expect(joined).toEqual([{ duplicate: ids.record, id: ids.record }]);
      await tx
        .update(recruitingRecord)
        .set({ resumeId: null })
        .where(eq(recruitingRecord.id, ids.record));
      const [changedResume] = await tx.select().from(read).where(eq(read.id, ids.record));
      expect(changedResume).toMatchObject({
        resumeScreeningError: null,
        resumeScreeningResult: null,
        resumeScreeningStatus: "idle",
      });
    });
  });

  it("结束显示原节点结果，回退后当前结果立即失效", async () => {
    await withFixture(async (tx, ids) => {
      await tx
        .update(recruitingRecord)
        .set({
          closeDetails: { legacyClosedReason: "旧结束备注", previousStage: "human_interview" },
          closeReason: "resume_rejected",
          closedAt: at,
          closedFromNode: "screening",
          currentStage: "closed",
          outcome: "rejected",
        })
        .where(eq(recruitingRecord.id, ids.record));
      await tx
        .update(recruitingNodeState)
        .set({ result: "fail", status: "completed" })
        .where(eq(recruitingNodeState.recruitingRecordId, ids.record));
      const [closed] = await tx.select().from(read).where(eq(read.id, ids.record));
      expect(closed).toMatchObject({
        closeDetails: { legacyClosedReason: "旧结束备注", previousStage: "human_interview" },
        closedMeta: { legacyClosedReason: "旧结束备注", previousStage: "screening" },
        closedReason: "旧结束备注",
        currentStage: "closed",
        pipelineStage: "closed",
        result: "fail",
        resumeEvaluationStatus: "fail",
        status: "completed",
      });
      await tx
        .update(recruitingRecord)
        .set({
          closeDetails: null,
          closeReason: null,
          closedAt: null,
          closedFromNode: null,
          currentStage: "screening",
          outcome: "in_pipeline",
        })
        .where(eq(recruitingRecord.id, ids.record));
      await tx
        .update(recruitingNodeState)
        .set({ result: null, status: "pending" })
        .where(eq(recruitingNodeState.recruitingRecordId, ids.record));
      const [reopened] = await tx.select().from(read).where(eq(read.id, ids.record));
      expect(reopened).toMatchObject({
        currentStage: "screening",
        result: null,
        resumeEvaluationStatus: null,
        status: "pending",
      });
    });
  });

  it("历史结构化评分从当前 artifact 派生，可直接用于 SQL 筛选", async () => {
    await withFixture(async (tx, ids) => {
      const artifact = {
        calculations: { compositeScore: 81 },
        gates: { effectiveStatus: "needs_verification" },
        grade: "B",
        schemaVersion: 1,
      };
      await tx.insert(recruitingResumeEvaluation).values({
        artifact,
        contractVersion: "structured-v1:engine=1:prompt=1",
        id: `${ids.record}-structured`,
        numericScore: 81,
        organizationId: ids.org,
        recruitingRecordId: ids.record,
        status: "succeeded",
      });
      await tx
        .update(recruitingRecord)
        .set({ currentEvaluationId: `${ids.record}-structured` })
        .where(eq(recruitingRecord.id, ids.record));
      const matches = await tx
        .select()
        .from(read)
        .where(
          and(
            eq(read.organizationId, ids.org),
            eq(read.structuredGateStatus, "needs_verification"),
          ),
        );
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        resumeReviewStatus: "ready",
        structuredCompositeScore: 81,
        structuredGateSortRank: 1,
        structuredGateStatus: "needs_verification",
        structuredResumeEvaluation: artifact,
        structuredScoreGrade: "B",
      });
    });
  });
});
