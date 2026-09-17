import { and, eq, sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import type { SelectResultFields } from "drizzle-orm/query-builders/select.types";
import { alias, QueryBuilder } from "drizzle-orm/pg-core";
import {
  candidate,
  candidateResume,
  recruitingEvent,
  recruitingFulfillment,
  recruitingInterviewPreparation,
  recruitingNodeState,
  recruitingRecord,
  recruitingResumeEvaluation,
} from "@app/db-schema/schema";
import type { RecruitingRecordFields } from "./recruiting-record-fields";

// 每个表达式都拥有稳定的输出列名，避免不同实体的 id / name 在子查询中冲突。
const value = <K extends keyof RecruitingRecordFields>(
  name: K,
  expression: SQL<RecruitingRecordFields[K]>,
) => expression.as(name);
const mode = (contract: SQLWrapper) =>
  sql<
    RecruitingRecordFields["resumeEvaluationArtifactMode"]
  >`CASE WHEN ${contract} LIKE 'qualitative-%' THEN 'qualitative' WHEN ${contract} LIKE 'structured-%' THEN 'structured' WHEN ${contract} LIKE 'legacy-%' THEN 'legacy' ELSE NULL END`;

/**
 * 招聘详情只读投影。一个招聘过程始终返回一行，节点和评估历史不会展开成列表重复行。
 * 不能用于 INSERT / UPDATE / DELETE；写入和行锁由招聘事务 DAO 负责。
 * aliasName 用于同一次查询里的重复候选人、自关联等场景。
 */
export function createRecruitingReadModel(aliasName = "recruiting_record_read") {
  const record = alias(recruitingRecord, "read_record");
  const person = alias(candidate, "read_candidate");
  const resume = alias(candidateResume, "read_resume");
  const current = alias(recruitingResumeEvaluation, "read_current_evaluation");
  const active = alias(recruitingResumeEvaluation, "read_active_evaluation");
  const preparation = alias(recruitingInterviewPreparation, "read_preparation");
  const fulfillment = alias(recruitingFulfillment, "read_fulfillment");
  const node = alias(recruitingNodeState, "read_current_node");
  const screeningNode = alias(recruitingNodeState, "read_screening_node");
  const screeningEvaluation = alias(recruitingResumeEvaluation, "read_screening_evaluation");

  const currentMode = mode(current.contractVersion);
  const activeMode = mode(active.contractVersion);
  const structuredArtifact = sql`CASE WHEN ${current.contractVersion} LIKE 'structured-%' THEN ${current.artifact} ELSE NULL END`;
  const query = new QueryBuilder();
  const screeningStillValid = sql`NOT EXISTS (
    SELECT 1 FROM ${recruitingEvent}
    WHERE ${recruitingEvent.recruitingRecordId} = ${record.id}
      AND ${recruitingEvent.organizationId} = ${record.organizationId}
      AND ${recruitingEvent.action} = 'recruiting_evaluation_invalidated'
      AND (${recruitingEvent.detail} -> 'screeningEvaluationIds') ? ${screeningEvaluation.id}
  )`;

  // legacy screening 独立于岗位评估；最新尝试和最后成功结果分别读取。
  // 简历版本切换后，旧版本结果只能从历史入口查询，不能重新成为当前结果。
  const latestScreening = query
    .select({
      artifact: screeningEvaluation.artifact,
      completedAt: screeningEvaluation.completedAt,
      errorMessage: screeningEvaluation.errorMessage,
      status: screeningEvaluation.status,
    })
    .from(screeningEvaluation)
    .where(
      and(
        eq(screeningEvaluation.recruitingRecordId, record.id),
        eq(screeningEvaluation.organizationId, record.organizationId),
        eq(screeningEvaluation.kind, "resume_screening"),
        sql`${screeningEvaluation.resumeId} IS NOT DISTINCT FROM ${record.resumeId}`,
        screeningStillValid,
      ),
    )
    .orderBy(sql`${screeningEvaluation.createdAt} DESC`, sql`${screeningEvaluation.id} DESC`)
    .limit(1)
    .as("read_latest_screening");
  const latestScreeningSuccess = query
    .select({
      artifact: screeningEvaluation.artifact,
      completedAt: screeningEvaluation.completedAt,
    })
    .from(screeningEvaluation)
    .where(
      and(
        eq(screeningEvaluation.recruitingRecordId, record.id),
        eq(screeningEvaluation.organizationId, record.organizationId),
        eq(screeningEvaluation.kind, "resume_screening"),
        eq(screeningEvaluation.status, "succeeded"),
        sql`${screeningEvaluation.resumeId} IS NOT DISTINCT FROM ${record.resumeId}`,
        screeningStillValid,
      ),
    )
    .orderBy(sql`${screeningEvaluation.createdAt} DESC`, sql`${screeningEvaluation.id} DESC`)
    .limit(1)
    .as("read_latest_screening_success");

  return query
    .select({
      activeEvaluationId: record.activeEvaluationId,
      candidateEmail: value("candidateEmail", sql`${person.email}`),
      candidateExpectationsMeta: value(
        "candidateExpectationsMeta",
        sql`${fulfillment.candidateExpectations}`,
      ),
      candidateId: record.candidateId,
      candidateName: value("candidateName", sql`${person.name}`),
      candidatePhone: value("candidatePhone", sql`${person.phone}`),
      closeDetails: record.closeDetails,
      closeReason: record.closeReason,
      closedAt: record.closedAt,
      closedFromNode: record.closedFromNode,
      // 旧关闭详情可能存 human_interview 等历史阶段名；恢复依据以新节点列为准。
      closedMeta: value(
        "closedMeta",
        sql`CASE WHEN ${record.currentStage} = 'closed' THEN COALESCE(${record.closeDetails}, '{}'::jsonb) || jsonb_build_object('previousStage', ${record.closedFromNode}) ELSE ${record.closeDetails} END`,
      ),
      closedReason: value("closedReason", sql`${record.closeDetails} ->> 'legacyClosedReason'`),
      createdAt: record.createdAt,
      createdBy: record.createdBy,
      currentEvaluationId: record.currentEvaluationId,
      currentStage: record.currentStage,
      hrResumeAssessment: record.hrResumeAssessment,
      hrResumeAssessmentUpdatedAt: record.hrResumeAssessmentUpdatedAt,
      hrResumeAssessmentUpdatedBy: record.hrResumeAssessmentUpdatedBy,
      humanInterviewScheduledAt: value("humanInterviewScheduledAt", sql`NULL::timestamptz`),
      humanInterviewerId: value("humanInterviewerId", sql`NULL::text`),
      id: record.id,
      interviewQuestions: value(
        "interviewQuestions",
        sql`COALESCE(${preparation.questions}, '[]'::jsonb)`,
      ),
      jobDescriptionId: record.jobDescriptionId,
      notes: record.notes,
      offerAcceptedAt: value("offerAcceptedAt", sql`NULL::timestamptz`),
      offerSentAt: value("offerSentAt", sql`NULL::timestamptz`),
      organizationId: record.organizationId,
      outcome: record.outcome,
      ownerId: record.ownerId,
      pipelineStage: sql<
        typeof recruitingRecord.$inferSelect.currentStage
      >`${record.currentStage}`.as("pipelineStage"),
      qualitativeAttemptJobDescriptionVersionId: value(
        "qualitativeAttemptJobDescriptionVersionId",
        sql`CASE WHEN ${active.contractVersion} LIKE 'qualitative-%' THEN ${active.jobDescriptionVersionId} ELSE NULL END`,
      ),
      qualitativeJobDescriptionVersionId: value(
        "qualitativeJobDescriptionVersionId",
        sql`CASE WHEN ${current.contractVersion} LIKE 'qualitative-%' THEN ${current.jobDescriptionVersionId} ELSE NULL END`,
      ),
      qualitativeRecommendationLevel: value(
        "qualitativeRecommendationLevel",
        sql`CASE WHEN ${current.contractVersion} LIKE 'qualitative-%' THEN ${current.recommendationLevel} ELSE NULL END`,
      ),
      qualitativeResumeEvaluation: value(
        "qualitativeResumeEvaluation",
        sql`CASE WHEN ${current.contractVersion} LIKE 'qualitative-%' THEN ${current.artifact} ELSE NULL END`,
      ),
      result: sql<typeof recruitingNodeState.$inferSelect.result>`${node.result}`.as("result"),
      resumeContentHash: value("resumeContentHash", sql`${resume.contentHash}`),
      resumeEvaluationArtifactMode: value("resumeEvaluationArtifactMode", currentMode),
      resumeEvaluationAttemptMode: value(
        "resumeEvaluationAttemptMode",
        sql`COALESCE(${activeMode}, ${currentMode})`,
      ),
      resumeEvaluationStatus: value(
        "resumeEvaluationStatus",
        sql`CASE WHEN ${screeningNode.result} IN ('pass', 'fail') THEN ${screeningNode.result} ELSE NULL END`,
      ),
      resumeFileName: value("resumeFileName", sql`${resume.fileName}`),
      resumeId: record.resumeId,
      resumeParseError: value("resumeParseError", sql`${resume.parseError}`),
      resumeParseStatus: value(
        "resumeParseStatus",
        sql`COALESCE(${resume.parseStatus}, 'unparsed')`,
      ),
      resumeParsedAt: sql<RecruitingRecordFields["resumeParsedAt"]>`${resume.parsedAt}`
        .mapWith((rawDate: string | null) => (rawDate === null ? null : new Date(rawDate)))
        .as("resumeParsedAt"),
      resumeProfile: value("resumeProfile", sql`${resume.profile}`),
      resumeReview: value(
        "resumeReview",
        sql`CASE WHEN ${current.contractVersion} LIKE 'legacy-%' THEN ${current.artifact} ELSE NULL END`,
      ),
      resumeReviewError: value("resumeReviewError", sql`${active.errorMessage}`),
      resumeReviewGeneratedAt: sql<
        RecruitingRecordFields["resumeReviewGeneratedAt"]
      >`${current.completedAt}`
        .mapWith((rawDate: string | null) => (rawDate === null ? null : new Date(rawDate)))
        .as("resumeReviewGeneratedAt"),
      resumeReviewQueuedAt: sql<RecruitingRecordFields["resumeReviewQueuedAt"]>`${active.startedAt}`
        .mapWith((rawDate: string | null) => (rawDate === null ? null : new Date(rawDate)))
        .as("resumeReviewQueuedAt"),
      resumeReviewRunId: value(
        "resumeReviewRunId",
        sql`COALESCE(${active.runId}, ${current.runId})`,
      ),
      resumeReviewStatus: value(
        "resumeReviewStatus",
        sql`CASE WHEN ${active.status} IN ('queued', 'processing', 'failed') THEN ${active.status} WHEN ${current.status} = 'succeeded' THEN 'ready' ELSE 'idle' END`,
      ),
      resumeScreeningError: value("resumeScreeningError", sql`${latestScreening.errorMessage}`),
      resumeScreeningEvaluatedAt: sql<
        RecruitingRecordFields["resumeScreeningEvaluatedAt"]
      >`${latestScreeningSuccess.completedAt}`
        .mapWith((rawDate: string | null) => (rawDate === null ? null : new Date(rawDate)))
        .as("resumeScreeningEvaluatedAt"),
      resumeScreeningResult: value(
        "resumeScreeningResult",
        sql`${latestScreeningSuccess.artifact}`,
      ),
      resumeScreeningStatus: value(
        "resumeScreeningStatus",
        sql`CASE WHEN ${latestScreening.status} = 'succeeded' THEN 'ready' WHEN ${latestScreening.status} = 'queued' THEN 'processing' ELSE COALESCE(${latestScreening.status}, 'idle') END`,
      ),
      resumeSourceImportedAt: sql<
        RecruitingRecordFields["resumeSourceImportedAt"]
      >`${record.sourceImportedAt}`
        .mapWith((rawDate: string | null) => (rawDate === null ? null : new Date(rawDate)))
        .as("resumeSourceImportedAt"),
      resumeSourceImportedBy: value("resumeSourceImportedBy", sql`${record.sourceImportedBy}`),
      resumeSourcePoolItemId: value("resumeSourcePoolItemId", sql`${record.sourcePoolItemId}`),
      resumeSourceType: value("resumeSourceType", sql`${record.sourceType}`),
      resumeStorageKey: value("resumeStorageKey", sql`${resume.storageKey}`),
      resumeText: value("resumeText", sql`${resume.text}`),
      searchCjkBigrams: value("searchCjkBigrams", sql`${resume.searchCjkBigrams}`),
      searchText: value("searchText", sql`${resume.searchText}`),
      skillsNormalized: value(
        "skillsNormalized",
        sql`COALESCE(${resume.skillsNormalized}, '{}'::text[])`,
      ),
      stageEnteredAt: record.stageEnteredAt,
      status: sql<typeof recruitingNodeState.$inferSelect.status | null>`${node.status}`.as(
        "status",
      ),
      structuredCompositeScore: value(
        "structuredCompositeScore",
        sql`CASE WHEN ${current.contractVersion} LIKE 'structured-%' THEN ${current.numericScore} ELSE NULL END`,
      ),
      structuredGateSortRank: value(
        "structuredGateSortRank",
        sql`CASE (${structuredArtifact} #>> '{gates,effectiveStatus}') WHEN 'passed' THEN 0 WHEN 'needs_verification' THEN 1 WHEN 'failed' THEN 2 ELSE NULL END`,
      ),
      structuredGateStatus: value(
        "structuredGateStatus",
        sql`${structuredArtifact} #>> '{gates,effectiveStatus}'`,
      ),
      structuredResumeEvaluation: value("structuredResumeEvaluation", sql`${structuredArtifact}`),
      structuredScoreGrade: value("structuredScoreGrade", sql`${structuredArtifact} ->> 'grade'`),
      targetRole: record.targetRole,
      updatedAt: record.updatedAt,
      version: record.version,
      writtenTestScheduledAt: value("writtenTestScheduledAt", sql`NULL::timestamptz`),
      writtenTestScore: value("writtenTestScore", sql`NULL::text`),
    })
    .from(record)
    .innerJoin(
      person,
      and(eq(person.id, record.candidateId), eq(person.organizationId, record.organizationId)),
    )
    .leftJoin(
      resume,
      and(
        eq(resume.id, record.resumeId),
        eq(resume.candidateId, record.candidateId),
        eq(resume.organizationId, record.organizationId),
      ),
    )
    .leftJoin(
      current,
      and(
        eq(current.id, record.currentEvaluationId),
        eq(current.recruitingRecordId, record.id),
        eq(current.organizationId, record.organizationId),
      ),
    )
    .leftJoin(
      active,
      and(
        eq(active.id, record.activeEvaluationId),
        eq(active.recruitingRecordId, record.id),
        eq(active.organizationId, record.organizationId),
      ),
    )
    .leftJoin(preparation, eq(preparation.recruitingRecordId, record.id))
    .leftJoin(fulfillment, eq(fulfillment.recruitingRecordId, record.id))
    .leftJoin(
      node,
      and(
        eq(node.recruitingRecordId, record.id),
        eq(
          node.node,
          sql`COALESCE(NULLIF(${record.currentStage}, 'closed'), ${record.closedFromNode})`,
        ),
      ),
    )
    .leftJoin(
      screeningNode,
      and(eq(screeningNode.recruitingRecordId, record.id), eq(screeningNode.node, "screening")),
    )
    .leftJoinLateral(latestScreening, sql`true`)
    .leftJoinLateral(latestScreeningSuccess, sql`true`)
    .as(aliasName);
}

export const recruitingRecordReadModel = createRecruitingReadModel();
export type RecruitingRecordRead = SelectResultFields<
  typeof recruitingRecordReadModel._.selectedFields
>;
