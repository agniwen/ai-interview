import "server-only";

import { and, count, eq, exists, gte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import type { ResumeLibraryMetrics } from "@/lib/shared/studio-resumes";
import type { CandidateOutcome, PipelineStage } from "@arc/db-schema/studio-interviews";

// 近 N 天的窗口宽度，与 UI 卡片标题保持一致。
// Lookback window used by the 「近 N 天每日新增」 chart.
const DAILY_LOOKBACK_DAYS = 30;

// 子查询：该候选人是否已有任意 AI 面试轮次。与 dao/resumes.ts 里的版本同形——
// 这里独立一份避免相互 import 循环，并让聚合查询自包含。
// Subquery: whether the candidate already has any AI interview round. Mirrors
// the one in dao/resumes.ts; duplicated to keep this metrics module standalone.
const hasInterviewRoundsSql = exists(
  db
    .select({ one: studioInterviewSchedule.id })
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, studioInterview.id)),
);

async function loadByPipeline(organizationId: string) {
  // 漏斗分布：按 (pipelineStage, outcome) 分桶；outcome='archived' 排除，避免
  // 冷藏长尾压扁主流程展示。其他 closed outcome（hired / rejected / withdrawn）保留。
  // Pipeline funnel: bucket by (pipelineStage, outcome); archived outcomes are
  // excluded so cold-storage long-tail doesn't crush the live funnel.
  const rows = await db
    .select({
      count: count(),
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        ne(studioInterview.outcome, "archived"),
      ),
    )
    .groupBy(studioInterview.pipelineStage, studioInterview.outcome);

  return rows.map((row) => ({
    count: row.count,
    outcome: row.outcome as CandidateOutcome,
    stage: row.pipelineStage as PipelineStage,
  }));
}

async function loadDailyAdded(organizationId: string) {
  // Postgres date_trunc → date 截断到天；窗口取 [today - 29, today]，共 30 天。
  // 服务端只返回非零日；前端零填充以维持 X 轴连续。
  // Truncate created_at to day; window is [today - 29, today] (30 days total).
  // Only non-zero days are returned; the client zero-fills for X-axis continuity.
  const since = new Date(Date.now() - (DAILY_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const dayExpr = sql<string>`to_char(date_trunc('day', ${studioInterview.createdAt}), 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      count: count(),
      day: dayExpr,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        gte(studioInterview.createdAt, since),
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  return rows.map((row) => ({ count: row.count, day: row.day }));
}

async function loadConversion(organizationId: string) {
  // 把"已发起 AI 面试 vs 未发起"压成两个 count，archived 排除。
  // FILTER 表达式拿 hasInterviewRoundsSql 直接复用为布尔条件。
  // Pack "launched vs not launched" into two parallel counts in a single query;
  // archived rows are excluded so the conversion ratio reflects the live pool.
  const [row] = await db
    .select({
      withInterview: sql<number>`COUNT(*) FILTER (WHERE ${hasInterviewRoundsSql})`.mapWith(Number),
      withoutInterview: sql<number>`COUNT(*) FILTER (WHERE NOT ${hasInterviewRoundsSql})`.mapWith(
        Number,
      ),
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        ne(studioInterview.outcome, "archived"),
      ),
    );

  return {
    withInterview: row?.withInterview ?? 0,
    withoutInterview: row?.withoutInterview ?? 0,
  };
}

async function queryResumeLibraryMetrics(organizationId: string): Promise<ResumeLibraryMetrics> {
  const [byPipeline, dailyAdded, conversion] = await Promise.all([
    loadByPipeline(organizationId),
    loadDailyAdded(organizationId),
    loadConversion(organizationId),
  ]);
  return { byPipeline, conversion, dailyAdded };
}

/**
 * 简历库聚合数据的缓存入口。三段并发查询：状态分布 / 近 30 天每日新增 / AI 面试转化。
 * cacheTag 与现有列表查询一致（`studio-resumes`），写入侧的 invalidate 已经覆盖。
 *
 * Cached entry point used by the resume-library page header charts. Three
 * concurrent queries: status distribution, daily new rows over the last 30
 * days, and AI-interview conversion. Shares the `studio-resumes` cache tag
 * with the list query so existing invalidation hooks already cover it.
 */
export function loadResumeLibraryMetrics(organizationId: string): Promise<ResumeLibraryMetrics> {
  return queryResumeLibraryMetrics(organizationId);
}

// 暴露给测试做精确断言（绕开 cache 包装）。
// Exposed for tests so they can assert on the raw query results.
export { queryResumeLibraryMetrics };
