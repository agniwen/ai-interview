import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, count, desc, eq, exists, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { startOfBeijingDay, toBeijingCalendarDate } from "@app/shared/beijing-calendar";
import type {
  DashboardActivityRow,
  DashboardActionItem,
  RecruitingDashboardMetrics,
} from "@app/shared/studio-dashboard";
import {
  recruitingFormSubmission,
  department,
  recruitingNotificationDelivery,
  jobDescription,
  humanInterviewRound,
  aiInterviewRound,
  recruitingOffer,
  user,
} from "@app/db-schema/schema";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";
import { candidateOutcomeSchema, pipelineStageSchema } from "@app/db-schema/studio-interviews";

// Dashboard activity uses 30 days; resume-library uploader rankings keep a
// full-year daily window so all supported client-side ranges share one payload.
const DASHBOARD_LOOKBACK_DAYS = 30;
const DAILY_ADDED_LOOKBACK_DAYS = 365;

// 子查询：该候选人是否已有任意 AI 面试轮次。与 dao/resumes.ts 里的版本同形——
// 这里独立一份避免相互 import 循环，并让聚合查询自包含。
// Subquery: whether the candidate already has any AI interview round. Mirrors
// the one in dao/resumes.ts; duplicated to keep this metrics module standalone.
const hasInterviewRoundsSql = exists(
  db
    .select({ one: aiInterviewRound.id })
    .from(aiInterviewRound)
    .where(eq(aiInterviewRound.recruitingRecordId, recruitingRecordReadModel.id)),
);

function resumeMetricsOrgFilters(organizationId: string, createdByUserId?: string) {
  return and(
    eq(recruitingRecordReadModel.organizationId, organizationId),
    createdByUserId ? eq(recruitingRecordReadModel.createdBy, createdByUserId) : undefined,
  );
}

async function loadByPipeline(organizationId: string, createdByUserId?: string) {
  // 漏斗分布：按 (pipelineStage, outcome) 分桶；outcome='archived' 排除，避免
  // 冷藏长尾压扁主流程展示。其他 closed outcome（hired / rejected / withdrawn）保留。
  // Pipeline funnel: bucket by (pipelineStage, outcome); archived outcomes are
  // excluded so cold-storage long-tail doesn't crush the live funnel.
  const rows = await db
    .select({
      count: count(),
      outcome: recruitingRecordReadModel.outcome,
      pipelineStage: recruitingRecordReadModel.pipelineStage,
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        resumeMetricsOrgFilters(organizationId, createdByUserId),
        ne(recruitingRecordReadModel.outcome, "archived"),
      ),
    )
    .groupBy(recruitingRecordReadModel.pipelineStage, recruitingRecordReadModel.outcome);

  return rows.map((row) => ({
    count: row.count,
    outcome: candidateOutcomeSchema.parse(row.outcome),
    stage: pipelineStageSchema.parse(row.pipelineStage),
  }));
}

async function loadDailyAdded(
  organizationId: string,
  createdByUserId?: string,
): Promise<ResumeLibraryMetrics["dailyAdded"]> {
  // Truncate created_at to day and group by day + uploader. The client combines
  // these rows into today / yesterday / current-week / current-month rankings.
  const since = startOfBeijingDay(
    new Date(Date.now() - (DAILY_ADDED_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000),
  );

  const dayExpr = sql<string>`to_char(date_trunc('day', ${recruitingRecordReadModel.createdAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      count: count(),
      day: dayExpr,
      userId: recruitingRecordReadModel.createdBy,
      userImage: user.image,
      userName: user.name,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(user, eq(user.id, recruitingRecordReadModel.createdBy))
    .where(
      and(
        resumeMetricsOrgFilters(organizationId, createdByUserId),
        gte(recruitingRecordReadModel.createdAt, since),
      ),
    )
    .groupBy(dayExpr, recruitingRecordReadModel.createdBy, user.image, user.name)
    .orderBy(dayExpr);

  const byDay = new Map<
    string,
    { byUser: ResumeLibraryMetrics["dailyAdded"][number]["byUser"]; count: number; day: string }
  >();

  for (const row of rows) {
    const existing = byDay.get(row.day) ?? { byUser: [], count: 0, day: row.day };
    existing.count += row.count;
    existing.byUser.push({
      count: row.count,
      userId: row.userId ?? "unknown",
      userImage: row.userImage,
      userName: row.userName?.trim() || "未知用户",
    });
    byDay.set(row.day, existing);
  }

  return [...byDay.values()]
    .toSorted((left, right) => left.day.localeCompare(right.day))
    .map((row) => ({
      byUser: row.byUser.toSorted((left, right) => right.count - left.count),
      count: row.count,
      day: row.day,
    }));
}

async function loadConversion(organizationId: string, createdByUserId?: string) {
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
    .from(recruitingRecordReadModel)
    .where(
      and(
        resumeMetricsOrgFilters(organizationId, createdByUserId),
        ne(recruitingRecordReadModel.outcome, "archived"),
      ),
    );

  return {
    withInterview: row?.withInterview ?? 0,
    withoutInterview: row?.withoutInterview ?? 0,
  };
}

export interface ResumeLibraryMetricsOptions {
  /** When set, only count candidates created by this user (personal scope). */
  createdByUserId?: string;
}

async function queryResumeLibraryMetrics(
  organizationId: string,
  options?: ResumeLibraryMetricsOptions,
): Promise<ResumeLibraryMetrics> {
  const createdByUserId = options?.createdByUserId;
  const [byPipeline, dailyAdded, conversion] = await Promise.all([
    loadByPipeline(organizationId, createdByUserId),
    loadDailyAdded(organizationId, createdByUserId),
    loadConversion(organizationId, createdByUserId),
  ]);
  return { byPipeline, conversion, dailyAdded };
}

function makeLookbackStart(days = DASHBOARD_LOOKBACK_DAYS) {
  return startOfBeijingDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
}

function buildZeroActivityRows(): DashboardActivityRow[] {
  const today = toBeijingCalendarDate();
  const rows: DashboardActivityRow[] = [];
  for (let i = DASHBOARD_LOOKBACK_DAYS - 1; i >= 0; i -= 1) {
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
    | typeof recruitingFormSubmission
    | typeof humanInterviewRound
    | typeof recruitingRecordReadModel
    | typeof aiInterviewRound
    | typeof recruitingOffer;
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

  const resumeDay = sql<string>`to_char(date_trunc('day', ${recruitingRecordReadModel.createdAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;
  const aiDay = sql<string>`to_char(date_trunc('day', ${aiInterviewRound.updatedAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;
  const humanDay = sql<string>`to_char(date_trunc('day', ${humanInterviewRound.completedAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;
  const offerDay = sql<string>`to_char(date_trunc('day', ${recruitingOffer.sentAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;
  const formDay = sql<string>`to_char(date_trunc('day', ${recruitingFormSubmission.submittedAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;

  const [resumeRows, aiRows, humanRows, offerRows, formRows] = await Promise.all([
    loadDailyCountByDateExpr({
      dayExpr: resumeDay,
      from: recruitingRecordReadModel,
      where: and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        gte(recruitingRecordReadModel.createdAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: aiDay,
      from: aiInterviewRound,
      where: and(
        eq(aiInterviewRound.organizationId, organizationId),
        eq(aiInterviewRound.status, "completed"),
        gte(aiInterviewRound.updatedAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: humanDay,
      from: humanInterviewRound,
      where: and(
        eq(humanInterviewRound.organizationId, organizationId),
        isNotNull(humanInterviewRound.completedAt),
        gte(humanInterviewRound.completedAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: offerDay,
      from: recruitingOffer,
      where: and(
        eq(recruitingOffer.organizationId, organizationId),
        isNotNull(recruitingOffer.sentAt),
        gte(recruitingOffer.sentAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: formDay,
      from: recruitingFormSubmission,
      where: and(
        eq(recruitingFormSubmission.organizationId, organizationId),
        gte(recruitingFormSubmission.submittedAt, since),
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
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.pipelineStage} = 'screening' AND ${recruitingRecordReadModel.outcome} = 'in_pipeline')`.mapWith(
          Number,
        ),
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        ne(recruitingRecordReadModel.outcome, "archived"),
      ),
    );

  const [aiRow] = await db
    .select({
      interrupted:
        sql<number>`COUNT(*) FILTER (WHERE ${aiInterviewRound.status} = 'interrupted')`.mapWith(
          Number,
        ),
      pending: sql<number>`COUNT(*) FILTER (WHERE ${aiInterviewRound.status} = 'pending')`.mapWith(
        Number,
      ),
    })
    .from(aiInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, aiInterviewRound.recruitingRecordId),
    )
    .where(
      and(
        eq(aiInterviewRound.organizationId, organizationId),
        eq(recruitingRecordReadModel.pipelineStage, "ai_interview"),
      ),
    );

  const [humanRow] = await db
    .select({
      pending:
        sql<number>`COUNT(*) FILTER (WHERE ${humanInterviewRound.status} = 'pending')`.mapWith(
          Number,
        ),
    })
    .from(humanInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
    )
    .where(
      and(
        eq(humanInterviewRound.organizationId, organizationId),
        inArray(recruitingRecordReadModel.pipelineStage, ["second_interview", "final_interview"]),
      ),
    );

  const [offerRow] = await db
    .select({
      sent: sql<number>`COUNT(*) FILTER (WHERE ${recruitingOffer.status} = 'sent')`.mapWith(Number),
    })
    .from(recruitingOffer)
    .where(eq(recruitingOffer.organizationId, organizationId));

  const [notificationRow] = await db
    .select({
      failed:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingNotificationDelivery.status} = 'failed')`.mapWith(
          Number,
        ),
    })
    .from(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.organizationId, organizationId));

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
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.pipelineStage} = 'ai_interview')`.mapWith(
          Number,
        ),
      departmentName: department.name,
      humanInterview:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.pipelineStage} IN ('second_interview', 'final_interview'))`.mapWith(
          Number,
        ),
      id: jobDescription.id,
      name: jobDescription.name,
      offer:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.pipelineStage} IN ('income_proof', 'offer', 'background_check', 'onboarding'))`.mapWith(
          Number,
        ),
      screening:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.pipelineStage} = 'screening')`.mapWith(
          Number,
        ),
      total: totalExpr,
    })
    .from(recruitingRecordReadModel)
    .innerJoin(
      jobDescription,
      and(
        eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .leftJoin(
      department,
      and(
        eq(jobDescription.departmentId, department.id),
        eq(department.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        ne(recruitingRecordReadModel.outcome, "archived"),
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
      status: recruitingOffer.status,
    })
    .from(recruitingOffer)
    .where(eq(recruitingOffer.organizationId, organizationId))
    .groupBy(recruitingOffer.status);
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
 * 招聘台聚合数据的缓存入口。三段并发查询：状态分布 / 近一年每日新增 / AI 面试转化。
 * cacheTag 与现有列表查询一致（`studio-resumes`），写入侧的 invalidate 已经覆盖。
 *
 * Cached entry point used by the resume-library page header charts. Three
 * concurrent queries: status distribution, daily new rows over the last 30
 * days, and AI-interview conversion. Shares the `studio-resumes` cache tag
 * with the list query so existing invalidation hooks already cover it.
 */
export function loadResumeLibraryMetrics(
  organizationId: string,
  options?: ResumeLibraryMetricsOptions,
): Promise<ResumeLibraryMetrics> {
  return queryResumeLibraryMetrics(organizationId, options);
}
