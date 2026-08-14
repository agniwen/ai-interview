import type {
  InterviewReportSnapshotMetadata,
  StudioInterviewConversationReport,
} from "@arc/db-schema/interview-session";
import { interviewKeyInformationSchema } from "@arc/db-schema/interview-key-information";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { formatCandidateFormAnswer } from "@arc/shared/candidate-form-answer";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  interviewContextSnapshot,
  interviewConversation,
  interviewConversationTurn,
  interviewEvidenceSnapshot,
} from "@arc/db-schema/schema";

type InterviewConversationRow = typeof interviewConversation.$inferSelect;
type InterviewConversationTurnRow = typeof interviewConversationTurn.$inferSelect;
type InterviewContextSnapshotRow = typeof interviewContextSnapshot.$inferSelect;
type InterviewEvidenceSnapshotRow = typeof interviewEvidenceSnapshot.$inferSelect;
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
  | "interviewRecordId"
  | "lastSyncedAt"
  | "latestError"
  | "metadata"
  | "metrics"
  | "mode"
  | "organizationId"
  | "recordingDurationSecs"
  | "recordingStatus"
  | "scheduleEntryId"
  | "startedAt"
  | "status"
  | "transcript"
  | "transcriptSummary"
  | "updatedAt"
  | "webhookReceivedAt"
> & {
  keyInformation: InterviewConversationRow["keyInformation"];
};

const reportConversationColumns = {
  agentId: interviewConversation.agentId,
  callSuccessful: interviewConversation.callSuccessful,
  conversationId: interviewConversation.conversationId,
  createdAt: interviewConversation.createdAt,
  dataCollectionResults: interviewConversation.dataCollectionResults,
  dynamicVariables: interviewConversation.dynamicVariables,
  endedAt: interviewConversation.endedAt,
  evaluationCriteriaResults: interviewConversation.evaluationCriteriaResults,
  interviewRecordId: interviewConversation.interviewRecordId,
  lastSyncedAt: interviewConversation.lastSyncedAt,
  latestError: interviewConversation.latestError,
  metadata: interviewConversation.metadata,
  metrics: interviewConversation.metrics,
  mode: interviewConversation.mode,
  organizationId: interviewConversation.organizationId,
  recordingDurationSecs: interviewConversation.recordingDurationSecs,
  recordingStatus: interviewConversation.recordingStatus,
  scheduleEntryId: interviewConversation.scheduleEntryId,
  startedAt: interviewConversation.startedAt,
  status: interviewConversation.status,
  transcript: interviewConversation.transcript,
  transcriptSummary: interviewConversation.transcriptSummary,
  updatedAt: interviewConversation.updatedAt,
  webhookReceivedAt: interviewConversation.webhookReceivedAt,
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
    interviewRecordId: conversation.interviewRecordId,
    message: turn.message,
    organizationId: conversation.organizationId,
    receivedAt: fallbackReceivedAt,
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

function stringifyJsonInput(value: unknown) {
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

  return {
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
          scheduleEntryId: context.scheduleEntryId,
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
          scheduleEntryId: evidence.scheduleEntryId,
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

  return {
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
    ...(snapshotRows
      ? { snapshotMetadata: buildSnapshotMetadata(conversation, turns, snapshotRows) }
      : {}),
    startedAt: conversation.startedAt,
    status: conversation.status,
    transcriptSummary: conversation.transcriptSummary,
    turnCount: turns.length,
    turns,
    updatedAt: conversation.updatedAt,
    userTurnCount: turns.filter((turn) => turn.role === "user").length,
    webhookReceivedAt: conversation.webhookReceivedAt,
  };
}

function isUndefinedColumnError(error: unknown) {
  let current = error;
  while (current && typeof current === "object") {
    if ("code" in current && current.code === "42703") {
      return true;
    }
    current = "cause" in current ? current.cause : null;
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
        conversationId: interviewConversation.conversationId,
        keyInformation: interviewConversation.keyInformation,
      })
      .from(interviewConversation)
      .where(inArray(interviewConversation.conversationId, conversationIds));

    return new Map(rows.map((row) => [row.conversationId, row.keyInformation]));
  } catch (error) {
    // Keep existing reports available during a rolling deploy before the
    // key-information migration has reached the database.
    if (isUndefinedColumnError(error)) {
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
    .from(interviewEvidenceSnapshot)
    .where(inArray(interviewEvidenceSnapshot.conversationId, conversationIds))
    .orderBy(desc(interviewEvidenceSnapshot.createdAt));

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
          .from(interviewContextSnapshot)
          .where(inArray(interviewContextSnapshot.id, contextIds))
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
    .from(interviewConversation)
    .where(eq(interviewConversation.interviewRecordId, interviewRecordId))
    .orderBy(desc(interviewConversation.updatedAt));

  if (conversations.length === 0) {
    return [] as StudioInterviewConversationReport[];
  }

  const conversationIds = conversations.map((conversation) => conversation.conversationId);
  const keyInformationByConversationId = await loadKeyInformationByConversationIds(
    conversationIds,
    options.includeKeyInformation ?? false,
  );
  const turnRows = await db
    .select()
    .from(interviewConversationTurn)
    .where(inArray(interviewConversationTurn.conversationId, conversationIds))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));
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
) {
  const conversations = await db
    .select(reportConversationColumns)
    .from(interviewConversation)
    .where(eq(interviewConversation.scheduleEntryId, scheduleEntryId))
    .orderBy(desc(interviewConversation.updatedAt));

  if (conversations.length === 0) {
    return [] as StudioInterviewConversationReport[];
  }

  const conversationIds = conversations.map((conversation) => conversation.conversationId);
  const keyInformationByConversationId = await loadKeyInformationByConversationIds(
    conversationIds,
    options.includeKeyInformation ?? false,
  );
  const turnRows = await db
    .select()
    .from(interviewConversationTurn)
    .where(inArray(interviewConversationTurn.conversationId, conversationIds))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));
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
) {
  const [conversation] = await db
    .select(reportConversationColumns)
    .from(interviewConversation)
    .where(
      and(
        eq(interviewConversation.scheduleEntryId, scheduleEntryId),
        eq(interviewConversation.conversationId, conversationId),
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
    .from(interviewConversationTurn)
    .where(eq(interviewConversationTurn.conversationId, conversationId))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));
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
