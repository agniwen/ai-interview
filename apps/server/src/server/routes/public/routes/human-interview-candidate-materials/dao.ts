import { createHash } from "node:crypto";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../../../../lib/server/db/index";
import { resolveHumanInterviewMeetingInterviewerInviteToken } from "../../../studio/routes/interviews/dao/human-interview-meetings";
import { resumeProfileSchema } from "@app/db-schema/interview/types";
import {
  qualitativeResumeEvaluationV1Schema,
  qualitativeResumeEvaluationV2Schema,
} from "@app/db-schema/qualitative-resume-evaluation";
import {
  interviewAuditLog,
  interviewConversation,
  jobDescription,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@app/db-schema/schema";
import { studioInterviewQuestionClientSchema } from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewCandidateAiEvaluationResponse,
  HumanInterviewCandidateHrInformationResponse,
  HumanInterviewCandidateMaterialListItem,
  HumanInterviewCandidateOverviewResponse,
  HumanInterviewCandidateQuestionsResponse,
} from "@app/shared/human-interview-candidate-materials";
import { humanInterviewCandidateHrEvaluationSchema } from "@app/shared/human-interview-candidate-materials";
import { z } from "zod";

export type HumanInterviewCandidateMaterialsScope = NonNullable<
  Awaited<ReturnType<typeof resolveHumanInterviewMeetingInterviewerInviteToken>>
>;

export type HumanInterviewCandidateMaterialsAuthorization =
  | { status: "authorized"; scope: HumanInterviewCandidateMaterialsScope }
  | { status: "not_found" }
  | { status: "unavailable" };

export async function authorizeHumanInterviewCandidateMaterials(input: {
  inviteToken: string;
}): Promise<HumanInterviewCandidateMaterialsAuthorization> {
  const scope = await resolveHumanInterviewMeetingInterviewerInviteToken(input.inviteToken);
  if (!scope) {
    return { status: "not_found" };
  }
  if (
    scope.status === "cancelled" ||
    !scope.validUntil ||
    Date.parse(scope.validUntil) < Date.now()
  ) {
    return { status: "unavailable" };
  }

  return { scope, status: "authorized" };
}

export async function listHumanInterviewMeetingCandidates(
  scope: HumanInterviewCandidateMaterialsScope,
): Promise<HumanInterviewCandidateMaterialListItem[]> {
  const rows = await db
    .select({
      candidateName: studioInterview.candidateName,
      id: studioInterview.id,
      roundId: studioHumanInterviewRound.id,
      roundLabel: studioHumanInterviewRound.label,
      targetRole: studioInterview.targetRole,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, scope.meetingId),
        eq(studioHumanInterviewRound.organizationId, scope.organizationId),
        eq(studioInterview.organizationId, scope.organizationId),
      ),
    )
    .orderBy(asc(studioHumanInterviewRound.sortOrder), asc(studioInterview.candidateName));

  const candidates = new Map<string, HumanInterviewCandidateMaterialListItem>();
  for (const row of rows) {
    const existing = candidates.get(row.id);
    if (existing) {
      existing.rounds.push({ id: row.roundId, label: row.roundLabel });
      continue;
    }
    candidates.set(row.id, {
      candidateName: row.candidateName,
      id: row.id,
      rounds: [{ id: row.roundId, label: row.roundLabel }],
      targetRole: row.targetRole,
    });
  }
  return [...candidates.values()];
}

const creator = alias(user, "candidate_materials_creator");
const questionListSchema = z.array(studioInterviewQuestionClientSchema);

function resolveAiEvaluation(row: {
  qualitativeResumeEvaluation: unknown;
  resumeReviewStatus: "failed" | "idle" | "processing" | "queued" | "ready";
}): HumanInterviewCandidateAiEvaluationResponse["aiEvaluation"] {
  const evaluation = qualitativeResumeEvaluationV2Schema.safeParse(row.qualitativeResumeEvaluation);
  if (evaluation.success) {
    return { evaluation: evaluation.data, status: "ready" };
  }
  if (qualitativeResumeEvaluationV1Schema.safeParse(row.qualitativeResumeEvaluation).success) {
    return { evaluation: null, status: "legacy" };
  }
  if (row.resumeReviewStatus === "queued" || row.resumeReviewStatus === "processing") {
    return { evaluation: null, status: "pending" };
  }
  if (row.resumeReviewStatus === "failed") {
    return { evaluation: null, status: "failed" };
  }
  return { evaluation: null, status: "missing" };
}

export async function loadHumanInterviewCandidateOverview(input: {
  candidateId: string;
  scope: HumanInterviewCandidateMaterialsScope;
}): Promise<HumanInterviewCandidateOverviewResponse | null> {
  const [row] = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      creatorName: creator.name,
      id: studioInterview.id,
      jobDescriptionName: jobDescription.name,
      resumeFileName: studioInterview.resumeFileName,
      resumeProfile: studioInterview.resumeProfile,
      resumeStorageKey: studioInterview.resumeStorageKey,
      targetRole: studioInterview.targetRole,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .leftJoin(creator, eq(studioInterview.createdBy, creator.id))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.scope.meetingId),
        eq(studioInterview.id, input.candidateId),
        eq(studioInterview.organizationId, input.scope.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const resumeProfile = resumeProfileSchema.safeParse(row.resumeProfile);
  return {
    candidate: {
      candidateEmail: row.candidateEmail,
      candidateName: row.candidateName,
      candidatePhone: row.candidatePhone,
      creatorName: row.creatorName,
      hasResumeFile: Boolean(row.resumeStorageKey),
      id: row.id,
      jobDescriptionName: row.jobDescriptionName,
      resumeFileName: row.resumeFileName,
      resumeProfile: resumeProfile.success ? resumeProfile.data : null,
      targetRole: row.targetRole,
    },
  };
}

export async function loadHumanInterviewCandidateAiEvaluation(input: {
  candidateId: string;
  scope: HumanInterviewCandidateMaterialsScope;
}): Promise<HumanInterviewCandidateAiEvaluationResponse | null> {
  const [row] = await db
    .select({
      qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
      resumeReviewStatus: studioInterview.resumeReviewStatus,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.scope.meetingId),
        eq(studioInterview.id, input.candidateId),
        eq(studioInterview.organizationId, input.scope.organizationId),
      ),
    )
    .limit(1);
  return row ? { aiEvaluation: resolveAiEvaluation(row) } : null;
}

export async function loadHumanInterviewCandidateHrInformation(input: {
  candidateId: string;
  scope: HumanInterviewCandidateMaterialsScope;
}): Promise<HumanInterviewCandidateHrInformationResponse | null> {
  // Anchor history to the linked round, not the candidate's latest round. For legacy
  // meetings with multiple rounds, the earliest linked round is the safe boundary.
  const [currentRound] = await db
    .select({ sortOrder: studioHumanInterviewRound.sortOrder })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.scope.meetingId),
        eq(studioHumanInterviewRound.organizationId, input.scope.organizationId),
        eq(studioInterview.organizationId, input.scope.organizationId),
        eq(studioInterview.id, input.candidateId),
      ),
    )
    .orderBy(asc(studioHumanInterviewRound.sortOrder))
    .limit(1);
  if (!currentRound) {
    return null;
  }

  const rounds = await db
    .select({
      evaluation: studioHumanInterviewRound.evaluation,
      outcome: studioHumanInterviewRound.outcome,
      roundId: studioHumanInterviewRound.id,
      roundLabel: studioHumanInterviewRound.label,
      submittedAt: studioHumanInterviewRound.evaluationSubmittedAt,
      submittedBy: user.name,
    })
    .from(studioHumanInterviewRound)
    .leftJoin(user, eq(studioHumanInterviewRound.evaluationUpdatedBy, user.id))
    .where(
      and(
        eq(studioHumanInterviewRound.organizationId, input.scope.organizationId),
        eq(studioHumanInterviewRound.interviewRecordId, input.candidateId),
        lt(studioHumanInterviewRound.sortOrder, currentRound.sortOrder),
        eq(studioHumanInterviewRound.status, "completed"),
        eq(studioHumanInterviewRound.evaluationStatus, "submitted"),
      ),
    )
    .orderBy(asc(studioHumanInterviewRound.sortOrder), asc(studioHumanInterviewRound.id));
  const previousEvaluations = rounds.flatMap(({ evaluation, submittedAt, ...round }) => {
    if (!evaluation) {
      return [];
    }
    return [
      {
        ...round,
        submittedAt: submittedAt?.toISOString() ?? null,
        values: {
          professionalSkill: evaluation.professionalSkill,
          rating: evaluation.rating,
          risks: evaluation.risks,
          rolePosition: evaluation.rolePosition,
          salaryRecommendation: evaluation.salaryRecommendation,
          seniorityPosition: evaluation.seniorityPosition,
          strengths: evaluation.strengths,
        },
      },
    ];
  });
  const conversations = await db
    .select({
      conversationId: interviewConversation.conversationId,
      evaluationCriteriaResults: interviewConversation.evaluationCriteriaResults,
      roundLabel: studioInterviewSchedule.roundLabel,
      updatedAt: interviewConversation.updatedAt,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .innerJoin(
      interviewConversation,
      eq(interviewConversation.interviewRecordId, studioInterview.id),
    )
    .leftJoin(
      studioInterviewSchedule,
      eq(interviewConversation.scheduleEntryId, studioInterviewSchedule.id),
    )
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.scope.meetingId),
        eq(studioInterview.id, input.candidateId),
        eq(interviewConversation.interviewRecordId, input.candidateId),
        eq(interviewConversation.organizationId, input.scope.organizationId),
        eq(interviewConversation.summaryStatus, "ready"),
      ),
    )
    .orderBy(desc(interviewConversation.updatedAt));
  const [hrInitialInformation] = conversations.flatMap((conversation) => {
    const parsed = humanInterviewCandidateHrEvaluationSchema.safeParse(
      conversation.evaluationCriteriaResults.hrEvaluation,
    );
    return parsed.success
      ? [
          {
            conversationId: conversation.conversationId,
            generatedAt: conversation.updatedAt.toISOString(),
            roundLabel: conversation.roundLabel,
            values: parsed.data,
          },
        ]
      : [];
  });
  return { hrInitialInformation: hrInitialInformation ?? null, previousEvaluations };
}

export async function loadHumanInterviewCandidateQuestions(input: {
  candidateId: string;
  scope: HumanInterviewCandidateMaterialsScope;
}): Promise<HumanInterviewCandidateQuestionsResponse | null> {
  const [row] = await db
    .select({ interviewQuestions: studioInterview.interviewQuestions })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.scope.meetingId),
        eq(studioInterview.id, input.candidateId),
        eq(studioInterview.organizationId, input.scope.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const questions = questionListSchema.safeParse(row.interviewQuestions);
  return { interviewQuestions: questions.success ? questions.data : [] };
}

export async function loadHumanInterviewCandidateResume(input: {
  candidateId: string;
  scope: HumanInterviewCandidateMaterialsScope;
}): Promise<{ fileName: string | null; storageKey: string } | null> {
  const [row] = await db
    .select({
      fileName: studioInterview.resumeFileName,
      storageKey: studioInterview.resumeStorageKey,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.scope.meetingId),
        eq(studioInterview.id, input.candidateId),
        eq(studioInterview.organizationId, input.scope.organizationId),
      ),
    )
    .limit(1);
  return row?.storageKey ? { fileName: row.fileName, storageKey: row.storageKey } : null;
}

export async function recordHumanInterviewCandidateMaterialView(input: {
  candidateId: string;
  scope: HumanInterviewCandidateMaterialsScope;
}): Promise<void> {
  const fingerprint = createHash("sha256")
    .update(`${input.scope.meetingId}\0${input.candidateId}\0${input.scope.userId}`)
    .digest("hex");
  await db
    .insert(interviewAuditLog)
    .values({
      action: "human_interview.candidate_materials_viewed",
      detail: { meetingId: input.scope.meetingId },
      id: `human-interview-candidate-view:${fingerprint}`,
      interviewRecordId: input.candidateId,
      operatorId: input.scope.userId,
      organizationId: input.scope.organizationId,
    })
    .onConflictDoNothing();
}
