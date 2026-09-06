import { and, asc, eq, inArray, is, SQL, sql } from "drizzle-orm";
import {
  aiInterviewConversation,
  aiInterviewConversationTurn,
  aiInterviewRound,
  candidate,
  candidateResume,
  recruitingContextSnapshot,
  recruitingEvent,
  recruitingEvidenceSnapshot,
  recruitingFulfillment,
  recruitingInterviewPreparation,
  recruitingNodeState,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  recruitingRecord,
  recruitingResumeEvaluation,
  recruitingUploadBatchItem,
  recruitingNodeValues,
} from "@app/db-schema";
import type { RecruitingStage, RecruitingNode, RecruitingNodeStatus } from "@app/db-schema";
import type { Database } from "./index";
import type { RecruitingRecordFields } from "./recruiting-record-fields";
import { persistAssessment } from "./recruiting-assessment";
import { updateRecruitingNodeTx } from "./recruiting-pipeline";
import { recruitingRecordReadModel } from "./recruiting-read-model";
import type { RecruitingRecordRead } from "./recruiting-read-model";

export type RecruitingTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type RecruitingExecutor = Database | RecruitingTransaction;
/** 保留现有传输字段名；每组字段显式写入其所属新表，不把投影当成可写表。 */
export type RecruitingRecordValues = Partial<RecruitingRecordFields> & {
  pipelineStage?: RecruitingStage | "human_interview" | "written_test";
};
export type RecruitingRecordPatch = {
  [K in keyof RecruitingRecordValues]?: RecruitingRecordValues[K] | SQL;
};

type RecordRow = typeof recruitingRecord.$inferSelect;
function normalizeStage(stage: RecruitingRecordValues["pipelineStage"]): RecruitingStage {
  if (stage === "human_interview") {
    return "second_interview";
  }
  if (stage === "written_test") {
    return "screening";
  }
  return stage ?? "screening";
}
/** 在读取 JOIN 投影前单独锁定主记录，避免对 LEFT JOIN 的可空侧加锁。 */
export async function lockRecruitingRecord(
  tx: RecruitingTransaction,
  id: string,
  organizationId?: string,
) {
  const [record] = await tx
    .select()
    .from(recruitingRecord)
    .where(
      and(
        eq(recruitingRecord.id, id),
        organizationId ? eq(recruitingRecord.organizationId, organizationId) : undefined,
      ),
    )
    .for("update");
  return record ?? null;
}

function resumePatch(patch: RecruitingRecordValues): Partial<typeof candidateResume.$inferInsert> {
  return {
    contentHash: patch.resumeContentHash,
    fileName: patch.resumeFileName,
    parseError: patch.resumeParseError,
    parseStatus: patch.resumeParseStatus,
    parsedAt: patch.resumeParsedAt,
    profile: patch.resumeProfile,
    searchCjkBigrams: patch.searchCjkBigrams,
    searchText: patch.searchText,
    skillsNormalized: patch.skillsNormalized,
    storageKey: patch.resumeStorageKey,
    text: patch.resumeText,
  };
}
function hasValues<T extends object>(patch: T) {
  return Object.values(patch).some((value) => value !== undefined);
}
function needsResumeVersion(
  previous: typeof candidateResume.$inferSelect,
  patch: RecruitingRecordValues,
) {
  if (
    previous.storageKey &&
    patch.resumeStorageKey !== undefined &&
    patch.resumeStorageKey !== previous.storageKey
  ) {
    return true;
  }
  if (
    previous.contentHash &&
    patch.resumeContentHash !== undefined &&
    patch.resumeContentHash !== previous.contentHash
  ) {
    return true;
  }
  if (previous.parseStatus !== "ready") {
    return false;
  }
  if (patch.resumeStorageKey !== undefined && patch.resumeStorageKey !== previous.storageKey) {
    return true;
  }
  if (patch.resumeContentHash !== undefined && patch.resumeContentHash !== previous.contentHash) {
    return true;
  }
  if (patch.resumeText !== undefined && patch.resumeText !== previous.text) {
    return true;
  }
  return (
    patch.resumeProfile !== undefined &&
    JSON.stringify(patch.resumeProfile) !== JSON.stringify(previous.profile)
  );
}

async function persistResume(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
  now: Date,
): Promise<RecordRow> {
  const updates = resumePatch(patch);
  if (!hasValues(updates)) {
    return record;
  }
  const [previous] = record.resumeId
    ? await tx.select().from(candidateResume).where(eq(candidateResume.id, record.resumeId))
    : [];
  if (previous && !needsResumeVersion(previous, patch)) {
    await tx
      .update(candidateResume)
      .set({ ...updates, updatedAt: now })
      .where(eq(candidateResume.id, previous.id));
    return record;
  }
  // 同一人才未来可有多条招聘记录，版本号分配也须锁人才行，不能只锁一条招聘过程。
  await tx
    .select({ id: candidate.id })
    .from(candidate)
    .where(eq(candidate.id, record.candidateId))
    .for("update");
  const [last] = await tx
    .select({ version: sql<number>`COALESCE(MAX(${candidateResume.version}), 0)` })
    .from(candidateResume)
    .where(eq(candidateResume.candidateId, record.candidateId));
  const resumeId = crypto.randomUUID();
  const copied = { ...previous };
  // undefined 不能覆盖旧版本里需要继承的字段。
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, field]) => field !== undefined),
  );
  await tx.insert(candidateResume).values({
    ...copied,
    ...definedUpdates,
    candidateId: record.candidateId,
    createdAt: now,
    id: resumeId,
    organizationId: record.organizationId,
    updatedAt: now,
    version: Number(last?.version ?? 0) + 1,
  });
  await tx
    .update(recruitingRecord)
    .set({ activeEvaluationId: null, currentEvaluationId: null, resumeId })
    .where(eq(recruitingRecord.id, record.id));
  return { ...record, activeEvaluationId: null, currentEvaluationId: null, resumeId };
}

function mainRecordPatch(record: RecordRow, patch: RecruitingRecordValues, now: Date) {
  const values: Partial<typeof recruitingRecord.$inferInsert> = {
    createdAt: patch.createdAt,
    createdBy: patch.createdBy,
    hrResumeAssessment: patch.hrResumeAssessment,
    hrResumeAssessmentUpdatedAt: patch.hrResumeAssessmentUpdatedAt,
    hrResumeAssessmentUpdatedBy: patch.hrResumeAssessmentUpdatedBy,
    jobDescriptionId: patch.jobDescriptionId,
    notes: patch.notes,
    sourceImportedAt: patch.resumeSourceImportedAt,
    sourceImportedBy: patch.resumeSourceImportedBy,
    sourcePoolItemId: patch.resumeSourcePoolItemId,
    sourceType: patch.resumeSourceType,
    targetRole: patch.targetRole,
    updatedAt: now,
  };
  if (patch.jobDescriptionId !== undefined && patch.jobDescriptionId !== record.jobDescriptionId) {
    values.currentEvaluationId = null;
    values.activeEvaluationId = null;
  }
  return values;
}

function assertMetadataPatch(record: RecordRow, patch: RecruitingRecordValues) {
  if (
    patch.pipelineStage !== undefined &&
    normalizeStage(patch.pipelineStage) !== record.currentStage
  ) {
    throw new Error("流程变化必须通过招聘节点事务执行");
  }
  if (patch.outcome !== undefined && patch.outcome !== record.outcome) {
    throw new Error("流程变化必须通过招聘节点事务执行");
  }
  if (
    patch.closedAt !== undefined ||
    patch.closedMeta !== undefined ||
    patch.closedReason !== undefined
  ) {
    throw new Error("结束信息必须通过招聘节点事务执行");
  }
}

async function persistPreparation(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
  now: Date,
) {
  if (patch.interviewQuestions === undefined) {
    return;
  }
  await tx
    .insert(recruitingInterviewPreparation)
    .values({
      organizationId: record.organizationId,
      questions: patch.interviewQuestions,
      recruitingRecordId: record.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: { questions: patch.interviewQuestions, updatedAt: now },
      target: recruitingInterviewPreparation.recruitingRecordId,
    });
}
async function persistFulfillment(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
  now: Date,
) {
  if (patch.candidateExpectationsMeta === undefined) {
    return;
  }
  await tx
    .insert(recruitingFulfillment)
    .values({
      candidateExpectations: patch.candidateExpectationsMeta,
      organizationId: record.organizationId,
      recruitingRecordId: record.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: { candidateExpectations: patch.candidateExpectationsMeta, updatedAt: now },
      target: recruitingFulfillment.recruitingRecordId,
    });
}

async function persistScreeningDecision(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
  now: Date,
) {
  if (patch.resumeEvaluationStatus === undefined) {
    return;
  }
  const [node] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, record.id),
        eq(recruitingNodeState.node, "screening"),
      ),
    );
  if ((node?.result ?? null) === patch.resumeEvaluationStatus) {
    return;
  }
  // 不能在后续节点上改写前置筛选事实；需要显式回退后重新确认。
  await updateRecruitingNodeTx(tx, {
    closeReason: "resume_rejected",
    node: "screening",
    now,
    operatorId: patch.hrResumeAssessmentUpdatedBy ?? null,
    organizationId: record.organizationId,
    reason: patch.hrResumeAssessment ?? undefined,
    recordId: record.id,
    result: patch.resumeEvaluationStatus,
    status: patch.resumeEvaluationStatus ? "completed" : "pending",
  });
}

async function refreshSearch(tx: RecruitingTransaction, record: RecordRow) {
  if (!record.resumeId) {
    return;
  }
  const [source] = await tx
    .select({
      email: candidate.email,
      fileName: candidateResume.fileName,
      name: candidate.name,
      phone: candidate.phone,
      profile: candidateResume.profile,
      role: recruitingRecord.targetRole,
    })
    .from(recruitingRecord)
    .innerJoin(candidate, eq(candidate.id, recruitingRecord.candidateId))
    .innerJoin(candidateResume, eq(candidateResume.id, recruitingRecord.resumeId))
    .where(eq(recruitingRecord.id, record.id));
  if (!source) {
    return;
  }
  // 新表没有旧表触发器；复用数据库已有纯函数，显式维护可索引投影。
  const text = sql<string>`resume_search_text(${source.name}, ${source.email}, ${source.phone}, ${source.fileName}, ${source.role}, ${JSON.stringify(source.profile)}::jsonb)`;
  await tx
    .update(candidateResume)
    .set({ searchCjkBigrams: sql`resume_search_bigrams(${text})`, searchText: text })
    .where(eq(candidateResume.id, record.resumeId));
}

async function invalidateJobScreening(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
  now: Date,
) {
  if (patch.jobDescriptionId === undefined || patch.jobDescriptionId === record.jobDescriptionId) {
    return;
  }
  const screening = await tx
    .select({ id: recruitingResumeEvaluation.id })
    .from(recruitingResumeEvaluation)
    .where(
      and(
        eq(recruitingResumeEvaluation.recruitingRecordId, record.id),
        eq(recruitingResumeEvaluation.kind, "resume_screening"),
      ),
    );
  // 保存失效的确切 ID：同一毫秒提交的新尝试不因时间截断被误判，旧内容也不被修改。
  await tx.insert(recruitingEvent).values({
    action: "recruiting_evaluation_invalidated",
    createdAt: now,
    detail: {
      fromJobDescriptionId: record.jobDescriptionId,
      reason: "job_changed",
      screeningEvaluationIds: screening.map((entry) => entry.id),
      toJobDescriptionId: patch.jobDescriptionId,
    },
    id: crypto.randomUUID(),
    organizationId: record.organizationId,
    recruitingRecordId: record.id,
  });
}

async function persistPatch(
  tx: RecruitingTransaction,
  original: RecordRow,
  patch: RecruitingRecordValues,
) {
  assertMetadataPatch(original, patch);
  const now = patch.updatedAt ?? new Date();
  const contact = {
    email: patch.candidateEmail,
    name: patch.candidateName,
    phone: patch.candidatePhone,
  };
  if (hasValues(contact)) {
    await tx
      .update(candidate)
      .set({ ...contact, updatedAt: now })
      .where(eq(candidate.id, original.candidateId));
  }
  const recordWithResume = await persistResume(tx, original, patch, now);
  await invalidateJobScreening(tx, recordWithResume, patch, now);
  const values = mainRecordPatch(recordWithResume, patch, now);
  const [record] = await tx
    .update(recruitingRecord)
    .set(values)
    .where(eq(recruitingRecord.id, original.id))
    .returning();
  if (!record) {
    throw new Error("招聘记录不存在");
  }
  await persistPreparation(tx, record, patch, now);
  await persistFulfillment(tx, record, patch, now);
  await persistScreeningDecision(tx, record, patch, now);
  await persistAssessment(tx, record, patch);
  if (hasValues(resumePatch(patch)) || hasValues(contact) || patch.targetRole !== undefined) {
    await refreshSearch(tx, record);
  }
}

/** 条件在锁定后再次检查；评估的 runId/JD 守卫不会因拆成多表而失效。 */
export function updateRecruitingRecords(
  executor: RecruitingExecutor,
  condition: SQL | undefined,
  patch: RecruitingRecordPatch,
): Promise<RecruitingRecordRead[]> {
  return executor.transaction(async (tx) => {
    const selected = await tx
      .select({ id: recruitingRecordReadModel.id })
      .from(recruitingRecordReadModel)
      .where(condition);
    if (!selected.length) {
      return [];
    }
    const ids = selected.map((row) => row.id);
    await tx
      .select({ id: recruitingRecord.id })
      .from(recruitingRecord)
      .where(inArray(recruitingRecord.id, ids))
      .orderBy(asc(recruitingRecord.id))
      .for("update");
    const rows = await tx
      .select()
      .from(recruitingRecordReadModel)
      .where(and(condition, inArray(recruitingRecordReadModel.id, ids)));
    for (const row of rows) {
      const record = await lockRecruitingRecord(tx, row.id);
      if (!record) {
        continue;
      }
      const resolved: RecruitingRecordValues = {};
      for (const [key, value] of Object.entries(patch)) {
        if (is(value, SQL)) {
          const [computed] = await tx
            .select({ value })
            .from(recruitingRecordReadModel)
            .where(eq(recruitingRecordReadModel.id, row.id));
          Object.assign(resolved, { [key]: computed?.value });
        } else if (value !== undefined) {
          Object.assign(resolved, { [key]: value });
        }
      }
      await persistPatch(tx, record, resolved);
    }
    if (!rows.length) {
      return [];
    }
    return tx
      .select()
      .from(recruitingRecordReadModel)
      .where(
        inArray(
          recruitingRecordReadModel.id,
          rows.map((row) => row.id),
        ),
      );
  });
}

function initialOutcome(
  stage: RecruitingStage,
  values: RecruitingRecordValues,
): RecordRow["outcome"] {
  if (stage !== "closed") {
    return "in_pipeline";
  }
  if (!values.outcome || values.outcome === "in_pipeline") {
    return "archived";
  }
  return values.outcome;
}
function initialNodeStatus(
  stage: RecruitingStage,
  node: RecruitingNode,
  index: number,
): RecruitingNodeStatus {
  const currentIndex = stage === "closed" ? -1 : recruitingNodeValues.indexOf(stage);
  if (index < currentIndex) {
    return "skipped";
  }
  return node === stage ? "pending" : "inactive";
}
function initialCloseState(stage: RecruitingStage, values: RecruitingRecordValues, now: Date) {
  if (stage !== "closed") {
    return { closeDetails: null, closedAt: null, closedFromNode: null };
  }
  const previous = normalizeStage(values.closedMeta?.previousStage ?? "screening");
  return {
    closeDetails: { ...values.closedMeta, legacyClosedReason: values.closedReason },
    closedAt: values.closedAt ?? now,
    closedFromNode: previous === "closed" ? null : previous,
  };
}
export function createRecruitingRecords(
  executor: RecruitingExecutor,
  input: RecruitingRecordValues | RecruitingRecordValues[],
): Promise<RecruitingRecordRead[]> {
  return executor.transaction(async (tx) => {
    const ids: string[] = [];
    for (const values of Array.isArray(input) ? input : [input]) {
      if (!values.organizationId || !values.candidateName) {
        throw new Error("招聘记录必须有工作区和候选人名称");
      }
      const id = values.id ?? crypto.randomUUID();
      const candidateId = crypto.randomUUID();
      const resumeId = crypto.randomUUID();
      const now = values.createdAt ?? new Date();
      const stage = normalizeStage(values.pipelineStage);
      await tx.insert(candidate).values({
        createdAt: now,
        createdBy: values.createdBy,
        email: values.candidateEmail,
        id: candidateId,
        name: values.candidateName,
        organizationId: values.organizationId,
        phone: values.candidatePhone,
        updatedAt: values.updatedAt ?? now,
      });
      await tx.insert(candidateResume).values({
        ...resumePatch(values),
        candidateId,
        contentHash: values.resumeContentHash,
        createdAt: now,
        createdBy: values.createdBy,
        id: resumeId,
        organizationId: values.organizationId,
        parseStatus:
          values.resumeParseStatus ??
          (values.resumeProfile || values.resumeText ? "ready" : "unparsed"),
        storageKey: values.resumeStorageKey,
        updatedAt: values.updatedAt ?? now,
        version: 1,
      });
      const [record] = await tx
        .insert(recruitingRecord)
        .values({
          candidateId,
          ...initialCloseState(stage, values, now),
          createdAt: now,
          currentStage: stage,
          id,
          jobDescriptionId: values.jobDescriptionId ?? null,
          organizationId: values.organizationId,
          outcome: initialOutcome(stage, values),
          resumeId,
          updatedAt: values.updatedAt ?? now,
        })
        .returning();
      if (!record) {
        throw new Error("创建招聘记录失败");
      }
      await tx.insert(recruitingNodeState).values(
        recruitingNodeValues.map((node, index) => ({
          node,
          organizationId: record.organizationId,
          recruitingRecordId: id,
          status: initialNodeStatus(stage, node, index),
        })),
      );
      const initialPatch = { ...values };
      delete initialPatch.closedAt;
      delete initialPatch.closedMeta;
      delete initialPatch.closedReason;
      if (stage !== "screening") {
        delete initialPatch.resumeEvaluationStatus;
      }
      await persistPatch(tx, record, initialPatch);
      ids.push(id);
    }
    if (!ids.length) {
      return [];
    }
    return tx
      .select()
      .from(recruitingRecordReadModel)
      .where(inArray(recruitingRecordReadModel.id, ids));
  });
}

/** 仅删除新招聘记录；旧表与共享的对象存储文件均不删除。 */
export function deleteRecruitingRecords(
  executor: RecruitingExecutor,
  condition: SQL | undefined,
): Promise<{ id: string }[]> {
  return executor.transaction(async (tx) => {
    const records = await tx
      .select({ id: recruitingRecordReadModel.id })
      .from(recruitingRecordReadModel)
      .where(condition);
    const ids = records.map((r) => r.id);
    if (!ids.length) {
      return [];
    }
    await tx
      .select({ id: recruitingRecord.id })
      .from(recruitingRecord)
      .where(inArray(recruitingRecord.id, ids))
      .orderBy(asc(recruitingRecord.id))
      .for("update");
    const checked = await tx
      .select({ id: recruitingRecordReadModel.id })
      .from(recruitingRecordReadModel)
      .where(and(condition, inArray(recruitingRecordReadModel.id, ids)));
    const removed = checked.map((r) => r.id);
    if (!removed.length) {
      return [];
    }
    await tx
      .update(recruitingRecord)
      .set({ activeEvaluationId: null, currentEvaluationId: null })
      .where(inArray(recruitingRecord.id, removed));
    await tx
      .delete(recruitingNodeState)
      .where(inArray(recruitingNodeState.recruitingRecordId, removed));
    await tx
      .update(recruitingFulfillment)
      .set({ selectedOfferId: null })
      .where(inArray(recruitingFulfillment.recruitingRecordId, removed));
    await tx
      .update(aiInterviewRound)
      .set({ conversationId: null })
      .where(inArray(aiInterviewRound.recruitingRecordId, removed));
    await tx
      .delete(recruitingEvidenceSnapshot)
      .where(inArray(recruitingEvidenceSnapshot.recruitingRecordId, removed));
    await tx
      .delete(recruitingContextSnapshot)
      .where(inArray(recruitingContextSnapshot.recruitingRecordId, removed));
    await tx
      .update(recruitingNotificationDelivery)
      .set({ eventId: null })
      .where(inArray(recruitingNotificationDelivery.recruitingRecordId, removed));
    await tx
      .delete(recruitingNotificationEvent)
      .where(inArray(recruitingNotificationEvent.recruitingRecordId, removed));
    await tx
      .update(aiInterviewConversationTurn)
      .set({ recruitingRecordId: null })
      .where(inArray(aiInterviewConversationTurn.recruitingRecordId, removed));
    const rounds = await tx
      .select({ id: aiInterviewRound.id })
      .from(aiInterviewRound)
      .where(inArray(aiInterviewRound.recruitingRecordId, removed));
    if (rounds.length) {
      await tx
        .update(aiInterviewConversation)
        .set({ aiRoundId: null })
        .where(
          inArray(
            aiInterviewConversation.aiRoundId,
            rounds.map((r) => r.id),
          ),
        );
    }
    await tx
      .update(aiInterviewConversation)
      .set({ recruitingRecordId: null })
      .where(inArray(aiInterviewConversation.recruitingRecordId, removed));
    // 删除招聘记录同时取消其尚未结束的解析项，防止清空来源后 late worker 走“创建”兜底。
    await tx
      .update(recruitingUploadBatchItem)
      .set({ finishedAt: new Date(), status: "cancelled" })
      .where(
        and(
          inArray(recruitingUploadBatchItem.recruitingRecordId, removed),
          inArray(recruitingUploadBatchItem.status, ["pending", "processing"]),
        ),
      );
    await tx
      .update(recruitingUploadBatchItem)
      .set({ recruitingRecordId: null })
      .where(inArray(recruitingUploadBatchItem.recruitingRecordId, removed));
    await tx.delete(recruitingEvent).where(inArray(recruitingEvent.recruitingRecordId, removed));
    await tx.delete(recruitingRecord).where(inArray(recruitingRecord.id, removed));
    return checked;
  });
}
