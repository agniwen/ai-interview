import { and, count, desc, eq, exists, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type {
  DashboardActivityRow,
  DashboardActionItem,
  RecruitingDashboardMetrics,
} from "@arc/shared/studio-dashboard";
import {
  candidateFormSubmission,
  department,
  interviewNotification,
  jobDescription,
  studioHumanInterviewRound,
  studioInterview,
  studioInterviewSchedule,
  studioOfferDraft,
} from "@arc/db-schema/schema";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
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

function makeLookbackStart(days = DAILY_LOOKBACK_DAYS) {
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

function buildZeroActivityRows(): DashboardActivityRow[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rows: DashboardActivityRow[] = [];
  for (let i = DAILY_LOOKBACK_DAYS - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    rows.push({
      aiCompleted: 0,
      day: day.toISOString().slice(0, 10),
      humanCompleted: 0,
      offersSent: 0,
      resumesAdded: 0,
    });
  }
  return rows;
}

function mergeDailyCounts(
  rows: DashboardActivityRow[],
  key: keyof Omit<DashboardActivityRow, "day">,
  counts: { count: number; day: string }[],
) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  for (const row of counts) {
    const target = byDay.get(row.day);
    if (target) {
      target[key] = row.count;
    }
  }
}

async function loadDailyCountByDateExpr({
  dayExpr,
  from,
  where,
}: {
  dayExpr: ReturnType<typeof sql<string>>;
  from:
    | typeof candidateFormSubmission
    | typeof studioHumanInterviewRound
    | typeof studioInterview
    | typeof studioInterviewSchedule
    | typeof studioOfferDraft;
  where: ReturnType<typeof and> | ReturnType<typeof eq>;
}) {
  const rows = await db
    .select({
      count: count(),
      day: dayExpr,
    })
    .from(from)
    .where(where)
    .groupBy(dayExpr)
    .orderBy(dayExpr);
  return rows.map((row) => ({ count: row.count, day: row.day }));
}

async function loadDashboardActivity(organizationId: string) {
  const since = makeLookbackStart();
  const rows = buildZeroActivityRows();

  const resumeDay = sql<string>`to_char(date_trunc('day', ${studioInterview.createdAt}), 'YYYY-MM-DD')`;
  const aiDay = sql<string>`to_char(date_trunc('day', ${studioInterviewSchedule.updatedAt}), 'YYYY-MM-DD')`;
  const humanDay = sql<string>`to_char(date_trunc('day', ${studioHumanInterviewRound.completedAt}), 'YYYY-MM-DD')`;
  const offerDay = sql<string>`to_char(date_trunc('day', ${studioOfferDraft.sentAt}), 'YYYY-MM-DD')`;
  const formDay = sql<string>`to_char(date_trunc('day', ${candidateFormSubmission.submittedAt}), 'YYYY-MM-DD')`;

  const [resumeRows, aiRows, humanRows, offerRows, formRows] = await Promise.all([
    loadDailyCountByDateExpr({
      dayExpr: resumeDay,
      from: studioInterview,
      where: and(
        eq(studioInterview.organizationId, organizationId),
        gte(studioInterview.createdAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: aiDay,
      from: studioInterviewSchedule,
      where: and(
        eq(studioInterviewSchedule.organizationId, organizationId),
        eq(studioInterviewSchedule.status, "completed"),
        gte(studioInterviewSchedule.updatedAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: humanDay,
      from: studioHumanInterviewRound,
      where: and(
        eq(studioHumanInterviewRound.organizationId, organizationId),
        isNotNull(studioHumanInterviewRound.completedAt),
        gte(studioHumanInterviewRound.completedAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: offerDay,
      from: studioOfferDraft,
      where: and(
        eq(studioOfferDraft.organizationId, organizationId),
        isNotNull(studioOfferDraft.sentAt),
        gte(studioOfferDraft.sentAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: formDay,
      from: candidateFormSubmission,
      where: and(
        eq(candidateFormSubmission.organizationId, organizationId),
        gte(candidateFormSubmission.submittedAt, since),
      ),
    }),
  ]);

  mergeDailyCounts(rows, "resumesAdded", resumeRows);
  mergeDailyCounts(rows, "aiCompleted", aiRows);
  mergeDailyCounts(rows, "humanCompleted", humanRows);
  mergeDailyCounts(rows, "offersSent", offerRows);

  return {
    rows,
    summary: {
      aiCompleted30d: aiRows.reduce((sum, row) => sum + row.count, 0),
      formsSubmitted30d: formRows.reduce((sum, row) => sum + row.count, 0),
      humanCompleted30d: humanRows.reduce((sum, row) => sum + row.count, 0),
      offersSent30d: offerRows.reduce((sum, row) => sum + row.count, 0),
    },
  };
}

async function loadActionItems(organizationId: string): Promise<DashboardActionItem[]> {
  const [candidateRow] = await db
    .select({
      screening:
        sql<number>`COUNT(*) FILTER (WHERE ${studioInterview.pipelineStage} = 'screening' AND ${studioInterview.outcome} = 'in_pipeline')`.mapWith(
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

  const [aiRow] = await db
    .select({
      interrupted:
        sql<number>`COUNT(*) FILTER (WHERE ${studioInterviewSchedule.status} = 'interrupted')`.mapWith(
          Number,
        ),
      pending:
        sql<number>`COUNT(*) FILTER (WHERE ${studioInterviewSchedule.status} = 'pending')`.mapWith(
          Number,
        ),
    })
    .from(studioInterviewSchedule)
    .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
    .where(
      and(
        eq(studioInterviewSchedule.organizationId, organizationId),
        eq(studioInterview.pipelineStage, "ai_interview"),
      ),
    );

  const [humanRow] = await db
    .select({
      pending:
        sql<number>`COUNT(*) FILTER (WHERE ${studioHumanInterviewRound.status} = 'pending')`.mapWith(
          Number,
        ),
    })
    .from(studioHumanInterviewRound)
    .innerJoin(studioInterview, eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId))
    .where(
      and(
        eq(studioHumanInterviewRound.organizationId, organizationId),
        eq(studioInterview.pipelineStage, "human_interview"),
      ),
    );

  const [offerRow] = await db
    .select({
      sent: sql<number>`COUNT(*) FILTER (WHERE ${studioOfferDraft.status} = 'sent')`.mapWith(
        Number,
      ),
    })
    .from(studioOfferDraft)
    .where(eq(studioOfferDraft.organizationId, organizationId));

  const [notificationRow] = await db
    .select({
      failed:
        sql<number>`COUNT(*) FILTER (WHERE ${interviewNotification.status} = 'failed')`.mapWith(
          Number,
        ),
    })
    .from(interviewNotification)
    .where(eq(interviewNotification.organizationId, organizationId));

  return [
    {
      count: candidateRow?.screening ?? 0,
      description: "还停留在简历筛选阶段的候选人",
      key: "screening",
      label: "待筛选简历",
      severity: "warning",
    },
    {
      count: aiRow?.pending ?? 0,
      description: "AI 面试阶段中尚未开始的轮次",
      key: "ai_pending",
      label: "AI 面试待进场",
      severity: "info",
    },
    {
      count: aiRow?.interrupted ?? 0,
      description: "候选人断连或通话被中断的 AI 轮次",
      key: "ai_interrupted",
      label: "AI 面试中断",
      severity: "danger",
    },
    {
      count: humanRow?.pending ?? 0,
      description: "真人复面阶段中待完成的轮次",
      key: "human_pending",
      label: "真人复面待处理",
      severity: "warning",
    },
    {
      count: offerRow?.sent ?? 0,
      description: "已发送但候选人尚未响应的 Offer",
      key: "offer_sent",
      label: "Offer 待响应",
      severity: "warning",
    },
    {
      count: notificationRow?.failed ?? 0,
      description: "报告通知发送失败，需要重试或人工跟进",
      key: "notification_failed",
      label: "通知失败",
      severity: "danger",
    },
  ];
}

async function loadJobPipeline(organizationId: string) {
  const totalExpr = sql<number>`COUNT(*)`.mapWith(Number);
  const rows = await db
    .select({
      aiInterview:
        sql<number>`COUNT(*) FILTER (WHERE ${studioInterview.pipelineStage} = 'ai_interview')`.mapWith(
          Number,
        ),
      departmentName: department.name,
      humanInterview:
        sql<number>`COUNT(*) FILTER (WHERE ${studioInterview.pipelineStage} = 'human_interview')`.mapWith(
          Number,
        ),
      id: jobDescription.id,
      name: jobDescription.name,
      offer:
        sql<number>`COUNT(*) FILTER (WHERE ${studioInterview.pipelineStage} = 'offer')`.mapWith(
          Number,
        ),
      screening:
        sql<number>`COUNT(*) FILTER (WHERE ${studioInterview.pipelineStage} = 'screening')`.mapWith(
          Number,
        ),
      total: totalExpr,
    })
    .from(studioInterview)
    .innerJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .leftJoin(
      department,
      and(
        eq(jobDescription.departmentId, department.id),
        eq(department.organizationId, studioInterview.organizationId),
      ),
    )
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        ne(studioInterview.outcome, "archived"),
      ),
    )
    .groupBy(jobDescription.id, jobDescription.name, department.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(8);

  return rows;
}

async function loadOfferStatuses(organizationId: string) {
  const rows = await db
    .select({
      count: count(),
      status: studioOfferDraft.status,
    })
    .from(studioOfferDraft)
    .where(eq(studioOfferDraft.organizationId, organizationId))
    .groupBy(studioOfferDraft.status);
  return rows.map((row) => ({ count: row.count, status: row.status }));
}

export async function loadRecruitingDashboardMetrics(
  organizationId: string,
): Promise<RecruitingDashboardMetrics> {
  const [resume, actions, activity, jobPipeline, offerStatuses] = await Promise.all([
    queryResumeLibraryMetrics(organizationId),
    loadActionItems(organizationId),
    loadDashboardActivity(organizationId),
    loadJobPipeline(organizationId),
    loadOfferStatuses(organizationId),
  ]);

  return {
    actions,
    activity: activity.rows,
    jobPipeline,
    offerStatuses,
    resume,
    summary: activity.summary,
  };
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
