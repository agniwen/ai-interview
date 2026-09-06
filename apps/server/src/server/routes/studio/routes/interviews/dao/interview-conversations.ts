import type {
  InterviewReportSnapshotMetadata,
  StudioInterviewConversationReport,
} from "@app/db-schema/interview-session";
import type { JsonValue } from "@app/db-schema/json";
import { interviewKeyInformationSchema } from "@app/db-schema/interview-key-information";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { formatCandidateFormAnswer } from "@app/shared/candidate-form-answer";
import { db } from "../../../../../../lib/server/db/index";
import {
  recruitingContextSnapshot,
  aiInterviewConversation,
  aiInterviewConversationTurn,
  recruitingEvidenceSnapshot,
} from "@app/db-schema/schema";

type InterviewConversationRow = typeof aiInterviewConversation.$inferSelect;
type InterviewConversationTurnRow = typeof aiInterviewConversationTurn.$inferSelect;
type InterviewContextSnapshotRow = typeof recruitingContextSnapshot.$inferSelect;
type InterviewEvidenceSnapshotRow = typeof recruitingEvidenceSnapshot.$inferSelect;
type ReportConversationRow = Pick<
  InterviewConversationRow,
  | "agentId"
  | "callSuccessful"
  | "conversationId"
  | "createdAt"
  | "dataCollectionResults"
  | "dynamicVariables"
  | "endedAt"
  | "evaluationCriteriaResults"
  | "lastSyncedAt"
  | "latestError"
  | "metadata"
  | "metrics"
  | "mode"
  | "organizationId"
  | "recordingDurationSecs"
  | "recordingStatus"
  | "startedAt"
  | "status"
  | "transcript"
  | "transcriptSummary"
  | "updatedAt"
  | "webhookReceivedAt"
> & {
  interviewRecordId: InterviewConversationRow["recruitingRecordId"];
  scheduleEntryId: InterviewConversationRow["aiRoundId"];
  keyInformation: InterviewConversationRow["keyInformation"];
};

const reportConversationColumns = {
  agentId: aiInterviewConversation.agentId,
  callSuccessful: aiInterviewConversation.callSuccessful,
  conversationId: aiInterviewConversation.conversationId,
  createdAt: aiInterviewConversation.createdAt,
  dataCollectionResults: aiInterviewConversation.dataCollectionResults,
  dynamicVariables: aiInterviewConversation.dynamicVariables,
  endedAt: aiInterviewConversation.endedAt,
  evaluationCriteriaResults: aiInterviewConversation.evaluationCriteriaResults,
  interviewRecordId: aiInterviewConversation.recruitingRecordId,
  lastSyncedAt: aiInterviewConversation.lastSyncedAt,
  latestError: aiInterviewConversation.latestError,
  metadata: aiInterviewConversation.metadata,
  metrics: aiInterviewConversation.metrics,
  mode: aiInterviewConversation.mode,
  organizationId: aiInterviewConversation.organizationId,
  recordingDurationSecs: aiInterviewConversation.recordingDurationSecs,
  recordingStatus: aiInterviewConversation.recordingStatus,
  scheduleEntryId: aiInterviewConversation.aiRoundId,
  startedAt: aiInterviewConversation.startedAt,
  status: aiInterviewConversation.status,
  transcript: aiInterviewConversation.transcript,
  transcriptSummary: aiInterviewConversation.transcriptSummary,
  updatedAt: aiInterviewConversation.updatedAt,
  webhookReceivedAt: aiInterviewConversation.webhookReceivedAt,
};

export interface QueryInterviewConversationReportsOptions {
  includeKeyInformation?: boolean;
  includeSnapshotMetadata?: boolean;
}

interface SnapshotRows {
  context: InterviewContextSnapshotRow | null;
  evidence: InterviewEvidenceSnapshotRow | null;
}

function buildFallbackTurns(conversation: ReportConversationRow): InterviewConversationTurnRow[] {
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : [];
  const fallbackCreatedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;
  const fallbackReceivedAt = conversation.webhookReceivedAt ?? conversation.updatedAt;

  return transcript.map((turn, index) => ({
    conversationId: conversation.conversationId,
    createdAt: fallbackCreatedAt,
    id: `${conversation.conversationId}:webhook:${index}`,
    message: turn.message,
    organizationId: conversation.organizationId,
    receivedAt: fallbackReceivedAt,
    recruitingRecordId: conversation.interviewRecordId,
    role: turn.role,
    source: "post_call_transcription",
    timeInCallSecs: turn.timeInCallSecs ?? null,
  }));
}

function buildFrozenInputSummary(
  snapshotRows: SnapshotRows,
): InterviewReportSnapshotMetadata["frozenInput"] {
  const context = snapshotRows.context?.payload ?? snapshotRows.evidence?.payload.context ?? null;
  if (!context) {
    return null;
  }

  return {
    candidateEmail: context.candidate.candidateEmail,
    candidateName: context.candidate.candidateName,
    formCount: context.forms.length,
    formQuestionCount: context.forms.reduce(
      (total, form) => total + form.snapshot.questions.length,
      0,
    ),
    formSubmissionCount: snapshotRows.evidence?.payload.formSubmissions.length ?? 0,
    interviewerCount: context.interviewers.length,
    jobDescriptionName: context.jobDescription?.name ?? null,
    personalizedQuestionCount: context.personalizedQuestions.length,
    questionTemplateCount: context.questionTemplates.length,
    questionTemplateQuestionCount: context.questionTemplates.reduce(
      (total, template) => total + template.snapshot.questions.length,
      0,
    ),
    targetRole: context.candidate.targetRole,
  };
}

function stringifyJsonInput(value: JsonValue | null | undefined) {
  return value === null || value === undefined ? null : JSON.stringify(value, null, 2);
}

function buildFullTextInput(
  snapshotRows: SnapshotRows,
  turns: InterviewConversationTurnRow[],
): InterviewReportSnapshotMetadata["fullTextInput"] {
  const context = snapshotRows.context?.payload ?? snapshotRows.evidence?.payload.context ?? null;
  if (!context) {
    return null;
  }

  const report = {
    candidate: {
      candidateEmail: context.candidate.candidateEmail,
      candidateName: context.candidate.candidateName,
      candidatePhone: context.candidate.candidatePhone,
      resumeProfileJson: stringifyJsonInput(context.candidate.resumeProfile),
      targetRole: context.candidate.targetRole,
    },
    formSubmissions:
      snapshotRows.evidence?.payload.formSubmissions.map((submission) => ({
        answers: submission.snapshot.questions.map((question) => ({
          label: question.label,
          questionId: question.id,
          valueText: formatCandidateFormAnswer(question, submission.answers[question.id]),
        })),
        submittedAt: submission.submittedAt,
        templateId: submission.templateId,
        title: submission.snapshot.title,
        version: submission.version,
        versionId: submission.versionId,
      })) ?? [],
    forms: context.forms.map((form) => ({
      description: form.snapshot.description,
      questions: form.snapshot.questions.map((question) => ({
        helperText: question.helperText,
        label: question.label,
        optionsText:
          question.options.length > 0
            ? question.options.map((option) => `${option.label} (${option.value})`).join("\n")
            : null,
        questionId: question.id,
        required: question.required,
        type: question.type,
      })),
      templateId: form.templateId,
      title: form.snapshot.title,
      version: form.version,
      versionId: form.versionId,
    })),
    globalConfig: context.globalConfig,
    interviewers: context.interviewers,
    jobDescription: context.jobDescription,
    personalizedQuestions: context.personalizedQuestions.map((question) => ({
      difficulty: question.difficulty,
      evaluationFocus: question.evaluationFocus ?? null,
      followUpDirections: question.followUpDirections ?? null,
      order: question.order,
      question: question.question,
    })),
    questionTemplates: context.questionTemplates.map((template) => ({
      description: template.snapshot.description,
      questions: template.snapshot.questions.map((question) => ({
        content: question.content,
        difficulty: question.difficulty,
        evaluationFocus: question.evaluationFocus ?? null,
        followUpDirections: question.followUpDirections ?? null,
        questionId: question.id,
      })),
      templateId: template.templateId,
      title: template.snapshot.title,
      version: template.version,
      versionId: template.versionId,
    })),
    transcript:
      snapshotRows.evidence?.payload.transcript ??
      turns.map((turn) => ({
        message: turn.message,
        role: turn.role,
        timeInCallSecs: turn.timeInCallSecs ?? undefined,
      })),
  };
  return report;
}

function buildSnapshotMetadata(
  conversation: ReportConversationRow,
  turns: InterviewConversationTurnRow[],
  snapshotRows: SnapshotRows,
): InterviewReportSnapshotMetadata {
  const { context, evidence } = snapshotRows;

  return {
    contextSnapshot: context
      ? {
          contentHash: context.contentHash,
          createdAt: context.createdAt,
          id: context.id,
          reason: context.reason,
          scheduleEntryId: context.aiRoundId,
          schemaVersion: context.payload.schemaVersion,
          status: context.status,
          version: context.version,
        }
      : null,
    evidenceSnapshot: evidence
      ? {
          contentHash: evidence.contentHash,
          contextSnapshotId: evidence.contextSnapshotId,
          createdAt: evidence.createdAt,
          generatedAt: evidence.payload.generatedAt ?? null,
          id: evidence.id,
          scheduleEntryId: evidence.aiRoundId,
          schemaVersion: evidence.payload.schemaVersion,
        }
      : null,
    frozenInput: buildFrozenInputSummary(snapshotRows),
    fullTextInput: buildFullTextInput(snapshotRows, turns),
    session: {
      recordingDurationSecs: conversation.recordingDurationSecs,
      recordingStatus: conversation.recordingStatus,
      scheduleEntryId: conversation.scheduleEntryId,
      transcriptTurnCount: turns.length,
    },
  };
}

function serializeConversationReport(
  conversation: ReportConversationRow,
  turnRows: InterviewConversationTurnRow[],
  snapshotRows?: SnapshotRows,
  includeKeyInformation = false,
): StudioInterviewConversationReport {
  const turns = turnRows.length > 0 ? turnRows : buildFallbackTurns(conversation);
  const parsedKeyInformation = includeKeyInformation
    ? interviewKeyInformationSchema.safeParse(conversation.keyInformation)
    : null;

  const report = {
    agentId: conversation.agentId,
    agentTurnCount: turns.filter((turn) => turn.role === "agent").length,
    callSuccessful: conversation.callSuccessful,
    conversationId: conversation.conversationId,
    createdAt: conversation.createdAt,
    dataCollectionResults: conversation.dataCollectionResults ?? {},
    dynamicVariables: conversation.dynamicVariables ?? {},
    endedAt: conversation.endedAt,
    evaluationCriteriaResults: conversation.evaluationCriteriaResults ?? {},
    interviewRecordId: conversation.interviewRecordId,
    keyInformation: parsedKeyInformation?.success ? parsedKeyInformation.data : null,
    lastSyncedAt: conversation.lastSyncedAt,
    latestError: conversation.latestError,
    metadata: conversation.metadata ?? {},
    metrics: conversation.metrics ?? {},
    mode: conversation.mode,
    recordingDurationSecs: conversation.recordingDurationSecs,
    recordingStatus: conversation.recordingStatus,
    startedAt: conversation.startedAt,
    status: conversation.status,
    transcriptSummary: conversation.transcriptSummary,
    turnCount: turns.length,
    turns: turns.map(({ recruitingRecordId, ...turn }) => ({
      ...turn,
      interviewRecordId: recruitingRecordId,
    })),
    updatedAt: conversation.updatedAt,
    userTurnCount: turns.filter((turn) => turn.role === "user").length,
    webhookReceivedAt: conversation.webhookReceivedAt,
  };
  return snapshotRows
    ? { ...report, snapshotMetadata: buildSnapshotMetadata(conversation, turns, snapshotRows) }
    : report;
}

const databaseErrorSchema = z.object({
  cause: z.unknown().optional(),
  code: z.string().optional(),
});

function isUndefinedColumnError(parsedError: ReturnType<typeof databaseErrorSchema.safeParse>) {
  let current = parsedError;
  while (current.success) {
    if (current.data.code === "42703") {
      return true;
    }
    if (current.data.cause === undefined) {
      return false;
    }
    current = databaseErrorSchema.safeParse(current.data.cause);
  }
  return false;
}

async function loadKeyInformationByConversationIds(
  conversationIds: string[],
  includeKeyInformation: boolean,
) {
  if (!includeKeyInformation || conversationIds.length === 0) {
    return new Map<string, InterviewConversationRow["keyInformation"]>();
  }

  try {
    const rows = await db
      .select({
        conversationId: aiInterviewConversation.conversationId,
        keyInformation: aiInterviewConversation.keyInformation,
      })
      .from(aiInterviewConversation)
      .where(inArray(aiInterviewConversation.conversationId, conversationIds));

    return new Map(rows.map((row) => [row.conversationId, row.keyInformation]));
  } catch (error) {
    // Keep existing reports available during a rolling deploy before the
    // key-information migration has reached the database.
    if (isUndefinedColumnError(databaseErrorSchema.safeParse(error))) {
      return new Map<string, InterviewConversationRow["keyInformation"]>();
    }
    throw error;
  }
}

async function loadSnapshotRowsByConversationIds(conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return new Map<string, SnapshotRows>();
  }

  const evidenceRows = await db
    .select()
    .from(recruitingEvidenceSnapshot)
    .where(inArray(recruitingEvidenceSnapshot.conversationId, conversationIds))
    .orderBy(desc(recruitingEvidenceSnapshot.createdAt));

  const evidenceByConversationId = new Map<string, InterviewEvidenceSnapshotRow>();
  for (const evidence of evidenceRows) {
    if (!evidenceByConversationId.has(evidence.conversationId)) {
      evidenceByConversationId.set(evidence.conversationId, evidence);
    }
  }

  const contextIds = [...new Set(evidenceRows.map((evidence) => evidence.contextSnapshotId))];
  const contextRows =
    contextIds.length > 0
      ? await db
          .select()
          .from(recruitingContextSnapshot)
          .where(inArray(recruitingContextSnapshot.id, contextIds))
      : [];
  const contextById = new Map(contextRows.map((context) => [context.id, context]));
  const rowsByConversationId = new Map<string, SnapshotRows>();
  for (const evidence of evidenceByConversationId.values()) {
    rowsByConversationId.set(evidence.conversationId, {
      context: contextById.get(evidence.contextSnapshotId) ?? null,
      evidence,
    });
  }

  return rowsByConversationId;
}

export async function queryInterviewConversationReports(
  interviewRecordId: string,
  options: QueryInterviewConversationReportsOptions = {},
) {
  const conversations = await db
    .select(reportConversationColumns)
    .from(aiInterviewConversation)
    .where(eq(aiInterviewConversation.recruitingRecordId, interviewRecordId))
    .orderBy(desc(aiInterviewConversation.updatedAt));

  if (conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conversation) => conversation.conversationId);
  const keyInformationByConversationId = await loadKeyInformationByConversationIds(
    conversationIds,
    options.includeKeyInformation ?? false,
  );
  const turnRows = await db
    .select()
    .from(aiInterviewConversationTurn)
    .where(inArray(aiInterviewConversationTurn.conversationId, conversationIds))
    .orderBy(
      asc(aiInterviewConversationTurn.createdAt),
      asc(aiInterviewConversationTurn.receivedAt),
    );
  const snapshotRowsByConversationId = options.includeSnapshotMetadata
    ? await loadSnapshotRowsByConversationIds(conversationIds)
    : null;

  return conversations.map((conversation) => {
    const turns = turnRows.filter((turn) => turn.conversationId === conversation.conversationId);
    return serializeConversationReport(
      {
        ...conversation,
        keyInformation: keyInformationByConversationId.get(conversation.conversationId) ?? null,
      },
      turns,
      snapshotRowsByConversationId
        ? (snapshotRowsByConversationId.get(conversation.conversationId) ?? {
            context: null,
            evidence: null,
          })
        : undefined,
      options.includeKeyInformation,
    );
  });
}

// 按轮次（scheduleEntryId）过滤 conversations，适用于 round-keyed 的报告端点。
// Filter conversations by round (scheduleEntryId) for round-keyed report endpoints.
export async function queryInterviewConversationReportsByRound(
  scheduleEntryId: string,
  options: QueryInterviewConversationReportsOptions = {},
): Promise<StudioInterviewConversationReport[]> {
  const conversations = await db
    .select(reportConversationColumns)
    .from(aiInterviewConversation)
    .where(eq(aiInterviewConversation.aiRoundId, scheduleEntryId))
    .orderBy(desc(aiInterviewConversation.updatedAt));

  if (conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conversation) => conversation.conversationId);
  const keyInformationByConversationId = await loadKeyInformationByConversationIds(
    conversationIds,
    options.includeKeyInformation ?? false,
  );
  const turnRows = await db
    .select()
    .from(aiInterviewConversationTurn)
    .where(inArray(aiInterviewConversationTurn.conversationId, conversationIds))
    .orderBy(
      asc(aiInterviewConversationTurn.createdAt),
      asc(aiInterviewConversationTurn.receivedAt),
    );
  const snapshotRowsByConversationId = options.includeSnapshotMetadata
    ? await loadSnapshotRowsByConversationIds(conversationIds)
    : null;

  return conversations.map((conversation) => {
    const turns = turnRows.filter((turn) => turn.conversationId === conversation.conversationId);
    return serializeConversationReport(
      {
        ...conversation,
        keyInformation: keyInformationByConversationId.get(conversation.conversationId) ?? null,
      },
      turns,
      snapshotRowsByConversationId
        ? (snapshotRowsByConversationId.get(conversation.conversationId) ?? {
            context: null,
            evidence: null,
          })
        : undefined,
      options.includeKeyInformation,
    );
  });
}

export async function queryInterviewConversationReportByRound(
  scheduleEntryId: string,
  conversationId: string,
  options: QueryInterviewConversationReportsOptions = {},
): Promise<StudioInterviewConversationReport | null> {
  const [conversation] = await db
    .select(reportConversationColumns)
    .from(aiInterviewConversation)
    .where(
      and(
        eq(aiInterviewConversation.aiRoundId, scheduleEntryId),
        eq(aiInterviewConversation.conversationId, conversationId),
      ),
    )
    .limit(1);

  if (!conversation) {
    return null;
  }

  const keyInformationByConversationId = await loadKeyInformationByConversationIds(
    [conversationId],
    options.includeKeyInformation ?? false,
  );
  const turnRows = await db
    .select()
    .from(aiInterviewConversationTurn)
    .where(eq(aiInterviewConversationTurn.conversationId, conversationId))
    .orderBy(
      asc(aiInterviewConversationTurn.createdAt),
      asc(aiInterviewConversationTurn.receivedAt),
    );
  const snapshotRowsByConversationId = options.includeSnapshotMetadata
    ? await loadSnapshotRowsByConversationIds([conversationId])
    : null;

  return serializeConversationReport(
    {
      ...conversation,
      keyInformation: keyInformationByConversationId.get(conversationId) ?? null,
    },
    turnRows,
    snapshotRowsByConversationId
      ? (snapshotRowsByConversationId.get(conversationId) ?? {
          context: null,
          evidence: null,
        })
      : undefined,
    options.includeKeyInformation,
  );
}
