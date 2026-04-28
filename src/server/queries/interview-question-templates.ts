import type {
  InterviewQuestionTemplateDifficulty,
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateQuestionRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
  InterviewQuestionTemplateSnapshot,
  InterviewQuestionTemplateVersionRecord,
} from "@/lib/interview-question-templates";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
  jobDescription,
  studioInterview,
} from "@/lib/db/schema";
import { buildTemplateSnapshot, hashTemplateSnapshot } from "@/lib/interview-question-templates";

// =====================================================================
// Pagination + filters
// =====================================================================

const templateListFiltersSchema = z.object({
  jobDescriptionId: z.string().trim().max(120).optional().nullable(),
  scope: z.enum(["global", "job_description"]).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
});

const SORT_COLUMNS = ["createdAt", "title", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const templatePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type InterviewQuestionTemplatePaginationParams = z.infer<typeof templatePaginationSchema>;

export interface PaginatedInterviewQuestionTemplateResult {
  records: InterviewQuestionTemplateListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildWhereConditions({
  search,
  scope,
  jobDescriptionId,
}: {
  search?: string;
  scope?: InterviewQuestionTemplateScope;
  jobDescriptionId?: string;
}) {
  const conditions = [] as (ReturnType<typeof ilike> | ReturnType<typeof eq>)[];
  if (search) {
    const searchCond = or(
      ilike(interviewQuestionTemplate.title, `%${search}%`),
      ilike(interviewQuestionTemplate.description, `%${search}%`),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }
  if (scope) {
    conditions.push(eq(interviewQuestionTemplate.scope, scope));
  }
  if (jobDescriptionId) {
    conditions.push(eq(interviewQuestionTemplate.jobDescriptionId, jobDescriptionId));
  }
  if (conditions.length === 0) {
    return;
  }
  return and(...conditions);
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    createdAt: interviewQuestionTemplate.createdAt,
    title: interviewQuestionTemplate.title,
    updatedAt: interviewQuestionTemplate.updatedAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// =====================================================================
// Row loaders (shared)
// =====================================================================

function listTemplateRows({
  search,
  scope,
  jobDescriptionId,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  search?: string;
  scope?: InterviewQuestionTemplateScope;
  jobDescriptionId?: string;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ jobDescriptionId, scope, search });

  let query = db
    .select({
      createdAt: interviewQuestionTemplate.createdAt,
      createdBy: interviewQuestionTemplate.createdBy,
      description: interviewQuestionTemplate.description,
      id: interviewQuestionTemplate.id,
      jobDescriptionId: interviewQuestionTemplate.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      scope: interviewQuestionTemplate.scope,
      title: interviewQuestionTemplate.title,
      updatedAt: interviewQuestionTemplate.updatedAt,
    })
    .from(interviewQuestionTemplate)
    .leftJoin(jobDescription, eq(interviewQuestionTemplate.jobDescriptionId, jobDescription.id))
    .where(where)
    .orderBy(buildOrderBy(sortBy, sortOrder))
    .$dynamic();

  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (offset !== undefined) {
    query = query.offset(offset);
  }

  return query;
}

async function countTemplateRows({
  search,
  scope,
  jobDescriptionId,
}: {
  search?: string;
  scope?: InterviewQuestionTemplateScope;
  jobDescriptionId?: string;
}) {
  const where = buildWhereConditions({ jobDescriptionId, scope, search });
  const [result] = await db.select({ count: count() }).from(interviewQuestionTemplate).where(where);
  return result?.count ?? 0;
}

async function loadQuestionCountsByTemplate(templateIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (templateIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      count: count(),
      templateId: interviewQuestionTemplateQuestion.templateId,
    })
    .from(interviewQuestionTemplateQuestion)
    .where(inArray(interviewQuestionTemplateQuestion.templateId, templateIds))
    .groupBy(interviewQuestionTemplateQuestion.templateId);
  for (const row of rows) {
    map.set(row.templateId, row.count);
  }
  return map;
}

async function loadBindingCountsByTemplate(templateIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (templateIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      count: count(),
      templateId: interviewQuestionTemplateBinding.templateId,
    })
    .from(interviewQuestionTemplateBinding)
    .where(inArray(interviewQuestionTemplateBinding.templateId, templateIds))
    .groupBy(interviewQuestionTemplateBinding.templateId);
  for (const row of rows) {
    map.set(row.templateId, row.count);
  }
  return map;
}

function toListRecord(
  row: Awaited<ReturnType<typeof listTemplateRows>>[number],
  questionCount: number,
  bindingCount: number,
): InterviewQuestionTemplateListRecord {
  return {
    bindingCount,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    questionCount,
    scope: row.scope,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  };
}

function parseFilters(filters?: {
  search?: string | null;
  scope?: string | null;
  jobDescriptionId?: string | null;
}) {
  const parsed = templateListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return {
      jobDescriptionId: undefined,
      scope: undefined,
      search: undefined,
    };
  }
  return {
    jobDescriptionId: parsed.data.jobDescriptionId?.trim() || undefined,
    scope: (parsed.data.scope as InterviewQuestionTemplateScope | undefined) ?? undefined,
    search: parsed.data.search?.trim() || undefined,
  };
}

export function parseInterviewQuestionTemplatePagination(
  params?: Record<string, unknown>,
): InterviewQuestionTemplatePaginationParams {
  return templatePaginationSchema.parse(params ?? {});
}

// =====================================================================
// Public queries
// =====================================================================

export async function queryPaginatedInterviewQuestionTemplates(
  filters?: {
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
  },
  pagination?: Record<string, unknown>,
): Promise<PaginatedInterviewQuestionTemplateResult> {
  const { search, scope, jobDescriptionId } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } =
    parseInterviewQuestionTemplatePagination(pagination);
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listTemplateRows({
      jobDescriptionId,
      limit: pageSize,
      offset,
      scope,
      search,
      sortBy,
      sortOrder,
    }),
    countTemplateRows({ jobDescriptionId, scope, search }),
  ]);

  const ids = rows.map((row) => row.id);
  const [questionCounts, bindingCounts] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadBindingCountsByTemplate(ids),
  ]);

  return {
    page,
    pageSize,
    records: rows.map((row) =>
      toListRecord(row, questionCounts.get(row.id) ?? 0, bindingCounts.get(row.id) ?? 0),
    ),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listInterviewQuestionTemplates(
  filters?: {
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
  },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag("interview-question-templates");
  cacheLife("minutes");

  return queryPaginatedInterviewQuestionTemplates(filters, pagination);
}

// oxlint-disable-next-line require-await
export async function listAllInterviewQuestionTemplates(): Promise<
  InterviewQuestionTemplateListRecord[]
> {
  "use cache";
  cacheTag("interview-question-templates");
  cacheLife("minutes");

  const rows = await listTemplateRows({ sortBy: "title", sortOrder: "asc" });
  const ids = rows.map((row) => row.id);
  const [questionCounts, bindingCounts] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadBindingCountsByTemplate(ids),
  ]);
  return rows.map((row) =>
    toListRecord(row, questionCounts.get(row.id) ?? 0, bindingCounts.get(row.id) ?? 0),
  );
}

function mapQuestionRow(
  row: typeof interviewQuestionTemplateQuestion.$inferSelect,
): InterviewQuestionTemplateQuestionRecord {
  return {
    content: row.content,
    createdAt: serializeDate(row.createdAt),
    difficulty: row.difficulty,
    id: row.id,
    sortOrder: row.sortOrder,
    templateId: row.templateId,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export async function loadInterviewQuestionTemplateById(
  id: string,
): Promise<InterviewQuestionTemplateRecord | null> {
  const [row] = await db
    .select()
    .from(interviewQuestionTemplate)
    .where(eq(interviewQuestionTemplate.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const questions = await db
    .select()
    .from(interviewQuestionTemplateQuestion)
    .where(eq(interviewQuestionTemplateQuestion.templateId, id))
    .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder));
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    questions: questions.map(mapQuestionRow),
    scope: row.scope,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  };
}

// =====================================================================
// Applicable templates for an interview
// =====================================================================

export async function loadApplicableInterviewQuestionTemplates(interviewRecordId: string): Promise<{
  global: InterviewQuestionTemplateRecord[];
  jobSpecific: InterviewQuestionTemplateRecord[];
}> {
  const [interviewRow] = await db
    .select({ jobDescriptionId: studioInterview.jobDescriptionId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);

  const jobDescriptionId = interviewRow?.jobDescriptionId ?? null;

  const templateRows = await db
    .select()
    .from(interviewQuestionTemplate)
    .where(
      or(
        eq(interviewQuestionTemplate.scope, "global"),
        jobDescriptionId
          ? and(
              eq(interviewQuestionTemplate.scope, "job_description"),
              eq(interviewQuestionTemplate.jobDescriptionId, jobDescriptionId),
            )
          : undefined,
      ),
    )
    .orderBy(asc(interviewQuestionTemplate.scope), asc(interviewQuestionTemplate.createdAt));

  if (templateRows.length === 0) {
    return { global: [], jobSpecific: [] };
  }

  const ids = templateRows.map((row) => row.id);
  const questionRows = await db
    .select()
    .from(interviewQuestionTemplateQuestion)
    .where(inArray(interviewQuestionTemplateQuestion.templateId, ids))
    .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder));

  const questionsByTemplate = new Map<string, InterviewQuestionTemplateQuestionRecord[]>();
  for (const id of ids) {
    questionsByTemplate.set(id, []);
  }
  for (const row of questionRows) {
    questionsByTemplate.get(row.templateId)?.push(mapQuestionRow(row));
  }

  const toRecord = (row: (typeof templateRows)[number]): InterviewQuestionTemplateRecord => ({
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    questions: questionsByTemplate.get(row.id) ?? [],
    scope: row.scope,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  });

  const global: InterviewQuestionTemplateRecord[] = [];
  const jobSpecific: InterviewQuestionTemplateRecord[] = [];
  for (const row of templateRows) {
    if (row.scope === "global") {
      global.push(toRecord(row));
    } else {
      jobSpecific.push(toRecord(row));
    }
  }
  return { global, jobSpecific };
}

// =====================================================================
// Versioning
// =====================================================================

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function resolveOrCreateInterviewQuestionTemplateVersion(
  tx: Tx,
  templateId: string,
): Promise<InterviewQuestionTemplateVersionRecord> {
  const [templateRow] = await tx
    .select()
    .from(interviewQuestionTemplate)
    .where(eq(interviewQuestionTemplate.id, templateId))
    .limit(1);
  if (!templateRow) {
    throw new Error(`模板 ${templateId} 不存在`);
  }
  const questionRows = await tx
    .select()
    .from(interviewQuestionTemplateQuestion)
    .where(eq(interviewQuestionTemplateQuestion.templateId, templateId))
    .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder));

  const snapshot: InterviewQuestionTemplateSnapshot = buildTemplateSnapshot({
    description: templateRow.description,
    jobDescriptionId: templateRow.jobDescriptionId,
    questions: questionRows.map(mapQuestionRow),
    scope: templateRow.scope,
    templateId: templateRow.id,
    title: templateRow.title,
  });
  const contentHash = hashTemplateSnapshot(snapshot);

  const [existing] = await tx
    .select()
    .from(interviewQuestionTemplateVersion)
    .where(
      and(
        eq(interviewQuestionTemplateVersion.templateId, templateId),
        eq(interviewQuestionTemplateVersion.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      contentHash: existing.contentHash,
      createdAt: serializeDate(existing.createdAt),
      id: existing.id,
      snapshot: existing.snapshot,
      templateId: existing.templateId,
      version: existing.version,
    };
  }

  const [maxRow] = await tx
    .select({ maxVersion: interviewQuestionTemplateVersion.version })
    .from(interviewQuestionTemplateVersion)
    .where(eq(interviewQuestionTemplateVersion.templateId, templateId))
    .orderBy(desc(interviewQuestionTemplateVersion.version))
    .limit(1);
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  try {
    const [inserted] = await tx
      .insert(interviewQuestionTemplateVersion)
      .values({
        contentHash,
        createdAt: new Date(),
        id: crypto.randomUUID(),
        snapshot,
        templateId,
        version: nextVersion,
      })
      .returning();
    if (!inserted) {
      throw new Error("版本写入失败");
    }
    return {
      contentHash: inserted.contentHash,
      createdAt: serializeDate(inserted.createdAt),
      id: inserted.id,
      snapshot: inserted.snapshot,
      templateId: inserted.templateId,
      version: inserted.version,
    };
  } catch (error) {
    const [loser] = await tx
      .select()
      .from(interviewQuestionTemplateVersion)
      .where(
        and(
          eq(interviewQuestionTemplateVersion.templateId, templateId),
          eq(interviewQuestionTemplateVersion.contentHash, contentHash),
        ),
      )
      .limit(1);
    if (!loser) {
      throw error;
    }
    return {
      contentHash: loser.contentHash,
      createdAt: serializeDate(loser.createdAt),
      id: loser.id,
      snapshot: loser.snapshot,
      templateId: loser.templateId,
      version: loser.version,
    };
  }
}

export async function loadInterviewQuestionTemplateVersionById(
  templateId: string,
  versionId: string,
): Promise<InterviewQuestionTemplateVersionRecord | null> {
  const [row] = await db
    .select()
    .from(interviewQuestionTemplateVersion)
    .where(
      and(
        eq(interviewQuestionTemplateVersion.id, versionId),
        eq(interviewQuestionTemplateVersion.templateId, templateId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    contentHash: row.contentHash,
    createdAt: serializeDate(row.createdAt),
    id: row.id,
    snapshot: row.snapshot,
    templateId: row.templateId,
    version: row.version,
  };
}

// =====================================================================
// Bindings (interview ↔ template version)
// =====================================================================

interface ApplicableTemplateMeta {
  id: string;
  scope: InterviewQuestionTemplateScope;
  createdAt: Date;
}

async function listApplicableTemplateMetas(
  tx: Tx,
  jobDescriptionId: string | null,
): Promise<ApplicableTemplateMeta[]> {
  const rows = await tx
    .select({
      createdAt: interviewQuestionTemplate.createdAt,
      id: interviewQuestionTemplate.id,
      scope: interviewQuestionTemplate.scope,
    })
    .from(interviewQuestionTemplate)
    .where(
      or(
        eq(interviewQuestionTemplate.scope, "global"),
        jobDescriptionId
          ? and(
              eq(interviewQuestionTemplate.scope, "job_description"),
              eq(interviewQuestionTemplate.jobDescriptionId, jobDescriptionId),
            )
          : undefined,
      ),
    );

  // Order: job_description first (sortOrder 0..N-1), global second (N..M-1).
  // Within each scope, oldest createdAt first for deterministic ordering.
  return rows.toSorted((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === "job_description" ? -1 : 1;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Add bindings for templates that don't yet have one. Existing bindings —
 * including their `disabledByUser` state — are left untouched. This is the
 * core "auto-attach on interview create / on JD change" routine.
 */
export async function autoBindApplicableTemplates(
  tx: Tx,
  interviewRecordId: string,
  jobDescriptionId: string | null,
): Promise<void> {
  const applicable = await listApplicableTemplateMetas(tx, jobDescriptionId);
  if (applicable.length === 0) {
    return;
  }

  const existingBindings = await tx
    .select({ templateId: interviewQuestionTemplateBinding.templateId })
    .from(interviewQuestionTemplateBinding)
    .where(eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId));
  const existingSet = new Set(existingBindings.map((b) => b.templateId));

  // Find the next sortOrder slot to append from. Existing rows keep their
  // sortOrder; new rows are appended at the tail (higher numbers).
  const [maxRow] = await tx
    .select({ maxOrder: interviewQuestionTemplateBinding.sortOrder })
    .from(interviewQuestionTemplateBinding)
    .where(eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId))
    .orderBy(desc(interviewQuestionTemplateBinding.sortOrder))
    .limit(1);
  let nextOrder = (maxRow?.maxOrder ?? -1) + 1;

  for (const meta of applicable) {
    if (existingSet.has(meta.id)) {
      continue;
    }
    const version = await resolveOrCreateInterviewQuestionTemplateVersion(tx, meta.id);
    await tx.insert(interviewQuestionTemplateBinding).values({
      createdAt: new Date(),
      disabledByUser: false,
      id: crypto.randomUUID(),
      interviewRecordId,
      sortOrder: nextOrder,
      templateId: meta.id,
      versionId: version.id,
    });
    nextOrder += 1;
  }
}

/**
 * Lazily sync bindings for an interview against the *current* set of
 * applicable templates: any global / JD-bound template that doesn't yet
 * have a binding row for this interview gets one (default enabled). This is
 * called from read paths so that templates created *after* an interview
 * (e.g. a new global template) propagate to existing interviews on next
 * access without manual intervention. No-op if all applicable templates
 * already have bindings.
 */
export async function ensureApplicableBindings(interviewRecordId: string): Promise<void> {
  const [row] = await db
    .select({ jobDescriptionId: studioInterview.jobDescriptionId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  if (!row) {
    return;
  }
  await db.transaction(async (tx) => {
    await autoBindApplicableTemplates(tx, interviewRecordId, row.jobDescriptionId);
  });
}

/**
 * Drop all bindings for the given interview where the template's scope is
 * `job_description`. Called when the interview's `jobDescriptionId` is being
 * changed — old JD-specific bindings should disappear before
 * `autoBindApplicableTemplates` adds the new ones. Global bindings (and their
 * `disabledByUser` state) are left untouched.
 */
export async function dropJobDescriptionBindings(tx: Tx, interviewRecordId: string): Promise<void> {
  const targets = await tx
    .select({ id: interviewQuestionTemplateBinding.id })
    .from(interviewQuestionTemplateBinding)
    .innerJoin(
      interviewQuestionTemplate,
      eq(interviewQuestionTemplateBinding.templateId, interviewQuestionTemplate.id),
    )
    .where(
      and(
        eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId),
        eq(interviewQuestionTemplate.scope, "job_description"),
      ),
    );
  if (targets.length === 0) {
    return;
  }
  await tx.delete(interviewQuestionTemplateBinding).where(
    inArray(
      interviewQuestionTemplateBinding.id,
      targets.map((t) => t.id),
    ),
  );
}

/**
 * Reconcile bindings to match the user's "enabled set" choice from the
 * interview detail page. Toggles `disabledByUser` rather than deleting rows
 * so the same template's state survives subsequent JD changes / re-binds.
 *
 * Templates in `enabledTemplateIds` that don't yet have a binding (e.g. user
 * just enabled a previously-unbound applicable template) get auto-bound.
 */
export async function replaceInterviewBindings(
  tx: Tx,
  interviewRecordId: string,
  enabledTemplateIds: string[],
  jobDescriptionId: string | null,
): Promise<void> {
  // First make sure all applicable templates have a binding row to toggle.
  await autoBindApplicableTemplates(tx, interviewRecordId, jobDescriptionId);

  const enabledSet = new Set(enabledTemplateIds);
  const all = await tx
    .select({
      id: interviewQuestionTemplateBinding.id,
      templateId: interviewQuestionTemplateBinding.templateId,
    })
    .from(interviewQuestionTemplateBinding)
    .where(eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId));

  for (const row of all) {
    const shouldBeDisabled = !enabledSet.has(row.templateId);
    await tx
      .update(interviewQuestionTemplateBinding)
      .set({ disabledByUser: shouldBeDisabled })
      .where(eq(interviewQuestionTemplateBinding.id, row.id));
  }
}

/**
 * 将该面试的所有模板绑定刷新到「当前」最新版本快照。
 * Refresh every template binding for the given interview to point at the
 * *current* latest version snapshot of its template.
 *
 * 同时对在原绑定后新建、且对该面试适用（global / 同 JD）的模板补一条
 * binding，使其与重置时刻的「适用集」对齐。已绑定但被用户禁用的行也会
 * 被刷新——`disabledByUser` 不变，只动 `versionId`，确保后续启用时
 * 自然指向最新内容。
 *
 * Also lazily binds any newly-applicable templates created since the
 * existing bindings were written. Disabled bindings get refreshed too —
 * `disabledByUser` is preserved, only `versionId` moves — so re-enabling
 * them later naturally picks up the latest content.
 *
 * 若模板内容自上次绑定以来未变，`resolveOrCreate...Version` 会复用同一
 * version 行，update 是 no-op。
 * If a template's content hasn't changed, the resolver returns the same
 * version row and the update is a no-op.
 */
export async function refreshInterviewBindingsToLatest(
  tx: Tx,
  interviewRecordId: string,
  jobDescriptionId: string | null,
): Promise<void> {
  // 先把这次重置之前新建的适用模板补上 binding。
  // First lazy-bind any applicable templates added since prior bindings.
  await autoBindApplicableTemplates(tx, interviewRecordId, jobDescriptionId);

  const bindings = await tx
    .select({
      id: interviewQuestionTemplateBinding.id,
      templateId: interviewQuestionTemplateBinding.templateId,
      versionId: interviewQuestionTemplateBinding.versionId,
    })
    .from(interviewQuestionTemplateBinding)
    .where(eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId));

  for (const row of bindings) {
    const latest = await resolveOrCreateInterviewQuestionTemplateVersion(tx, row.templateId);
    if (latest.id === row.versionId) {
      continue;
    }
    await tx
      .update(interviewQuestionTemplateBinding)
      .set({ versionId: latest.id })
      .where(eq(interviewQuestionTemplateBinding.id, row.id));
  }
}

/**
 * Single-join read used by the LiveKit-token + agent-instructions paths.
 * Returns the flattened list of question content the agent must ask, in
 * binding sortOrder × question sortOrder order. Disabled bindings are
 * filtered out.
 */
export interface InterviewPresetQuestion {
  content: string;
  difficulty: InterviewQuestionTemplateDifficulty;
}

export async function loadInterviewPresetQuestions(
  interviewRecordId: string,
): Promise<InterviewPresetQuestion[]> {
  const rows = await db
    .select({
      bindingSortOrder: interviewQuestionTemplateBinding.sortOrder,
      snapshot: interviewQuestionTemplateVersion.snapshot,
    })
    .from(interviewQuestionTemplateBinding)
    .innerJoin(
      interviewQuestionTemplateVersion,
      eq(interviewQuestionTemplateBinding.versionId, interviewQuestionTemplateVersion.id),
    )
    .where(
      and(
        eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId),
        eq(interviewQuestionTemplateBinding.disabledByUser, false),
      ),
    )
    .orderBy(asc(interviewQuestionTemplateBinding.sortOrder));

  const out: InterviewPresetQuestion[] = [];
  for (const row of rows) {
    const snapshotQuestions = [...row.snapshot.questions].toSorted(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (const q of snapshotQuestions) {
      const trimmed = q.content?.trim();
      if (trimmed) {
        out.push({ content: trimmed, difficulty: q.difficulty });
      }
    }
  }
  return out;
}

/**
 * Read the binding state surfaced to the interview detail page UI.
 * Returns the full `applicable` set (global + JD-bound) and a map of
 * which are currently bound + their disabled state.
 */
export async function loadInterviewQuestionTemplateBindings(interviewRecordId: string): Promise<{
  applicable: InterviewQuestionTemplateRecord[];
  bindings: {
    templateId: string;
    versionId: string;
    version: number;
    disabledByUser: boolean;
  }[];
}> {
  const { global, jobSpecific } = await loadApplicableInterviewQuestionTemplates(interviewRecordId);
  const applicable = [...jobSpecific, ...global];

  const bindingRows = await db
    .select({
      disabledByUser: interviewQuestionTemplateBinding.disabledByUser,
      templateId: interviewQuestionTemplateBinding.templateId,
      version: interviewQuestionTemplateVersion.version,
      versionId: interviewQuestionTemplateBinding.versionId,
    })
    .from(interviewQuestionTemplateBinding)
    .innerJoin(
      interviewQuestionTemplateVersion,
      eq(interviewQuestionTemplateBinding.versionId, interviewQuestionTemplateVersion.id),
    )
    .where(eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId));

  return { applicable, bindings: bindingRows };
}

export async function countBindingsByTemplate(templateId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(interviewQuestionTemplateBinding)
    .where(eq(interviewQuestionTemplateBinding.templateId, templateId));
  return row?.value ?? 0;
}
