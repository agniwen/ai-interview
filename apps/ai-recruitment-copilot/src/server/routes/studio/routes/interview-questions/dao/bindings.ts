import type {
  InterviewQuestionTemplateDifficulty,
  InterviewQuestionTemplateQuestionRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@arc/db-schema/interview-question-templates";
import { and, asc, count, desc, eq, exists, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
  studioInterview,
} from "@arc/db-schema/schema";
import { loadJobDescriptionsByTemplate, mapQuestionRow, serializeDate } from "./queries";
import { resolveOrCreateInterviewQuestionTemplateVersion } from "./versions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// =====================================================================
// Applicable templates for an interview
// =====================================================================

async function loadApplicableInterviewQuestionTemplates(interviewRecordId: string): Promise<{
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
      and(
        // 面试详情页的「面试题绑定」picker 不展示已归档模板。已经绑定它的
        // binding 行不动（在下游 loadInterviewQuestionTemplateBindings 里
        // 仍然能回显），只是新的 enable/disable 选择面不再列出归档模板。
        // The interview detail binding picker hides archived templates. Pre-
        // existing binding rows pointing at archived templates remain readable
        // downstream; only the "available to bind" surface drops them.
        isNull(interviewQuestionTemplate.archivedAt),
        or(
          eq(interviewQuestionTemplate.scope, "global"),
          jobDescriptionId
            ? and(
                eq(interviewQuestionTemplate.scope, "job_description"),
                exists(
                  db
                    .select({ one: interviewQuestionTemplateJobDescription.templateId })
                    .from(interviewQuestionTemplateJobDescription)
                    .where(
                      and(
                        eq(
                          interviewQuestionTemplateJobDescription.templateId,
                          interviewQuestionTemplate.id,
                        ),
                        eq(
                          interviewQuestionTemplateJobDescription.jobDescriptionId,
                          jobDescriptionId,
                        ),
                      ),
                    ),
                ),
              )
            : undefined,
        ),
      ),
    )
    .orderBy(asc(interviewQuestionTemplate.scope), asc(interviewQuestionTemplate.createdAt));

  if (templateRows.length === 0) {
    return { global: [], jobSpecific: [] };
  }

  const ids = templateRows.map((row) => row.id);
  const [questionRows, jdsByTemplate] = await Promise.all([
    db
      .select()
      .from(interviewQuestionTemplateQuestion)
      .where(inArray(interviewQuestionTemplateQuestion.templateId, ids))
      .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder)),
    loadJobDescriptionsByTemplate(ids),
  ]);

  const questionsByTemplate = new Map<string, InterviewQuestionTemplateQuestionRecord[]>();
  for (const id of ids) {
    questionsByTemplate.set(id, []);
  }
  for (const row of questionRows) {
    questionsByTemplate.get(row.templateId)?.push(mapQuestionRow(row));
  }

  const toRecord = (row: (typeof templateRows)[number]): InterviewQuestionTemplateRecord => {
    const jds = jdsByTemplate.get(row.id) ?? [];
    return {
      archivedAt: row.archivedAt ? serializeDate(row.archivedAt) : null,
      createdAt: serializeDate(row.createdAt),
      createdBy: row.createdBy,
      description: row.description,
      id: row.id,
      jobDescriptionIds: jds.map((jd) => jd.id),
      jobDescriptions: jds,
      questions: questionsByTemplate.get(row.id) ?? [],
      scope: row.scope,
      title: row.title,
      updatedAt: serializeDate(row.updatedAt),
    };
  };

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
      and(
        // 自动绑定时跳过已归档的模板：保留对老 binding 的兼容，但新面试不再
        // 自动应用归档模板。
        // Auto-binding skips archived templates: existing bindings remain intact
        // but new interviews no longer auto-apply archived ones.
        isNull(interviewQuestionTemplate.archivedAt),
        or(
          eq(interviewQuestionTemplate.scope, "global"),
          jobDescriptionId
            ? and(
                eq(interviewQuestionTemplate.scope, "job_description"),
                exists(
                  tx
                    .select({ one: interviewQuestionTemplateJobDescription.templateId })
                    .from(interviewQuestionTemplateJobDescription)
                    .where(
                      and(
                        eq(
                          interviewQuestionTemplateJobDescription.templateId,
                          interviewQuestionTemplate.id,
                        ),
                        eq(
                          interviewQuestionTemplateJobDescription.jobDescriptionId,
                          jobDescriptionId,
                        ),
                      ),
                    ),
                ),
              )
            : undefined,
        ),
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

  // 从 parent studio_interview 拿 organizationId, 新 binding 行必须打戳 (NOT NULL)。
  // 父行不存在直接抛错——继续插入会留下孤儿 binding,且伪造的 organizationId 会污染数据。
  // Parent row missing → throw. Inserting bindings without a real parent would
  // orphan the rows and faking organizationId would poison cross-tenant queries.
  const [parent] = await tx
    .select({ organizationId: studioInterview.organizationId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  if (!parent) {
    throw new Error(`autoBindApplicableTemplates: studio_interview ${interviewRecordId} not found`);
  }
  const { organizationId } = parent;

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
      organizationId,
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
