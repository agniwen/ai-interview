import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import {
  aiInterviewConversation,
  aiInterviewRound,
  humanInterviewEvaluationSnapshot,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewReviewerEvaluation,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import type {
  HumanInterviewEvaluationStatus,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import type { InterviewSummaryStatus } from "@app/db-schema/db-enums";
import { loadRoundReviewerIds } from "@app/meeting-processing/human-interview";
import type { RecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import type {
  StudioCalendarEvaluator,
  StudioCalendarRoundEvaluation,
} from "@app/shared/studio-calendar";
import { db } from "../../../../infrastructure/db/index";
import { resolveAiRoundConclusion, resolveHumanRoundConclusion } from "./events";

const AI_EVALUATOR_ID = "ai";
const AI_EVALUATOR_NAME = "AI 面试官";

function emptyText(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function isRecordVisible(createdBy: string | null, visibilityScope: RecruitingVisibilityScope) {
  return (
    visibilityScope.kind === "all" ||
    (visibilityScope.kind === "restricted" &&
      createdBy !== null &&
      visibilityScope.userIds.includes(createdBy))
  );
}

function aiEvaluationStatusText(status: HumanInterviewEvaluationStatus): string {
  if (status === "generating") {
    return "AI 评价生成中";
  }
  if (status === "failed") {
    return "AI 评价生成失败";
  }
  return "暂无 AI 评价";
}

async function isViewerMeetingParticipant(
  roundId: string,
  organizationId: string,
  viewerUserId: string,
) {
  const [row] = await db
    .select({ userId: humanInterviewMeetingInterviewer.userId })
    .from(humanInterviewMeetingRound)
    .innerJoin(
      humanInterviewMeetingInterviewer,
      eq(humanInterviewMeetingInterviewer.meetingId, humanInterviewMeetingRound.meetingId),
    )
    .where(
      and(
        eq(humanInterviewMeetingRound.roundId, roundId),
        eq(humanInterviewMeetingInterviewer.organizationId, organizationId),
        eq(humanInterviewMeetingInterviewer.userId, viewerUserId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * 真人轮次的各面试官评价与 AI 评价。草稿不对外展示，未提交的面试官显示为未评价。
 * / Every interviewer's submitted evaluation plus the AI draft; unsubmitted drafts stay private.
 */
export async function loadHumanRoundEvaluation({
  organizationId,
  roundId,
  viewerUserId,
  visibilityScope,
}: {
  organizationId: string;
  roundId: string;
  viewerUserId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<StudioCalendarRoundEvaluation | null> {
  if (visibilityScope.kind === "none") {
    return null;
  }
  const [round] = await db
    .select({
      createdBy: recruitingRecordReadModel.createdBy,
      evaluationStatus: humanInterviewRound.evaluationStatus,
      outcome: humanInterviewRound.outcome,
    })
    .from(humanInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
    )
    .where(
      and(
        eq(humanInterviewRound.id, roundId),
        eq(humanInterviewRound.organizationId, organizationId),
        ne(humanInterviewRound.status, "cancelled"),
      ),
    )
    .limit(1);
  if (!round) {
    return null;
  }

  const reviewerIds = await loadRoundReviewerIds(db, roundId);
  const visible =
    isRecordVisible(round.createdBy, visibilityScope) ||
    reviewerIds.has(viewerUserId) ||
    (await isViewerMeetingParticipant(roundId, organizationId, viewerUserId));
  if (!visible) {
    return null;
  }

  const [submissions, [aiSnapshot]] = await Promise.all([
    db
      .select({
        evaluation: humanInterviewReviewerEvaluation.evaluation,
        id: humanInterviewReviewerEvaluation.id,
        outcome: humanInterviewReviewerEvaluation.outcome,
        reviewerId: humanInterviewReviewerEvaluation.reviewerId,
        reviewerImage: user.image,
        reviewerName: user.name,
        submittedAt: humanInterviewReviewerEvaluation.submittedAt,
      })
      .from(humanInterviewReviewerEvaluation)
      .leftJoin(user, eq(user.id, humanInterviewReviewerEvaluation.reviewerId))
      .where(
        and(
          eq(humanInterviewReviewerEvaluation.roundId, roundId),
          eq(humanInterviewReviewerEvaluation.organizationId, organizationId),
          isNotNull(humanInterviewReviewerEvaluation.submittedAt),
        ),
      )
      .orderBy(
        asc(humanInterviewReviewerEvaluation.submittedAt),
        asc(humanInterviewReviewerEvaluation.id),
      ),
    db
      .select({
        createdAt: humanInterviewEvaluationSnapshot.createdAt,
        evaluation: humanInterviewEvaluationSnapshot.evaluation,
        outcome: humanInterviewEvaluationSnapshot.outcome,
      })
      .from(humanInterviewEvaluationSnapshot)
      .where(
        and(
          eq(humanInterviewEvaluationSnapshot.roundId, roundId),
          eq(humanInterviewEvaluationSnapshot.organizationId, organizationId),
          eq(humanInterviewEvaluationSnapshot.source, "ai_generated"),
        ),
      )
      .orderBy(desc(humanInterviewEvaluationSnapshot.createdAt))
      .limit(1),
  ]);

  const submittedReviewerIds = new Set(submissions.map((row) => row.reviewerId));
  const pendingReviewerIds = [...reviewerIds].filter((id) => !submittedReviewerIds.has(id));
  const pendingReviewers =
    pendingReviewerIds.length === 0
      ? []
      : await db
          .select({ avatarUrl: user.image, id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, pendingReviewerIds))
          .orderBy(asc(user.name));

  const evaluators: StudioCalendarEvaluator[] = [
    ...submissions.map(
      (row): StudioCalendarEvaluator => ({
        avatarUrl: row.reviewerImage,
        id: row.reviewerId ?? row.id,
        kind: "human",
        name: row.reviewerName ?? "历史轮次评价（作者未知）",
        outcome: row.outcome,
        overallEvaluation: emptyText(row.evaluation.overallEvaluation),
        rating: row.evaluation.rating ?? null,
        risks: emptyText(row.evaluation.risks),
        statusText: null,
        strengths: emptyText(row.evaluation.strengths),
        submittedAt: row.submittedAt?.toISOString() ?? null,
      }),
    ),
    ...pendingReviewers.map(
      (reviewer): StudioCalendarEvaluator => ({
        avatarUrl: reviewer.avatarUrl,
        id: reviewer.id,
        kind: "human",
        name: reviewer.name,
        outcome: null,
        overallEvaluation: null,
        rating: null,
        risks: null,
        statusText: "尚未提交评价",
        strengths: null,
        submittedAt: null,
      }),
    ),
    aiSnapshot
      ? {
          avatarUrl: null,
          id: AI_EVALUATOR_ID,
          kind: "ai",
          name: AI_EVALUATOR_NAME,
          outcome: aiSnapshot.outcome,
          overallEvaluation: emptyText(aiSnapshot.evaluation.overallEvaluation),
          rating: aiSnapshot.evaluation.rating,
          risks: emptyText(aiSnapshot.evaluation.risks),
          statusText: null,
          strengths: emptyText(aiSnapshot.evaluation.strengths),
          submittedAt: aiSnapshot.createdAt.toISOString(),
        }
      : {
          avatarUrl: null,
          id: AI_EVALUATOR_ID,
          kind: "ai",
          name: AI_EVALUATOR_NAME,
          outcome: null,
          overallEvaluation: null,
          rating: null,
          risks: null,
          statusText: aiEvaluationStatusText(round.evaluationStatus),
          strengths: null,
          submittedAt: null,
        },
  ];

  return {
    conclusion: resolveHumanRoundConclusion({
      evaluationStatus: round.evaluationStatus,
      outcome: round.outcome,
      submittedOutcomes: submissions.map((row) => row.outcome),
    }),
    evaluators,
    roundId,
  };
}

function aiReportStatusText(
  conversation: { summaryStatus: InterviewSummaryStatus; summary: string | null } | undefined,
): string | null {
  if (!conversation) {
    return "AI 面试尚未完成";
  }
  if (conversation.summaryStatus === "failed") {
    return "报告生成失败";
  }
  if (conversation.summaryStatus === "running") {
    return "报告生成中";
  }
  if (conversation.summaryStatus === "pending") {
    return "报告待生成";
  }
  return emptyText(conversation.summary) ? null : "暂无面试总结";
}

/**
 * AI 轮次：AI 报告摘要（AI 不给出通过与否），以及做出决定的人工评价。
 * / An AI round: the report summary (the AI never decides) and the human decision, if any.
 */
export async function loadAiRoundEvaluation({
  organizationId,
  roundId,
  visibilityScope,
}: {
  organizationId: string;
  roundId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<StudioCalendarRoundEvaluation | null> {
  if (visibilityScope.kind === "none") {
    return null;
  }
  const [round] = await db
    .select({
      conversationId: aiInterviewRound.conversationId,
      createdBy: recruitingRecordReadModel.createdBy,
      reviewNotes: aiInterviewRound.reviewNotes,
      reviewOutcome: aiInterviewRound.reviewOutcome,
      reviewedAt: aiInterviewRound.reviewedAt,
      reviewedBy: aiInterviewRound.reviewedBy,
      reviewerImage: user.image,
      reviewerName: user.name,
    })
    .from(aiInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, aiInterviewRound.recruitingRecordId),
    )
    .leftJoin(user, eq(user.id, aiInterviewRound.reviewedBy))
    .where(
      and(eq(aiInterviewRound.id, roundId), eq(aiInterviewRound.organizationId, organizationId)),
    )
    .limit(1);
  if (!(round && isRecordVisible(round.createdBy, visibilityScope))) {
    return null;
  }

  const [conversation] = round.conversationId
    ? await db
        .select({
          summary: aiInterviewConversation.transcriptSummary,
          summaryStatus: aiInterviewConversation.summaryStatus,
        })
        .from(aiInterviewConversation)
        .where(
          and(
            eq(aiInterviewConversation.conversationId, round.conversationId),
            eq(aiInterviewConversation.aiRoundId, roundId),
            eq(aiInterviewConversation.organizationId, organizationId),
          ),
        )
        .limit(1)
    : [];

  const statusText = aiReportStatusText(conversation);
  const evaluators: StudioCalendarEvaluator[] = [
    {
      avatarUrl: null,
      id: AI_EVALUATOR_ID,
      kind: "ai",
      name: AI_EVALUATOR_NAME,
      outcome: null,
      overallEvaluation: statusText ? null : emptyText(conversation?.summary),
      rating: null,
      risks: null,
      statusText,
      strengths: null,
      submittedAt: null,
    },
  ];
  if (round.reviewOutcome) {
    const outcome: HumanInterviewRoundOutcome = round.reviewOutcome;
    evaluators.unshift({
      avatarUrl: round.reviewerImage,
      id: round.reviewedBy ?? "reviewer",
      kind: "human",
      name: round.reviewerName ?? "未知评价人",
      outcome,
      overallEvaluation: emptyText(round.reviewNotes),
      rating: null,
      risks: null,
      statusText: null,
      strengths: null,
      submittedAt: round.reviewedAt?.toISOString() ?? null,
    });
  }

  return {
    conclusion: resolveAiRoundConclusion(round.reviewOutcome),
    evaluators,
    roundId,
  };
}
