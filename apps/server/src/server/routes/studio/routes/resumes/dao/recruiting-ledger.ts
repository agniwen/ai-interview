import {
  department,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  jobDescription,
  recruitingOffer,
  recruitingFulfillment,
  recruitingEvent,
  recruitingRecord,
  user,
} from "@app/db-schema/schema";
import type { RecruitingBoardView } from "@app/shared/recruiting-board";
import {
  calculateRecruitingGap,
  calculateRecruitingCycleDays,
  calculateRecruitingPoints,
} from "@app/shared/studio-recruiting-ledger";
import type {
  RecruitingLedgerHumanRound,
  RecruitingLedgerResult,
} from "@app/shared/studio-recruiting-ledger";
import { describeResumeProgress } from "@app/shared/studio-resumes";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../../../../../lib/server/db/index";
import { serializeDate } from "../../../../../../lib/server/db/serialize";
import type { RecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { buildScopedResumeWhere, queryPaginatedResumeRecords } from "./resumes";

interface RecruitingLedgerFilters {
  boardView?: RecruitingBoardView;
  createdAtBefore?: Date;
  createdAtFrom?: Date;
  responsibleHrIds?: string[];
  departmentIds?: string[];
  jobDescriptionIds?: string[];
  joiningDateFrom?: string;
  joiningDateTo?: string;
  recommendationLevels?: ("not_recommended" | "undecided" | "recommended" | "highly_recommended")[];
  search?: string;
}

interface RecruitingLedgerPagination {
  page: number;
  pageSize: number;
  sortBy: "createdAt" | "candidateName" | "joiningDate" | "updatedAt";
  sortOrder: "asc" | "desc";
}

const ownerUser = alias(user, "recruiting_ledger_owner");
const managerUser = alias(user, "recruiting_ledger_manager");
const interviewerUser = alias(user, "recruiting_ledger_interviewer");

function visibilityCondition(scope: RecruitingVisibilityScope) {
  if (scope.kind === "none") {
    return sql`false`;
  }
  if (scope.kind === "restricted") {
    return scope.userIds.length > 0
      ? inArray(recruitingRecord.createdBy, scope.userIds)
      : sql`false`;
  }
  return null;
}

async function resolveJobDescriptionIds(
  organizationId: string,
  filters: RecruitingLedgerFilters,
): Promise<string[] | undefined> {
  if (!filters.departmentIds?.length) {
    return filters.jobDescriptionIds;
  }
  const rows = await db
    .select({ id: jobDescription.id })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.organizationId, organizationId),
        inArray(jobDescription.departmentId, filters.departmentIds),
      ),
    );
  const departmentJobIds = new Set(rows.map((row) => row.id));
  const ids = filters.jobDescriptionIds?.length
    ? filters.jobDescriptionIds.filter((id) => departmentJobIds.has(id))
    : [...departmentJobIds];
  return ids.length > 0 ? ids : ["__no_matching_job__"];
}

async function loadLedgerFacets(
  organizationId: string,
  scope: RecruitingVisibilityScope,
): Promise<RecruitingLedgerResult["facets"]> {
  const visibility = visibilityCondition(scope);
  const [jobRows, recruiterRows] = await Promise.all([
    db
      .select({
        departmentId: department.id,
        departmentName: department.name,
        jobId: jobDescription.id,
        jobName: jobDescription.name,
      })
      .from(jobDescription)
      .leftJoin(
        department,
        and(
          eq(jobDescription.departmentId, department.id),
          eq(jobDescription.organizationId, department.organizationId),
        ),
      )
      .where(
        and(
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      )
      .orderBy(asc(jobDescription.name)),
    db
      .selectDistinct({
        id: sql<
          string | null
        >`COALESCE(${recruitingRecord.ownerId}, ${recruitingRecord.createdBy})`,
        label: ownerUser.name,
      })
      .from(recruitingRecord)
      .leftJoin(
        ownerUser,
        eq(
          ownerUser.id,
          sql<string>`COALESCE(${recruitingRecord.ownerId}, ${recruitingRecord.createdBy})`,
        ),
      )
      .where(and(eq(recruitingRecord.organizationId, organizationId), visibility ?? undefined))
      .orderBy(asc(ownerUser.name)),
  ]);

  const departments = new Map<string, string>();
  for (const row of jobRows) {
    if (row.departmentId && row.departmentName) {
      departments.set(row.departmentId, row.departmentName);
    }
  }
  return {
    departments: [...departments].map(([id, label]) => ({ id, label })),
    jobs: jobRows.map((row) => ({ id: row.jobId, label: row.jobName })),
    recruiters: recruiterRows.flatMap((row) =>
      row.id && row.label ? [{ id: row.id, label: row.label }] : [],
    ),
  };
}

async function loadLedgerJobSummary(
  organizationId: string,
  filters: RecruitingLedgerFilters,
  jobDescriptionIds: string[] | undefined,
  scope: RecruitingVisibilityScope,
): Promise<RecruitingLedgerResult["jobSummary"]> {
  const where = buildScopedResumeWhere(
    organizationId,
    {
      boardView: filters.boardView,
      createdAtBefore: filters.createdAtBefore,
      createdAtFrom: filters.createdAtFrom,
      jobDescriptionIds,
      joiningDateFrom: filters.joiningDateFrom,
      joiningDateTo: filters.joiningDateTo,
      recommendationLevels: filters.recommendationLevels,
      responsibleHrIds: filters.responsibleHrIds,
      search: filters.search,
    },
    scope,
  );
  const rows = await db
    .select({
      active: sql<number>`COUNT(*) FILTER (WHERE ${and(
        eq(recruitingRecordReadModel.outcome, "in_pipeline"),
        sql`${recruitingRecordReadModel.pipelineStage} <> 'onboarding'`,
      )})`.mapWith(Number),
      confirmed: sql<number>`COUNT(*) FILTER (WHERE ${or(
        eq(recruitingRecordReadModel.outcome, "hired"),
        and(
          eq(recruitingRecordReadModel.outcome, "in_pipeline"),
          eq(recruitingRecordReadModel.pipelineStage, "onboarding"),
        ),
      )})`.mapWith(Number),
      departmentName: department.name,
      headcount: jobDescription.headcount,
      hired:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} = 'hired')`.mapWith(
          Number,
        ),
      id: jobDescription.id,
      jobPriority: jobDescription.priority,
      jobWeight: jobDescription.jobWeight,
      name: jobDescription.name,
      negativeClosed:
        sql<number>`COUNT(*) FILTER (WHERE ${recruitingRecordReadModel.outcome} IN ('rejected', 'withdrawn'))`.mapWith(
          Number,
        ),
      total: count(recruitingRecordReadModel.id),
    })
    .from(jobDescription)
    .leftJoin(
      recruitingRecordReadModel,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
        where,
      ),
    )
    .leftJoin(
      department,
      and(
        eq(department.id, jobDescription.departmentId),
        eq(department.organizationId, jobDescription.organizationId),
      ),
    )
    .where(
      and(
        eq(jobDescription.organizationId, organizationId),
        eq(jobDescription.lifecycleStatus, "published"),
        jobDescriptionIds?.length ? inArray(jobDescription.id, jobDescriptionIds) : undefined,
      ),
    )
    .groupBy(
      jobDescription.id,
      jobDescription.name,
      jobDescription.headcount,
      jobDescription.jobWeight,
      jobDescription.priority,
      department.name,
    )
    .orderBy(asc(jobDescription.name));
  const filtersCandidates = Boolean(
    (filters.boardView && filters.boardView !== "all") ||
    filters.createdAtBefore ||
    filters.createdAtFrom ||
    filters.joiningDateFrom ||
    filters.joiningDateTo ||
    filters.recommendationLevels?.length ||
    filters.responsibleHrIds?.length ||
    filters.search,
  );
  const normalizedSearch = filters.search?.trim().toLocaleLowerCase("zh-CN");
  return rows
    .filter(
      (row) =>
        row.total > 0 ||
        !filtersCandidates ||
        Boolean(normalizedSearch && row.name.toLocaleLowerCase("zh-CN").includes(normalizedSearch)),
    )
    .map((row) => ({
      ...row,
      gap: calculateRecruitingGap(row.headcount, row.confirmed),
      recruitingPoints:
        calculateRecruitingPoints({
          jobPriority: row.jobPriority,
          jobWeight: row.jobWeight,
          outcome: "hired",
        }) * row.hired,
    }));
}

interface MutableRound extends RecruitingLedgerHumanRound {
  id: string;
  roundKind: "second_interview" | "final_interview";
  sortOrder: number;
}

function selectHumanRound(items: MutableRound[] | undefined): RecruitingLedgerHumanRound | null {
  const selected = items?.find((item) => item.status !== "cancelled") ?? items?.[0];
  if (!selected) {
    return null;
  }
  const { id: _id, roundKind: _roundKind, sortOrder: _sortOrder, ...summary } = selected;
  return summary;
}

async function loadHumanRounds(recordIds: string[], organizationId: string) {
  const rows = await db
    .select({
      interviewerName: interviewerUser.name,
      label: humanInterviewRound.label,
      outcome: humanInterviewRound.outcome,
      recordId: humanInterviewRound.recruitingRecordId,
      roundId: humanInterviewRound.id,
      roundKind: humanInterviewRound.roundKind,
      scheduledAt: humanInterviewRound.scheduledAt,
      sortOrder: humanInterviewRound.sortOrder,
      status: humanInterviewRound.status,
    })
    .from(humanInterviewRound)
    .leftJoin(
      humanInterviewRoundInterviewer,
      and(
        eq(humanInterviewRoundInterviewer.roundId, humanInterviewRound.id),
        eq(humanInterviewRoundInterviewer.organizationId, humanInterviewRound.organizationId),
      ),
    )
    .leftJoin(interviewerUser, eq(interviewerUser.id, humanInterviewRoundInterviewer.userId))
    .where(
      and(
        eq(humanInterviewRound.organizationId, organizationId),
        inArray(humanInterviewRound.recruitingRecordId, recordIds),
      ),
    )
    .orderBy(desc(humanInterviewRound.sortOrder));

  const rounds = new Map<string, MutableRound>();
  for (const row of rows) {
    const current = rounds.get(row.roundId);
    if (current) {
      if (row.interviewerName && !current.interviewerNames.includes(row.interviewerName)) {
        current.interviewerNames.push(row.interviewerName);
      }
      continue;
    }
    rounds.set(row.roundId, {
      id: row.roundId,
      interviewerNames: row.interviewerName ? [row.interviewerName] : [],
      label: row.label,
      outcome: row.outcome,
      roundKind: row.roundKind,
      scheduledAt: serializeDate(row.scheduledAt),
      sortOrder: row.sortOrder,
      status: row.status,
    });
  }

  const byRecord = new Map<
    string,
    { final_interview: MutableRound[]; second_interview: MutableRound[] }
  >();
  for (const row of rows) {
    const round = rounds.get(row.roundId);
    if (!round) {
      continue;
    }
    const current = byRecord.get(row.recordId) ?? {
      final_interview: [],
      second_interview: [],
    };
    if (!current[row.roundKind].some((item) => item.id === round.id)) {
      current[row.roundKind].push(round);
    }
    byRecord.set(row.recordId, current);
  }
  return byRecord;
}

async function loadLatestOffers(recordIds: string[], organizationId: string) {
  const rows = await db
    .select({
      baseSalary: recruitingOffer.baseSalary,
      bonus: recruitingOffer.bonus,
      currency: recruitingOffer.currency,
      joiningDate: recruitingOffer.joiningDate,
      recordId: recruitingOffer.recruitingRecordId,
      status: recruitingOffer.status,
      version: recruitingOffer.version,
    })
    .from(recruitingOffer)
    .where(
      and(
        eq(recruitingOffer.organizationId, organizationId),
        inArray(recruitingOffer.recruitingRecordId, recordIds),
      ),
    )
    .orderBy(desc(recruitingOffer.version));
  const result = new Map<string, RecruitingLedgerResult["records"][number]["offer"]>();
  for (const row of rows) {
    if (row.status === "superseded" || result.has(row.recordId)) {
      continue;
    }
    result.set(row.recordId, {
      baseSalary: row.baseSalary,
      bonus: row.bonus,
      currency: row.currency,
      joiningDate: serializeDate(row.joiningDate),
      status: row.status,
    });
  }
  return result;
}

async function loadInformationSyncStatuses(recordIds: string[], organizationId: string) {
  const rows = await db
    .select({
      detail: recruitingEvent.detail,
      recordId: recruitingEvent.recruitingRecordId,
    })
    .from(recruitingEvent)
    .where(
      and(
        eq(recruitingEvent.organizationId, organizationId),
        eq(recruitingEvent.action, "information_sync_status_changed"),
        inArray(recruitingEvent.recruitingRecordId, recordIds),
      ),
    )
    .orderBy(desc(recruitingEvent.createdAt), desc(recruitingEvent.id));
  const statuses = new Map<string, "not_synced" | "synced">();
  for (const row of rows) {
    if (!statuses.has(row.recordId)) {
      statuses.set(row.recordId, row.detail.synced === true ? "synced" : "not_synced");
    }
  }
  return statuses;
}

export async function setRecruitingLedgerInformationSync(input: {
  operatorId: string;
  organizationId: string;
  recordId: string;
  scope: RecruitingVisibilityScope;
  synced: boolean;
}) {
  const [visible] = await db
    .select({ id: recruitingRecordReadModel.id })
    .from(recruitingRecordReadModel)
    .where(
      and(
        buildScopedResumeWhere(input.organizationId, {}, input.scope),
        eq(recruitingRecordReadModel.id, input.recordId),
      ),
    )
    .limit(1);
  if (!visible) {
    return null;
  }
  await db.insert(recruitingEvent).values({
    action: "information_sync_status_changed",
    detail: { synced: input.synced },
    id: crypto.randomUUID(),
    operatorId: input.operatorId,
    organizationId: input.organizationId,
    recruitingRecordId: input.recordId,
  });
  return { informationSyncStatus: input.synced ? ("synced" as const) : ("not_synced" as const) };
}

export async function queryRecruitingLedger(
  organizationId: string,
  filters: RecruitingLedgerFilters,
  pagination: RecruitingLedgerPagination,
  scope: RecruitingVisibilityScope,
): Promise<RecruitingLedgerResult> {
  const jobDescriptionIds = await resolveJobDescriptionIds(organizationId, filters);
  const [page, facets, jobSummary] = await Promise.all([
    queryPaginatedResumeRecords(
      organizationId,
      {
        boardView: filters.boardView,
        createdAtBefore: filters.createdAtBefore,
        createdAtFrom: filters.createdAtFrom,
        jobDescriptionIds,
        joiningDateFrom: filters.joiningDateFrom,
        joiningDateTo: filters.joiningDateTo,
        recommendationLevels: filters.recommendationLevels,
        responsibleHrIds: filters.responsibleHrIds,
        search: filters.search,
      },
      pagination,
      scope,
    ),
    loadLedgerFacets(organizationId, scope),
    loadLedgerJobSummary(organizationId, filters, jobDescriptionIds, scope),
  ]);
  const recordIds = page.records.map((record) => record.id);
  if (recordIds.length === 0) {
    return { ...page, facets, jobSummary, records: [] };
  }

  const [metadataRows, roundsByRecord, offersByRecord, informationSyncStatuses] = await Promise.all(
    [
      db
        .select({
          actualJoiningDate: recruitingFulfillment.actualJoiningDate,
          candidateExpectationsMeta: recruitingFulfillment.candidateExpectations,
          closedAt: recruitingRecord.closedAt,
          departmentName: department.name,
          id: recruitingRecord.id,
          jobName: jobDescription.name,
          jobPriority: jobDescription.priority,
          jobWeight: jobDescription.jobWeight,
          reportingManagerName: managerUser.name,
          responsibleHrId: sql<
            string | null
          >`COALESCE(${recruitingRecord.ownerId}, ${recruitingRecord.createdBy})`,
          responsibleHrName: ownerUser.name,
        })
        .from(recruitingRecord)
        .leftJoin(
          jobDescription,
          and(
            eq(jobDescription.id, recruitingRecord.jobDescriptionId),
            eq(jobDescription.organizationId, recruitingRecord.organizationId),
          ),
        )
        .leftJoin(
          department,
          and(
            eq(department.id, jobDescription.departmentId),
            eq(department.organizationId, recruitingRecord.organizationId),
          ),
        )
        .leftJoin(managerUser, eq(managerUser.id, jobDescription.reportingManagerUserId))
        .leftJoin(
          recruitingFulfillment,
          and(
            eq(recruitingFulfillment.recruitingRecordId, recruitingRecord.id),
            eq(recruitingFulfillment.organizationId, recruitingRecord.organizationId),
          ),
        )
        .leftJoin(
          ownerUser,
          eq(
            ownerUser.id,
            sql<string>`COALESCE(${recruitingRecord.ownerId}, ${recruitingRecord.createdBy})`,
          ),
        )
        .where(
          and(
            eq(recruitingRecord.organizationId, organizationId),
            inArray(recruitingRecord.id, recordIds),
          ),
        ),
      loadHumanRounds(recordIds, organizationId),
      loadLatestOffers(recordIds, organizationId),
      loadInformationSyncStatuses(recordIds, organizationId),
    ],
  );
  const metadata = new Map(metadataRows.map((row) => [row.id, row]));

  return {
    ...page,
    facets,
    jobSummary,
    // oxlint-disable-next-line complexity -- optional projections stay explicit in the row mapper.
    records: page.records.map((record) => {
      const meta = metadata.get(record.id);
      const progress = describeResumeProgress(record);
      const rounds = roundsByRecord.get(record.id);
      const closedAt = serializeDate(meta?.closedAt ?? null);
      const jobPriority = meta?.jobPriority ?? null;
      const jobWeight = meta?.jobWeight ?? null;
      const offer = offersByRecord.get(record.id) ?? null;
      const expectations = meta?.candidateExpectationsMeta;
      return {
        candidateName: record.candidateName,
        closedAt,
        createdAt: record.createdAt,
        cycleDays: calculateRecruitingCycleDays({ closedAt, createdAt: record.createdAt }),
        departmentName: meta?.departmentName ?? record.jobDescriptionDepartmentName,
        documentUrl: record.feishuDocumentUrl,
        firstHumanRound: selectHumanRound(rounds?.second_interview),
        id: record.id,
        informationSyncStatus: informationSyncStatuses.get(record.id) ?? "not_synced",
        jobDescriptionId: record.jobDescriptionId,
        jobName: meta?.jobName ?? record.jobDescriptionName,
        jobPriority,
        jobWeight,
        joiningDate: serializeDate(meta?.actualJoiningDate ?? null) ?? offer?.joiningDate ?? null,
        offer,
        outcome: record.outcome,
        overseasSalary: expectations?.overseasSalary ?? null,
        pipelineStage: record.pipelineStage,
        probationSalary: expectations?.probationSalary ?? null,
        progressLabel: progress.label,
        progressTone: progress.tone,
        qualitativeRecommendationLevel: record.qualitativeRecommendationLevel,
        recruitingPoints: calculateRecruitingPoints({
          jobPriority,
          jobWeight,
          outcome: record.outcome,
        }),
        regularSalary: expectations?.agreedBaseSalary ?? offer?.baseSalary ?? null,
        reportingManagerName: meta?.reportingManagerName ?? null,
        responsibleHrId: meta?.responsibleHrId ?? record.createdBy,
        responsibleHrName: meta?.responsibleHrName ?? record.creatorName,
        salaryCurrency: offer?.currency ?? "CNY",
        secondHumanRound: selectHumanRound(rounds?.final_interview),
      };
    }),
  };
}
