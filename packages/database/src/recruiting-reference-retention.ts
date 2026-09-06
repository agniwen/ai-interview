import {
  candidate,
  candidateResume,
  recruitingRecord,
  recruitingResumeEvaluation,
  recruitingInterviewPreparation,
  recruitingFulfillment,
  recruitingMaterial,
  recruitingNodeState,
  recruitingFormSubmission,
  humanInterviewEvaluationDocumentSync,
  recruitingEvent,
  recruitingContextSnapshot,
  aiInterviewConversation,
  aiInterviewConversationTurn,
  recruitingEvidenceSnapshot,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  recruitingQuestionTemplateBinding,
  recruitingMailMessage,
  recruitingMeetingContext,
  recruitingDuplicateMatch,
  recruitingJobMatchCandidate,
  recruitingJobMatchRun,
  recruitingPoolImport,
  recruitingSearchIndex,
  recruitingUploadBatch,
  recruitingUploadBatchItem,
  humanInterviewEvaluationSnapshot,
  humanInterviewMeeting,
  humanInterviewMeetingEvent,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  recruitingNotificationRecipient,
  aiInterviewRound,
  recruitingOffer,
  recruitingRoundEmailLog,
} from "@app/db-schema/schema";
import { getTableName, sql } from "drizzle-orm";
import type { RecruitingExecutor } from "./recruiting-records";

// 仅检查当前招聘模型的 38 张业务表；迁移台账和旧归档表不参与运行时删除决策。
const recruitingTables = [
  candidate,
  candidateResume,
  recruitingRecord,
  recruitingResumeEvaluation,
  recruitingInterviewPreparation,
  recruitingFulfillment,
  recruitingMaterial,
  recruitingNodeState,
  recruitingFormSubmission,
  humanInterviewEvaluationDocumentSync,
  recruitingEvent,
  recruitingContextSnapshot,
  aiInterviewConversation,
  aiInterviewConversationTurn,
  recruitingEvidenceSnapshot,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  recruitingQuestionTemplateBinding,
  recruitingMailMessage,
  recruitingMeetingContext,
  recruitingDuplicateMatch,
  recruitingJobMatchCandidate,
  recruitingJobMatchRun,
  recruitingPoolImport,
  recruitingSearchIndex,
  recruitingUploadBatch,
  recruitingUploadBatchItem,
  humanInterviewEvaluationSnapshot,
  humanInterviewMeeting,
  humanInterviewMeetingEvent,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  recruitingNotificationRecipient,
  aiInterviewRound,
  recruitingOffer,
  recruitingRoundEmailLog,
].map(getTableName);

export class RecruitingReferenceRetentionError extends Error {
  constructor() {
    super("该资源仍被招聘数据引用，无法删除；请先解除关联或停用该资源。");
    this.name = "RecruitingReferenceRetentionError";
  }
}

/** 元数据中的标识符经 identifier 转义；父表名称和 ID 始终作为绑定参数。 */
export async function hasRecruitingReferences(
  executor: RecruitingExecutor,
  parentSqlTableName: string,
  id: string,
): Promise<boolean> {
  const references = await executor.execute<{
    source_schema: string;
    source_table: string;
    source_column: string;
  }>(sql`
    SELECT DISTINCT source_ns.nspname AS source_schema, source.relname AS source_table,
      source_attr.attname AS source_column
    FROM pg_constraint constraint_row
    JOIN pg_class source ON source.oid = constraint_row.conrelid
    JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
    JOIN pg_class target ON target.oid = constraint_row.confrelid
    JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
    CROSS JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey) keys(source_key, target_key)
    JOIN pg_attribute source_attr ON source_attr.attrelid = source.oid AND source_attr.attnum = keys.source_key
    JOIN pg_attribute target_attr ON target_attr.attrelid = target.oid AND target_attr.attnum = keys.target_key
    WHERE constraint_row.contype = 'f' AND target_ns.nspname = 'public'
      AND target.relname = ${parentSqlTableName} AND target_attr.attname = 'id'
      AND source_ns.nspname = 'public' AND source.relname IN (${sql.join(
        recruitingTables.map((name) => sql`${name}`),
        sql`, `,
      )})
  `);
  for (const reference of references) {
    const [row] = await executor.execute<{ found: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM ${sql.identifier(reference.source_schema)}.${sql.identifier(reference.source_table)}
        WHERE ${sql.identifier(reference.source_column)} = ${id}) AS found
    `);
    if (row?.found) {
      return true;
    }
  }
  return false;
}

export async function assertNoRecruitingReferences(
  executor: RecruitingExecutor,
  parentSqlTableName: string,
  id: string,
) {
  if (await hasRecruitingReferences(executor, parentSqlTableName, id)) {
    throw new RecruitingReferenceRetentionError();
  }
}
