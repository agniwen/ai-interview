import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, count, desc, eq, exists, gte, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
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
  recruitingNodeState,
  user,
} from "@app/db-schema/schema";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";
import {
  getRecruitingBoardPresetStatusTabs,
  recruitingBoardStagePresets,
} from "@app/shared/recruiting-board";
import { buildRecruitingBoardFilter } from "./board-filter";
import { buildDashboardActionFilter } from "./dashboard-action-filter";
import { buildNonArchivedRecruitingRecordFilter } from "./dashboard-metric-scope";
import { candidateOutcomeSchema, pipelineStageSchema } from "@app/db-schema/studio-interviews";

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

async function loadByPipeline(
  organizationId: string,
  createdByUserId?: string,
  boardPreset?: string,
) {
  const presetView = recruitingBoardStagePresets.find((preset) => preset.id === boardPreset)?.view;
  // 漏斗分布：按 (pipelineStage, outcome) 分桶；常规视图排除 archived，避免冷藏长尾
  // 压扁主流程。已结束子页面保留 archived，确保“已归档”二级 Tab 有对应分布。
  // Pipeline funnel: bucket by (pipelineStage, outcome). Regular views exclude
  // archived rows; the closed submenu keeps them for its archived child tab.
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
        presetView ? (buildRecruitingBoardFilter(presetView) ?? undefined) : undefined,
        boardPreset === "closed" ? undefined : ne(recruitingRecordReadModel.outcome, "archived"),
      ),
    )
    .groupBy(recruitingRecordReadModel.pipelineStage, recruitingRecordReadModel.outcome);

  return rows.map((row) => ({
    count: row.count,
    outcome: candidateOutcomeSchema.parse(row.outcome),
    stage: pipelineStageSchema.parse(row.pipelineStage),
  }));
}

function loadBoardStatusCounts(
  organizationId: string,
  createdByUserId?: string,
  boardPreset?: string,
): Promise<NonNullable<ResumeLibraryMetrics["boardStatusCounts"]>> {
  const tabs = getRecruitingBoardPresetStatusTabs(boardPreset);
  return Promise.all(
    tabs.map(async (tab) => {
      const [row] = await db
        .select({ count: count() })
        .from(recruitingRecordReadModel)
        .where(
          and(
            resumeMetricsOrgFilters(organizationId, createdByUserId),
            buildRecruitingBoardFilter(tab.value) ?? undefined,
          ),
        );
      return { count: row?.count ?? 0, label: tab.label, view: tab.value };
    }),
  );
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
  /** Fixed recruiting-board stage used by sidebar submenu pages. */
  boardPreset?: string;
  /** When set, only count candidates created by this user (personal scope). */
  createdByUserId?: string;
}

async function queryResumeLibraryMetrics(
  organizationId: string,
  options?: ResumeLibraryMetricsOptions,
): Promise<ResumeLibraryMetrics> {
  const createdByUserId = options?.createdByUserId;
  const boardPreset = options?.boardPreset;
  const [boardStatusCounts, byPipeline, dailyAdded, conversion] = await Promise.all([
    loadBoardStatusCounts(organizationId, createdByUserId, boardPreset),
    loadByPipeline(organizationId, createdByUserId, boardPreset),
    boardPreset ? Promise.resolve([]) : loadDailyAdded(organizationId, createdByUserId),
    boardPreset
      ? Promise.resolve({ withInterview: 0, withoutInterview: 0 })
      : loadConversion(organizationId, createdByUserId),
  ]);
  return { boardStatusCounts, byPipeline, conversion, dailyAdded };
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
        ne(recruitingRecordReadModel.outcome, "archived"),
        gte(recruitingRecordReadModel.createdAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: aiDay,
      from: aiInterviewRound,
      where: and(
        eq(aiInterviewRound.organizationId, organizationId),
        buildNonArchivedRecruitingRecordFilter(aiInterviewRound),
        eq(aiInterviewRound.status, "completed"),
        gte(aiInterviewRound.updatedAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: humanDay,
      from: humanInterviewRound,
      where: and(
        eq(humanInterviewRound.organizationId, organizationId),
        buildNonArchivedRecruitingRecordFilter(humanInterviewRound),
        isNotNull(humanInterviewRound.completedAt),
        gte(humanInterviewRound.completedAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: offerDay,
      from: recruitingOffer,
      where: and(
        eq(recruitingOffer.organizationId, organizationId),
        buildNonArchivedRecruitingRecordFilter(recruitingOffer),
        isNotNull(recruitingOffer.sentAt),
        gte(recruitingOffer.sentAt, since),
      ),
    }),
    loadDailyCountByDateExpr({
      dayExpr: formDay,
      from: recruitingFormSubmission,
      where: and(
        eq(recruitingFormSubmission.organizationId, organizationId),
        buildNonArchivedRecruitingRecordFilter(recruitingFormSubmission),
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
      aiInterrupted:
        sql<number>`COUNT(*) FILTER (WHERE ${buildDashboardActionFilter("ai_interrupted")})`.mapWith(
          Number,
        ),
      aiPending:
        sql<number>`COUNT(*) FILTER (WHERE ${buildDashboardActionFilter("ai_pending")})`.mapWith(
          Number,
        ),
      humanPending:
        sql<number>`COUNT(*) FILTER (WHERE ${buildDashboardActionFilter("human_pending")})`.mapWith(
          Number,
        ),
      offerSent:
        sql<number>`COUNT(*) FILTER (WHERE ${buildDashboardActionFilter("offer_sent")})`.mapWith(
          Number,
        ),
      screening:
        sql<number>`COUNT(*) FILTER (WHERE ${buildDashboardActionFilter("screening")})`.mapWith(
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

  const [notificationRow] = await db
    .select({
      failed:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingNotificationDelivery.status} = 'failed')`.mapWith(
          Number,
        ),
    })
    .from(recruitingNotificationDelivery)
    .where(
      and(
        eq(recruitingNotificationDelivery.organizationId, organizationId),
        buildNonArchivedRecruitingRecordFilter(recruitingNotificationDelivery),
      ),
    );

  return [
    {
      count: candidateRow?.screening ?? 0,
      description: "还停留在简历筛选阶段的候选人",
      key: "screening",
      label: "待筛选简历",
      severity: "warning",
    },
    {
      count: candidateRow?.aiPending ?? 0,
      description: "AI 面试阶段中存在待开始轮次的候选人",
      key: "ai_pending",
      label: "AI 面试待进场",
      severity: "info",
    },
    {
      count: candidateRow?.aiInterrupted ?? 0,
      description: "AI 面试阶段中存在中断轮次的候选人",
      key: "ai_interrupted",
      label: "AI 面试中断",
      severity: "danger",
    },
    {
      count: candidateRow?.humanPending ?? 0,
      description: "真人复面阶段中存在待完成轮次的候选人",
      key: "human_pending",
      label: "真人复面待处理",
      severity: "warning",
    },
    {
      count: candidateRow?.offerSent ?? 0,
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
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.pipelineStage} IN ('income_proof', 'salary_negotiation', 'offer', 'background_check', 'onboarding'))`.mapWith(
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
    .where(
      and(
        eq(recruitingOffer.organizationId, organizationId),
        buildNonArchivedRecruitingRecordFilter(recruitingOffer),
      ),
    )
    .groupBy(recruitingOffer.status);
  return rows.map((row) => ({ count: row.count, status: row.status }));
}

const INTERVIEW_AND_LATER_STAGES = [
  "ai_interview",
  "second_interview",
  "final_interview",
  "income_proof",
  "salary_negotiation",
  "offer",
  "background_check",
  "onboarding",
] as const;
const SECOND_INTERVIEW_AND_LATER_STAGES = INTERVIEW_AND_LATER_STAGES.slice(1);
const OFFER_AND_LATER_STAGES = INTERVIEW_AND_LATER_STAGES.slice(3);

function hasReachedMilestone(nodes: readonly (typeof INTERVIEW_AND_LATER_STAGES)[number][]) {
  return exists(
    db
      .select({ one: recruitingNodeState.recruitingRecordId })
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, recruitingRecordReadModel.id),
          inArray(recruitingNodeState.node, nodes),
          or(isNotNull(recruitingNodeState.enteredAt), ne(recruitingNodeState.status, "inactive")),
        ),
      ),
  );
}

async function loadDashboardOverview(organizationId: string) {
  const [row] = await db
    .select({
      hired:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'hired')`.mapWith(
          Number,
        ),
      negativeClosed:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} IN ('rejected', 'withdrawn'))`.mapWith(
          Number,
        ),
      offerOnboarding:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'in_pipeline' AND ${recruitingRecordReadModel.pipelineStage} IN ('income_proof', 'salary_negotiation', 'offer', 'background_check', 'onboarding'))`.mapWith(
          Number,
        ),
      progressing:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'in_pipeline')`.mapWith(
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

  return {
    hired: row?.hired ?? 0,
    negativeClosed: row?.negativeClosed ?? 0,
    offerOnboarding: row?.offerOnboarding ?? 0,
    progressing: row?.progressing ?? 0,
  };
}

async function loadDashboardVacancies(organizationId: string) {
  const rows = await db
    .select({
      departmentName: department.name,
      headcount: jobDescription.headcount,
      hired:
        sql<number>`COUNT(${recruitingRecordReadModel.id}) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'hired')`.mapWith(
          Number,
        ),
      id: jobDescription.id,
      name: jobDescription.name,
    })
    .from(jobDescription)
    .leftJoin(
      department,
      and(
        eq(jobDescription.departmentId, department.id),
        eq(jobDescription.organizationId, department.organizationId),
      ),
    )
    .leftJoin(
      recruitingRecordReadModel,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
        ne(recruitingRecordReadModel.outcome, "archived"),
      ),
    )
    .where(
      and(
        eq(jobDescription.organizationId, organizationId),
        eq(jobDescription.lifecycleStatus, "published"),
      ),
    )
    .groupBy(jobDescription.id, jobDescription.name, jobDescription.headcount, department.name);

  return rows
    .map((row) => ({
      ...row,
      gap: row.headcount === null ? 0 : Math.max(row.headcount - row.hired, 0),
    }))
    .toSorted(
      (left, right) => right.gap - left.gap || left.name.localeCompare(right.name, "zh-CN"),
    );
}

async function loadCumulativeFunnel(organizationId: string) {
  const enteredInterviewSql = hasReachedMilestone(INTERVIEW_AND_LATER_STAGES);
  const enteredSecondInterviewSql = hasReachedMilestone(SECOND_INTERVIEW_AND_LATER_STAGES);
  const enteredOfferSql = hasReachedMilestone(OFFER_AND_LATER_STAGES);
  const [row] = await db
    .select({
      enteredInterview: sql<number>`COUNT(*) FILTER (WHERE ${enteredInterviewSql})`.mapWith(Number),
      enteredOffer: sql<number>`COUNT(*) FILTER (WHERE ${enteredOfferSql})`.mapWith(Number),
      enteredSecondInterview:
        sql<number>`COUNT(*) FILTER (WHERE ${enteredSecondInterviewSql})`.mapWith(Number),
      hired:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'hired')`.mapWith(
          Number,
        ),
      resumesAdded: count(),
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        ne(recruitingRecordReadModel.outcome, "archived"),
      ),
    );

  return {
    enteredInterview: row?.enteredInterview ?? 0,
    enteredOffer: row?.enteredOffer ?? 0,
    enteredSecondInterview: row?.enteredSecondInterview ?? 0,
    hired: row?.hired ?? 0,
    resumesAdded: row?.resumesAdded ?? 0,
  };
}

async function loadRecruiterProgress(organizationId: string) {
  const hasPendingAiRoundSql = exists(
    db
      .select({ one: aiInterviewRound.id })
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
          inArray(aiInterviewRound.status, ["pending", "interrupted"]),
        ),
      ),
  );
  const hasPendingHumanRoundSql = exists(
    db
      .select({ one: humanInterviewRound.id })
      .from(humanInterviewRound)
      .where(
        and(
          eq(humanInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
          eq(humanInterviewRound.status, "pending"),
        ),
      ),
  );
  const rows = await db
    .select({
      hired:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'hired')`.mapWith(
          Number,
        ),
      interviewing:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'in_pipeline' AND ${recruitingRecordReadModel.pipelineStage} IN ('ai_interview', 'second_interview', 'final_interview'))`.mapWith(
          Number,
        ),
      offerOnboarding:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'in_pipeline' AND ${recruitingRecordReadModel.pipelineStage} IN ('income_proof', 'salary_negotiation', 'offer', 'background_check', 'onboarding'))`.mapWith(
          Number,
        ),
      pendingActions:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'in_pipeline' AND (${recruitingRecordReadModel.pipelineStage} = 'screening' OR (${recruitingRecordReadModel.pipelineStage} = 'ai_interview' AND ${hasPendingAiRoundSql}) OR (${recruitingRecordReadModel.pipelineStage} IN ('second_interview', 'final_interview') AND ${hasPendingHumanRoundSql})))`.mapWith(
          Number,
        ),
      total: count(),
      userId: recruitingRecordReadModel.createdBy,
      userImage: user.image,
      userName: user.name,
      userRemark: user.remark,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(user, eq(user.id, recruitingRecordReadModel.createdBy))
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        ne(recruitingRecordReadModel.outcome, "archived"),
      ),
    )
    .groupBy(recruitingRecordReadModel.createdBy, user.name, user.image, user.remark)
    .orderBy(desc(sql`COUNT(*)`));

  return rows.map((row) => ({
    ...row,
    userName: row.userName?.trim() || "未分配",
  }));
}

export async function loadRecruitingDashboardMetrics(
  organizationId: string,
): Promise<RecruitingDashboardMetrics> {
  const [
    resume,
    actions,
    activity,
    jobPipeline,
    offerStatuses,
    overview,
    vacancies,
    cumulativeFunnel,
    recruiterProgress,
  ] = await Promise.all([
    queryResumeLibraryMetrics(organizationId),
    loadActionItems(organizationId),
    loadDashboardActivity(organizationId),
    loadJobPipeline(organizationId),
    loadOfferStatuses(organizationId),
    loadDashboardOverview(organizationId),
    loadDashboardVacancies(organizationId),
    loadCumulativeFunnel(organizationId),
    loadRecruiterProgress(organizationId),
  ]);

  return {
    actions,
    activity: activity.rows,
    cumulativeFunnel,
    jobPipeline,
    offerStatuses,
    recruiterProgress,
    resume,
    summary: {
      ...activity.summary,
      activeJobs: vacancies.length,
      hired: overview.hired,
      negativeClosed: overview.negativeClosed,
      offerOnboarding: overview.offerOnboarding,
      progressing: overview.progressing,
      unconfiguredHeadcount: vacancies.filter((row) => row.headcount === null).length,
      vacancies: vacancies.reduce((sum, row) => sum + row.gap, 0),
    },
    vacancies,
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
