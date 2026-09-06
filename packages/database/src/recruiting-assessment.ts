import { eq } from "drizzle-orm";
import { recruitingRecord, recruitingResumeEvaluation } from "@app/db-schema/schema";
import type { RecruitingRecordFields } from "./recruiting-record-fields";
import type { JsonValue } from "@app/db-schema/json";
import { QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION } from "@app/db-schema/qualitative-resume-evaluation";
import type { RecruitingRecordValues, RecruitingTransaction } from "./recruiting-records";

type RecordRow = typeof recruitingRecord.$inferSelect;
type AssessmentRow = typeof recruitingResumeEvaluation.$inferSelect;
type AssessmentArtifact = NonNullable<
  | RecruitingRecordFields["resumeReview"]
  | RecruitingRecordFields["qualitativeResumeEvaluation"]
  | RecruitingRecordFields["structuredResumeEvaluation"]
>;
type AssessmentMode = NonNullable<RecruitingRecordFields["resumeEvaluationArtifactMode"]>;
type PersistedJsonInput =
  | AssessmentArtifact
  | NonNullable<RecruitingRecordFields["closedMeta"]>
  | NonNullable<RecruitingRecordFields["resumeScreeningResult"]>;

/** JSON 序列化会把日期转成 ISO 字符串并删除 undefined；不能用保留 Date 的 structuredClone。 */
function json(value: PersistedJsonInput): JsonValue {
  const serialized = JSON.stringify(value);
  // SAFETY: 输入来自已有领域 DTO，JSON 序列化成功后的反解析只会产生 JSON 值。
  return JSON.parse(serialized) as JsonValue;
}

function evaluationContract(
  mode: AssessmentMode,
  artifact: AssessmentArtifact | null | undefined,
): string {
  if (mode === "qualitative") {
    return artifact?.schemaVersion
      ? `qualitative-v${artifact.schemaVersion}`
      : QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION;
  }
  if (mode === "structured") {
    if (artifact && "engine" in artifact) {
      return `structured-v${artifact.schemaVersion}:engine=${artifact.engine.engineVersion}:prompt=${artifact.engine.promptVersion}`;
    }
    return "structured-unknown";
  }
  return artifact?.schemaVersion
    ? `legacy-resume-review-v${artifact.schemaVersion}`
    : "legacy-unknown";
}

function resolveAssessmentMode(
  patch: RecruitingRecordValues,
  active?: AssessmentRow,
): AssessmentMode {
  const explicit = patch.resumeEvaluationAttemptMode ?? patch.resumeEvaluationArtifactMode;
  if (explicit) {
    return explicit;
  }
  if (patch.qualitativeResumeEvaluation || active?.contractVersion.startsWith("qualitative-")) {
    return "qualitative";
  }
  if (patch.structuredResumeEvaluation || active?.contractVersion.startsWith("structured-")) {
    return "structured";
  }
  return "legacy";
}

function resolveAssessmentArtifact(patch: RecruitingRecordValues, mode: AssessmentMode) {
  if (mode === "qualitative") {
    return patch.qualitativeResumeEvaluation;
  }
  if (mode === "structured") {
    return patch.structuredResumeEvaluation;
  }
  return patch.resumeReview;
}

function resolveAssessmentStatus(
  patch: RecruitingRecordValues,
  artifact: AssessmentArtifact | null | undefined,
): AssessmentRow["status"] | null {
  if (artifact) {
    return "succeeded";
  }
  const status = patch.resumeReviewStatus;
  if (status === "queued" || status === "processing" || status === "failed") {
    return status;
  }
  return null;
}

function canReuseAttempt(
  active: AssessmentRow | undefined,
  patch: RecruitingRecordValues,
  mode: AssessmentMode,
) {
  if (!active || active.status === "succeeded") {
    return false;
  }
  if (!active.contractVersion.startsWith(`${mode}-`)) {
    return false;
  }
  return (
    patch.resumeReviewRunId === undefined ||
    patch.resumeReviewRunId === null ||
    patch.resumeReviewRunId === active.runId
  );
}

function assessmentSummaries(
  patch: RecruitingRecordValues,
  mode: AssessmentMode,
  existing?: AssessmentRow,
) {
  return {
    jobDescriptionVersionId:
      patch.qualitativeJobDescriptionVersionId ??
      patch.qualitativeAttemptJobDescriptionVersionId ??
      existing?.jobDescriptionVersionId ??
      null,
    numericScore:
      mode === "structured"
        ? (patch.structuredCompositeScore ?? existing?.numericScore ?? null)
        : null,
    recommendationLevel:
      mode === "qualitative"
        ? (patch.qualitativeRecommendationLevel ?? existing?.recommendationLevel ?? null)
        : null,
    runId: patch.resumeReviewRunId ?? existing?.runId ?? null,
  };
}
function buildAssessmentValues(
  record: RecordRow,
  patch: RecruitingRecordValues,
  mode: AssessmentMode,
  artifact: AssessmentArtifact | null | undefined,
  status: AssessmentRow["status"],
  existing?: AssessmentRow,
): typeof recruitingResumeEvaluation.$inferInsert {
  const now = new Date();
  const terminal = status === "succeeded" || status === "failed";
  return {
    artifact: artifact ? json(artifact) : (existing?.artifact ?? null),
    completedAt: terminal ? (patch.resumeReviewGeneratedAt ?? now) : null,
    contractVersion: evaluationContract(mode, artifact),
    createdAt: existing?.createdAt ?? patch.resumeReviewQueuedAt ?? now,
    errorMessage: status === "failed" ? patch.resumeReviewError || "评估未完成" : null,
    id: existing?.id ?? crypto.randomUUID(),
    kind: "resume_review",
    organizationId: record.organizationId,
    recruitingRecordId: record.id,
    resumeId: record.resumeId,
    ...assessmentSummaries(patch, mode, existing),
    // 旧公开 queuedAt 字段从此列投影；保留真正排队时间，而非等待 worker 开始才填写。
    startedAt: existing?.startedAt ?? patch.resumeReviewQueuedAt ?? now,
    status,
  };
}

async function persistReview(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
) {
  const cancelsAttempt =
    patch.resumeEvaluationAttemptMode === null &&
    patch.resumeReviewRunId === null &&
    !patch.resumeReview &&
    !patch.structuredResumeEvaluation &&
    !patch.qualitativeResumeEvaluation;
  // 岗位升级可能保留旧成功结果（ready）；取消排队尝试仍须解除 active，防止迟到 worker 晋升旧输入。
  if (patch.resumeReviewStatus === "idle" || cancelsAttempt) {
    const pointers: Partial<typeof recruitingRecord.$inferInsert> = { activeEvaluationId: null };
    if (patch.resumeEvaluationArtifactMode === null) {
      pointers.currentEvaluationId = null;
    }
    await tx.update(recruitingRecord).set(pointers).where(eq(recruitingRecord.id, record.id));
    return;
  }
  const [active] = record.activeEvaluationId
    ? await tx
        .select()
        .from(recruitingResumeEvaluation)
        .where(eq(recruitingResumeEvaluation.id, record.activeEvaluationId))
    : [];
  const mode = resolveAssessmentMode(patch, active);
  const artifact = resolveAssessmentArtifact(patch, mode);
  const status = resolveAssessmentStatus(patch, artifact);
  if (!status) {
    return;
  }
  const reusable = canReuseAttempt(active, patch, mode) ? active : undefined;
  const values = buildAssessmentValues(record, patch, mode, artifact, status, reusable);
  // 成功内容与 failed 尝试分别存储，失败不会把当前成功指针移走。
  await (reusable
    ? tx
        .update(recruitingResumeEvaluation)
        .set(values)
        .where(eq(recruitingResumeEvaluation.id, reusable.id))
    : tx.insert(recruitingResumeEvaluation).values(values));
  const pointers =
    status === "succeeded"
      ? { activeEvaluationId: null, currentEvaluationId: values.id }
      : { activeEvaluationId: values.id };
  await tx.update(recruitingRecord).set(pointers).where(eq(recruitingRecord.id, record.id));
}

function screeningStatus(patch: RecruitingRecordValues): AssessmentRow["status"] | null {
  if (patch.resumeScreeningResult) {
    return "succeeded";
  }
  if (patch.resumeScreeningStatus === "processing") {
    return "processing";
  }
  if (patch.resumeScreeningStatus === "failed") {
    return "failed";
  }
  return null;
}

async function persistScreening(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
) {
  const status = screeningStatus(patch);
  if (!status) {
    return;
  }
  const completedAt =
    status === "succeeded" || status === "failed"
      ? (patch.resumeScreeningEvaluatedAt ?? new Date())
      : null;
  await tx.insert(recruitingResumeEvaluation).values({
    artifact: patch.resumeScreeningResult ? json(patch.resumeScreeningResult) : null,
    completedAt,
    contractVersion: "legacy-screening",
    errorMessage: status === "failed" ? patch.resumeScreeningError || "规则筛选未完成" : null,
    id: crypto.randomUUID(),
    kind: "resume_screening",
    organizationId: record.organizationId,
    recruitingRecordId: record.id,
    resumeId: record.resumeId,
    status,
  });
}

export async function persistAssessment(
  tx: RecruitingTransaction,
  record: RecordRow,
  patch: RecruitingRecordValues,
) {
  await persistReview(tx, record, patch);
  await persistScreening(tx, record, patch);
}
