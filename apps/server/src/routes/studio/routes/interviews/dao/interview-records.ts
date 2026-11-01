// 面试记录列表：AI 面试轮次与真人面试轮次合并分页。
// 先在两张轮次表上用轻量 UNION ALL 完成筛选、排序与分页，只取当前页的 id，
// 再按 id 批量补全候选人快照与各自的派生字段，避免对重的招聘读模型做全量关联。
//
// Interview records list: AI and human rounds paginated together. A thin
// UNION ALL over the round tables filters, sorts and pages first; only the
// current page's ids are then enriched, so the heavy recruiting read model is
// never joined across the whole result set.

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { alias, unionAll } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { buildListTextFilterWhere } from "@app/database/list-text-filters";
import { calcTotalPages, makePaginationSchema } from "@app/database/pagination";
import { serializeDate } from "@app/database/serialize";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import {
  aiInterviewConversation,
  aiInterviewRound,
  candidate,
  candidateResume,
  department,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewReviewerEvaluation,
  humanInterviewRound,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  recruitingContextSnapshot,
  recruitingRecord,
  user,
} from "@app/db-schema/schema";
import {
  humanInterviewRoundStatusSchema,
  scheduleEntryStatusSchema,
} from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewRoundStatus,
  ScheduleEntryStatus,
} from "@app/db-schema/studio-interviews";
import { loadCandidateAvatarVersions } from "@app/resume-processing/review/support/candidate-avatars-dao";
import { intersectRequestedCreatorIds } from "@app/resume-processing/review/support/access-recruiting-visibility";
import type { RecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import type {
  PaginatedStudioInterviewRecordsResult,
  StudioHumanInterviewRecordListRecord,
  StudioInterviewRecordKind,
  StudioInterviewRecordListRecord,
  StudioInterviewRecordSummary,
} from "@app/shared/studio-interview-rounds";
import { studioInterviewRecordStatusValues } from "@app/shared/studio-interview-rounds";
import {
  aiInterviewRecommendationValues,
  aiRecommendationsForResult,
  humanConclusionsForResult,
  isInterviewRecordResult,
} from "@app/shared/interview-record-result";
import type { InterviewRecordResult } from "@app/shared/interview-record-result";
import { selectInterviewDispatchInterviewer } from "@app/shared/interview/dispatch-contract";
import { db } from "../../../../../infrastructure/db/index";
import { listHumanRoundInterviewers, listSubmittedOutcomesByRound } from "../../calendar/dao";
import { resolveHumanRoundConclusion } from "../../calendar/events";
import { loadLatestFeishuDocumentUrls } from "./feishu-document-urls";
import { aiConversationRecommendation, loadAiInterviewRoundListRecords } from "./interview-rounds";

const SORT_COLUMNS = ["createdAt", "lastInterviewAt"] as const;

const paginationSchema = makePaginationSchema(SORT_COLUMNS, { defaultSortBy: "createdAt" });
const paginationInputSchema = z.object({
  page: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});
type InterviewRecordsPaginationInput = z.input<typeof paginationInputSchema>;

export interface InterviewRecordFilters {
  kind?: StudioInterviewRecordKind;
  creatorIds?: string[] | null;
  /** 统一面试结果（通过/待定/不通过），CSV。/ Unified interview results, CSV. */
  result?: string | null;
  search?: string | null;
  status?: string | null;
  textFilters?: string;
}

export interface InterviewRecordAccess {
  /** 是否可查看真人面试；否则列表只含 AI 面试。/ Whether human rounds are readable. */
  includeHuman: boolean;
  visibilityScope?: RecruitingVisibilityScope;
}

function isAiStatus(status: string): status is ScheduleEntryStatus {
  return scheduleEntryStatusSchema.safeParse(status).success;
}

function isHumanStatus(status: string): status is HumanInterviewRoundStatus {
  return humanInterviewRoundStatusSchema.safeParse(status).success;
}
const RECORD_STATUSES = new Set<string>(studioInterviewRecordStatusValues);

function parseStatusFilter(value?: string | null): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => RECORD_STATUSES.has(item));
  return items && items.length > 0 ? items : undefined;
}

function parseResultFilter(value?: string | null): InterviewRecordResult[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(isInterviewRecordResult);
  return items && items.length > 0 ? items : undefined;
}

function sqlTextList(values: readonly string[]) {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

// 统一面试结果筛选与列表展示共用 @app/shared/interview-record-result 的映射。
// AI 轮次：有人工复核按复核结论，否则按最近一份带建议的报告。
// Result filtering reuses the shared display mapping. AI rounds: manual review first,
// else the latest conversation that carries a recommendation.
const aiLatestRecommendation = sql<string | null>`(
  SELECT ${aiConversationRecommendation}
  FROM ${aiInterviewConversation}
  WHERE ${aiInterviewConversation.aiRoundId} = ${aiInterviewRound.id}
    AND ${aiConversationRecommendation} IN (${sqlTextList(aiInterviewRecommendationValues)})
  ORDER BY COALESCE(${aiInterviewConversation.startedAt}, ${aiInterviewConversation.createdAt}) DESC,
    ${aiInterviewConversation.conversationId} DESC
  LIMIT 1
)`;

function aiResultWhere(results: InterviewRecordResult[]) {
  const reviewOutcomes = results.flatMap((result) =>
    humanConclusionsForResult(result).filter((item) => item === "pass" || item === "fail"),
  );
  const recommendations = results.flatMap(aiRecommendationsForResult);
  return or(
    reviewOutcomes.length > 0 ? inArray(aiInterviewRound.reviewOutcome, reviewOutcomes) : undefined,
    recommendations.length > 0
      ? sql`(${aiInterviewRound.reviewOutcome} IS NULL AND ${aiLatestRecommendation} IN (${sqlTextList(recommendations)}))`
      : undefined,
  );
}

// 与 resolveHumanRoundConclusion 同一规则的 SQL 版本。/ SQL twin of resolveHumanRoundConclusion.
const submittedReviewerEvaluation = sql`
  FROM ${humanInterviewReviewerEvaluation}
  WHERE ${humanInterviewReviewerEvaluation.roundId} = ${humanInterviewRound.id}
    AND ${humanInterviewReviewerEvaluation.organizationId} = ${humanInterviewRound.organizationId}
    AND ${humanInterviewReviewerEvaluation.submittedAt} IS NOT NULL`;
const humanConclusion = sql<string>`(CASE
  WHEN ${humanInterviewRound.evaluationStatus} = 'submitted'
    AND ${humanInterviewRound.outcome} IN ('pass', 'fail') THEN ${humanInterviewRound.outcome}
  WHEN EXISTS (SELECT 1 ${submittedReviewerEvaluation}) THEN COALESCE((
    SELECT ${humanInterviewReviewerEvaluation.outcome} ${submittedReviewerEvaluation}
      AND ${humanInterviewReviewerEvaluation.outcome} IN ('pass', 'fail')
    ORDER BY ${humanInterviewReviewerEvaluation.submittedAt} ASC, ${humanInterviewReviewerEvaluation.id} ASC
    LIMIT 1
  ), 'inconclusive')
  WHEN ${humanInterviewRound.evaluationStatus} = 'submitted'
    AND ${humanInterviewRound.outcome} IS NOT NULL THEN ${humanInterviewRound.outcome}
  ELSE 'none'
END)`;

function humanResultWhere(results: InterviewRecordResult[]) {
  return sql`${humanConclusion} IN (${sqlTextList(results.flatMap(humanConclusionsForResult))})`;
}

function hasTextSearch(filters?: InterviewRecordFilters): boolean {
  return Boolean(filters?.search?.trim() || filters?.textFilters);
}

// 搜索只关联基础表（招聘记录、候选人、简历），不碰重的招聘读模型。
// Search joins only the base tables, never the heavy recruiting read model.
const searchRecord = alias(recruitingRecord, "interview_records_record");
const searchPerson = alias(candidate, "interview_records_candidate");
const searchResume = alias(candidateResume, "interview_records_resume");

function buildSearchWhere(filters: InterviewRecordFilters | undefined, roundLabel: PgColumn) {
  const search = filters?.search?.trim();
  const searchOr = search
    ? or(
        ilike(searchPerson.name, `%${search}%`),
        ilike(searchPerson.email, `%${search}%`),
        ilike(searchRecord.targetRole, `%${search}%`),
        ilike(searchResume.fileName, `%${search}%`),
        ilike(roundLabel, `%${search}%`),
      )
    : undefined;
  return and(
    searchOr,
    buildListTextFilterWhere("interviews", filters?.textFilters, {
      candidateName: searchPerson.name,
      email: searchPerson.email,
      resumeFileName: searchResume.fileName,
      targetRole: searchRecord.targetRole,
      title: roundLabel,
    }),
  );
}

interface BranchScope {
  creatorIds: string[] | null;
  filters?: InterviewRecordFilters;
  organizationId: string;
  results?: InterviewRecordResult[];
  statuses?: string[];
  /** 只有按最近面试时间排序时才计算该列，其余排序不付出子查询成本。/ Computed only when sorting by it. */
  withLastInterviewAt: boolean;
}

const NO_LAST_INTERVIEW_AT = sql<Date | null>`NULL::timestamptz`;

// 与列表展示口径一致：AI 取会话开始（无则创建）时间，真人取已开始会议的开始时间。
// Same definition as the displayed column: AI conversation start (or creation), human meeting start.
const aiLastInterviewAt = sql<Date | null>`(
  SELECT MAX(COALESCE(${aiInterviewConversation.startedAt}, ${aiInterviewConversation.createdAt}))
  FROM ${aiInterviewConversation}
  WHERE ${aiInterviewConversation.aiRoundId} = ${aiInterviewRound.id}
)`;
const humanLastInterviewAt = sql<Date | null>`(
  SELECT MAX(${humanInterviewMeeting.startedAt})
  FROM ${humanInterviewMeetingRound}
  INNER JOIN ${humanInterviewMeeting}
    ON ${humanInterviewMeeting.id} = ${humanInterviewMeetingRound.meetingId}
  WHERE ${humanInterviewMeetingRound.roundId} = ${humanInterviewRound.id}
)`;

function aiBranch({
  creatorIds,
  filters,
  organizationId,
  results,
  statuses,
  withLastInterviewAt,
}: BranchScope) {
  const aiStatuses = statuses?.filter(isAiStatus);
  const where = and(
    eq(aiInterviewRound.organizationId, organizationId),
    aiStatuses ? inArray(aiInterviewRound.status, aiStatuses) : undefined,
    results ? aiResultWhere(results) : undefined,
    creatorIds ? inArray(aiInterviewRound.createdBy, creatorIds) : undefined,
    hasTextSearch(filters) ? buildSearchWhere(filters, aiInterviewRound.roundLabel) : undefined,
  );
  const query = db
    .select({
      createdAt: aiInterviewRound.createdAt,
      id: aiInterviewRound.id,
      kind: sql<StudioInterviewRecordKind>`'ai'`.as("kind"),
      lastInterviewAt: (withLastInterviewAt ? aiLastInterviewAt : NO_LAST_INTERVIEW_AT).as(
        "last_interview_at",
      ),
    })
    .from(aiInterviewRound)
    .$dynamic();
  if (hasTextSearch(filters)) {
    query
      .innerJoin(
        searchRecord,
        and(
          eq(searchRecord.id, aiInterviewRound.recruitingRecordId),
          eq(searchRecord.organizationId, aiInterviewRound.organizationId),
        ),
      )
      .leftJoin(
        searchPerson,
        and(
          eq(searchPerson.id, searchRecord.candidateId),
          eq(searchPerson.organizationId, searchRecord.organizationId),
        ),
      )
      .leftJoin(searchResume, eq(searchResume.id, searchRecord.resumeId));
  }
  return query.where(aiStatuses?.length === 0 || filters?.kind === "human" ? sql`false` : where);
}

function humanBranch({
  creatorIds,
  filters,
  organizationId,
  results,
  statuses,
  withLastInterviewAt,
}: BranchScope) {
  const humanStatuses = statuses?.filter(isHumanStatus);
  // 真人轮次的创建人与可见范围都按招聘记录的创建人判断。
  // Human rounds are attributed to, and scoped by, the recruiting record's creator.
  const where = and(
    eq(humanInterviewRound.organizationId, organizationId),
    humanStatuses ? inArray(humanInterviewRound.status, humanStatuses) : undefined,
    results ? humanResultWhere(results) : undefined,
    creatorIds ? inArray(searchRecord.createdBy, creatorIds) : undefined,
    hasTextSearch(filters) ? buildSearchWhere(filters, humanInterviewRound.label) : undefined,
  );
  const query = db
    .select({
      createdAt: humanInterviewRound.createdAt,
      id: humanInterviewRound.id,
      kind: sql<StudioInterviewRecordKind>`'human'`.as("kind"),
      lastInterviewAt: (withLastInterviewAt ? humanLastInterviewAt : NO_LAST_INTERVIEW_AT).as(
        "last_interview_at",
      ),
    })
    .from(humanInterviewRound)
    .innerJoin(
      searchRecord,
      and(
        eq(searchRecord.id, humanInterviewRound.recruitingRecordId),
        eq(searchRecord.organizationId, humanInterviewRound.organizationId),
      ),
    )
    .$dynamic();
  if (hasTextSearch(filters)) {
    query
      .leftJoin(
        searchPerson,
        and(
          eq(searchPerson.id, searchRecord.candidateId),
          eq(searchPerson.organizationId, searchRecord.organizationId),
        ),
      )
      .leftJoin(searchResume, eq(searchResume.id, searchRecord.resumeId));
  }
  return query.where(humanStatuses?.length === 0 || filters?.kind === "ai" ? sql`false` : where);
}

function resolveCreatorScope(
  filters: InterviewRecordFilters | undefined,
  visibilityScope: RecruitingVisibilityScope | undefined,
): string[] | null {
  const requested = filters?.creatorIds?.filter((id) => id.trim().length > 0);
  if (!visibilityScope) {
    return requested && requested.length > 0 ? requested : null;
  }
  return intersectRequestedCreatorIds(requested, visibilityScope);
}

const humanRecordCreator = alias(user, "interview_records_creator");

/** 按真人轮次 id 批量取列表行。顺序不保证。/ Human round list rows by id; order unspecified. */
async function loadHumanInterviewRecordListRecords(
  roundIds: string[],
  organizationId: string,
): Promise<StudioHumanInterviewRecordListRecord[]> {
  if (roundIds.length === 0) {
    return [];
  }
  const [rows, lastMeetingRows, interviewerRows, submittedOutcomesByRound] = await Promise.all([
    db
      .select({
        candidateEmail: recruitingRecordReadModel.candidateEmail,
        candidateName: recruitingRecordReadModel.candidateName,
        createdAt: humanInterviewRound.createdAt,
        createdBy: recruitingRecordReadModel.createdBy,
        creatorImage: humanRecordCreator.image,
        creatorName: humanRecordCreator.name,
        evaluationStatus: humanInterviewRound.evaluationStatus,
        format: humanInterviewRound.format,
        id: humanInterviewRound.id,
        jobDescriptionDepartmentName: department.name,
        jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
        jobDescriptionName: jobDescription.name,
        label: humanInterviewRound.label,
        meetingStatus: sql<string | null>`(
          SELECT ${humanInterviewMeeting.status}
          FROM ${humanInterviewMeetingRound}
          INNER JOIN ${humanInterviewMeeting}
            ON ${humanInterviewMeeting.id} = ${humanInterviewMeetingRound.meetingId}
          WHERE ${humanInterviewMeetingRound.roundId} = ${humanInterviewRound.id}
            AND ${humanInterviewMeeting.organizationId} = ${humanInterviewRound.organizationId}
          ORDER BY (${humanInterviewMeeting.status} = 'cancelled') ASC,
            ${humanInterviewMeeting.createdAt} DESC, ${humanInterviewMeeting.id} DESC
          LIMIT 1
        )`,
        outcome: humanInterviewRound.outcome,
        recruitingRecordId: humanInterviewRound.recruitingRecordId,
        resumeContentHash: recruitingRecordReadModel.resumeContentHash,
        resumeFileName: recruitingRecordReadModel.resumeFileName,
        resumeStorageKey: recruitingRecordReadModel.resumeStorageKey,
        scheduledAt: humanInterviewRound.scheduledAt,
        status: humanInterviewRound.status,
        updatedAt: humanInterviewRound.updatedAt,
      })
      .from(humanInterviewRound)
      .leftJoin(
        recruitingRecordReadModel,
        eq(humanInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
      )
      .leftJoin(
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
      .leftJoin(humanRecordCreator, eq(recruitingRecordReadModel.createdBy, humanRecordCreator.id))
      .where(
        and(
          eq(humanInterviewRound.organizationId, organizationId),
          inArray(humanInterviewRound.id, roundIds),
        ),
      ),
    // 结束时间取开始最晚的那场会议，与“最近面试时间”同口径。
    // End time comes from the latest-started meeting, matching lastInterviewAt.
    db
      .selectDistinctOn([humanInterviewMeetingRound.roundId], {
        lastInterviewAt: humanInterviewMeeting.startedAt,
        lastInterviewEndedAt: humanInterviewMeeting.endedAt,
        roundId: humanInterviewMeetingRound.roundId,
      })
      .from(humanInterviewMeetingRound)
      .innerJoin(
        humanInterviewMeeting,
        and(
          eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
          eq(humanInterviewMeeting.organizationId, humanInterviewMeetingRound.organizationId),
        ),
      )
      .where(
        and(
          eq(humanInterviewMeetingRound.organizationId, organizationId),
          inArray(humanInterviewMeetingRound.roundId, roundIds),
          isNotNull(humanInterviewMeeting.startedAt),
        ),
      )
      .orderBy(
        humanInterviewMeetingRound.roundId,
        desc(humanInterviewMeeting.startedAt),
        desc(humanInterviewMeeting.id),
      ),
    listHumanRoundInterviewers(roundIds),
    listSubmittedOutcomesByRound(roundIds, organizationId),
  ]);

  // 候选人评价表绑定在招聘记录上，真人行与同一候选人的 AI 行共用同一份文档。
  // The evaluation document belongs to the recruiting record, shared with that candidate's AI rows.
  const [avatarVersions, documentUrlsByRecord] = await Promise.all([
    loadCandidateAvatarVersions(rows.map((row) => row.resumeContentHash)),
    loadLatestFeishuDocumentUrls({
      ids: rows.map((row) => row.recruitingRecordId),
      key: "interviewRecordId",
      organizationId,
    }),
  ]);
  const lastMeetingByRound = new Map(lastMeetingRows.map((row) => [row.roundId, row]));
  const interviewersByRound = new Map<
    string,
    StudioHumanInterviewRecordListRecord["interviewers"]
  >();
  for (const assignee of interviewerRows) {
    const list = interviewersByRound.get(assignee.roundId) ?? [];
    list.push({ id: assignee.id, image: assignee.avatarUrl, name: assignee.name });
    interviewersByRound.set(assignee.roundId, list);
  }

  return rows.map((row) => ({
    candidateAvatarVersion: avatarVersions.get(row.resumeContentHash ?? "") ?? null,
    candidateEmail: row.candidateEmail,
    candidateId: row.recruitingRecordId,
    candidateName: row.candidateName ?? "",
    conclusion: resolveHumanRoundConclusion({
      evaluationStatus: row.evaluationStatus,
      outcome: row.outcome,
      submittedOutcomes: submittedOutcomesByRound.get(row.id) ?? [],
    }),
    createdAt: serializeDate(row.createdAt) ?? "",
    createdBy: row.createdBy,
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    feishuDocumentUrl: documentUrlsByRecord.get(row.recruitingRecordId) ?? null,
    format: row.format,
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    interviewers: interviewersByRound.get(row.id) ?? [],
    jobDescriptionDepartmentName: row.jobDescriptionDepartmentName,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    kind: "human",
    lastInterviewAt: serializeDate(lastMeetingByRound.get(row.id)?.lastInterviewAt ?? null),
    lastInterviewEndedAt: serializeDate(
      lastMeetingByRound.get(row.id)?.lastInterviewEndedAt ?? null,
    ),
    meetingStatus: row.meetingStatus,
    resumeFileName: row.resumeFileName,
    roundLabel: row.label,
    scheduledAt: serializeDate(row.scheduledAt),
    status: row.status,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  }));
}

/**
 * AI 轮次实际使用的面试官 Agent：与发起面试时相同，从候选人当前上下文快照的面试官列表里
 * 按轮次 id 选出；尚无快照时按岗位当前绑定的面试官 Agent 推算。
 * The interviewer agent an AI round uses: picked from the active context snapshot by round id,
 * exactly as dispatch does; before a snapshot exists, derived from the JD's bound agents.
 */
async function loadAiInterviewerAgentNames(
  rounds: { candidateId: string; id: string; jobDescriptionId: string | null }[],
  organizationId: string,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (rounds.length === 0) {
    return result;
  }
  const recordIds = [...new Set(rounds.map((round) => round.candidateId))];
  const snapshotRows = await db
    .select({
      interviewers: sql<
        { name: string }[] | null
      >`${recruitingContextSnapshot.payload} -> 'interviewers'`,
      recordId: recruitingContextSnapshot.recruitingRecordId,
    })
    .from(recruitingContextSnapshot)
    .where(
      and(
        eq(recruitingContextSnapshot.organizationId, organizationId),
        eq(recruitingContextSnapshot.status, "active"),
        inArray(recruitingContextSnapshot.recruitingRecordId, recordIds),
      ),
    )
    .orderBy(desc(recruitingContextSnapshot.version));
  const snapshotInterviewers = new Map<string, { name: string }[]>();
  for (const row of snapshotRows) {
    if (!snapshotInterviewers.has(row.recordId)) {
      snapshotInterviewers.set(row.recordId, row.interviewers ?? []);
    }
  }

  const jobDescriptionIds = [
    ...new Set(
      rounds
        .filter((round) => !snapshotInterviewers.has(round.candidateId))
        .flatMap((round) => (round.jobDescriptionId ? [round.jobDescriptionId] : [])),
    ),
  ];
  const jobInterviewerRows =
    jobDescriptionIds.length === 0
      ? []
      : await db
          .select({
            jobDescriptionId: jobDescriptionInterviewer.jobDescriptionId,
            name: interviewer.name,
          })
          .from(jobDescriptionInterviewer)
          .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
          .where(
            and(
              eq(interviewer.organizationId, organizationId),
              inArray(jobDescriptionInterviewer.jobDescriptionId, jobDescriptionIds),
            ),
          )
          .orderBy(asc(interviewer.name));
  const jobInterviewers = new Map<string, { name: string }[]>();
  for (const row of jobInterviewerRows) {
    const list = jobInterviewers.get(row.jobDescriptionId) ?? [];
    list.push({ name: row.name });
    jobInterviewers.set(row.jobDescriptionId, list);
  }

  for (const round of rounds) {
    const candidates =
      snapshotInterviewers.get(round.candidateId) ??
      (round.jobDescriptionId ? jobInterviewers.get(round.jobDescriptionId) : undefined) ??
      [];
    const selected = selectInterviewDispatchInterviewer(
      candidates.map(({ name }) => ({ name, prompt: null, voice: null })),
      round.id,
    );
    result.set(round.id, selected?.name ?? null);
  }
  return result;
}

function emptyPage(page: number, pageSize: number): PaginatedStudioInterviewRecordsResult {
  return { page, pageSize, records: [], total: 0, totalPages: calcTotalPages(0, pageSize) };
}

export async function queryPaginatedInterviewRecords(
  organizationId: string,
  filters: InterviewRecordFilters | undefined,
  pagination: InterviewRecordsPaginationInput | undefined,
  access: InterviewRecordAccess,
): Promise<PaginatedStudioInterviewRecordsResult> {
  const { page, pageSize, sortBy, sortOrder } = paginationSchema.parse(
    paginationInputSchema.parse(pagination ?? {}),
  );
  const creatorIds = resolveCreatorScope(filters, access.visibilityScope);
  if (creatorIds?.length === 0) {
    return emptyPage(page, pageSize);
  }
  const scope: BranchScope = {
    creatorIds,
    filters,
    organizationId,
    results: parseResultFilter(filters?.result),
    statuses: parseStatusFilter(filters?.status),
    withLastInterviewAt: sortBy === "lastInterviewAt",
  };
  const records = (
    access.includeHuman ? unionAll(aiBranch(scope), humanBranch(scope)) : aiBranch(scope)
  ).as("interview_records");

  const direction = sortOrder === "asc" ? asc : desc;
  // 没有面试过的轮次总排在最后。/ Rounds never interviewed always sort last.
  const primaryOrder =
    sortBy === "lastInterviewAt"
      ? sql`${records.lastInterviewAt} ${sql.raw(sortOrder === "asc" ? "ASC" : "DESC")} NULLS LAST`
      : direction(records.createdAt);
  const [pageRows, [totalRow]] = await Promise.all([
    db
      .select({ id: records.id, kind: records.kind })
      .from(records)
      .orderBy(primaryOrder, direction(records.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: count() }).from(records),
  ]);

  const aiIds = pageRows.filter((row) => row.kind === "ai").map((row) => row.id);
  const humanIds = pageRows.filter((row) => row.kind === "human").map((row) => row.id);
  const [aiRecords, humanRecords] = await Promise.all([
    loadAiInterviewRoundListRecords(aiIds, organizationId),
    loadHumanInterviewRecordListRecords(humanIds, organizationId),
  ]);
  const agentNames = await loadAiInterviewerAgentNames(aiRecords, organizationId);
  const byKey = new Map<string, StudioInterviewRecordListRecord>([
    ...aiRecords.map(
      (record) =>
        [
          `ai:${record.id}`,
          {
            ...record,
            interviewerAgentName: agentNames.get(record.id) ?? null,
            kind: "ai" as const,
          },
        ] as const,
    ),
    ...humanRecords.map((record) => [`human:${record.id}`, record] as const),
  ]);
  const total = totalRow?.count ?? 0;
  return {
    page,
    pageSize,
    records: pageRows.flatMap((row) => {
      const record = byKey.get(`${row.kind}:${row.id}`);
      return record ? [record] : [];
    }),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

const EMPTY_SUMMARY: StudioInterviewRecordSummary = {
  cancelled: 0,
  completed: 0,
  inProgress: 0,
  interrupted: 0,
  pending: 0,
  total: 0,
};

/** 两类轮次按状态汇总，可见范围与列表一致。/ Status counts across both kinds, scoped like the list. */
export async function summarizeInterviewRecordCounts(
  organizationId: string,
  access: InterviewRecordAccess,
): Promise<StudioInterviewRecordSummary> {
  const creatorIds = resolveCreatorScope(undefined, access.visibilityScope);
  if (creatorIds?.length === 0) {
    return EMPTY_SUMMARY;
  }
  const [aiRows, humanRows] = await Promise.all([
    db
      .select({ count: count(), status: aiInterviewRound.status })
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.organizationId, organizationId),
          creatorIds ? inArray(aiInterviewRound.createdBy, creatorIds) : undefined,
        ),
      )
      .groupBy(aiInterviewRound.status),
    access.includeHuman
      ? db
          .select({ count: count(), status: humanInterviewRound.status })
          .from(humanInterviewRound)
          .innerJoin(
            searchRecord,
            and(
              eq(searchRecord.id, humanInterviewRound.recruitingRecordId),
              eq(searchRecord.organizationId, humanInterviewRound.organizationId),
            ),
          )
          .where(
            and(
              eq(humanInterviewRound.organizationId, organizationId),
              creatorIds ? inArray(searchRecord.createdBy, creatorIds) : undefined,
            ),
          )
          .groupBy(humanInterviewRound.status)
      : [],
  ]);

  const summary = { ...EMPTY_SUMMARY };
  for (const row of [...aiRows, ...humanRows]) {
    summary.total += row.count;
    if (row.status === "pending") {
      summary.pending += row.count;
    } else if (row.status === "in_progress") {
      summary.inProgress += row.count;
    } else if (row.status === "completed") {
      summary.completed += row.count;
    } else if (row.status === "interrupted") {
      summary.interrupted += row.count;
    } else if (row.status === "cancelled") {
      summary.cancelled += row.count;
    }
  }
  return summary;
}
