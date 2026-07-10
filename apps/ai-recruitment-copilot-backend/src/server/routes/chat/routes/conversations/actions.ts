import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { hasWorkspacePermission } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-permissions";
import {
  generateInterviewQuestionsForProfile,
  ResumeAnalysisError,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { resetResumeEvaluationForJobChange } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/evaluation";
import {
  getHumanInterviewOfferReadinessError,
  loadHumanInterviewRoundReadiness,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-rounds";
import {
  getCandidateStageTransitionError,
  resolveCandidateTransitionPatch,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/utils/candidate-transition";
import { loadJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { interviewAuditLog, studioInterview } from "@arc/db-schema/schema";
import type { ResumeEvaluationStatus } from "@arc/shared/studio-resumes";
import type { confirmRecruitingActionSchema } from "../../schema";

export type ConfirmRecruitingActionInput = z.infer<typeof confirmRecruitingActionSchema>;

export type ConfirmRecruitingActionResult =
  | {
      actionType: ConfirmRecruitingActionInput["proposal"]["type"];
      message: string;
      status: "executed" | "noop";
    }
  | { message: string; status: "failed" };

async function canManageStageTransition(
  headers: Headers,
  organizationId: string,
  target: string,
): Promise<boolean> {
  if (target === "human_interview") {
    return await hasWorkspacePermission({
      action: "create",
      headers,
      organizationId,
      resource: "humanInterview",
    });
  }
  if (target === "offer") {
    return await hasWorkspacePermission({
      action: "create",
      headers,
      organizationId,
      resource: "offer",
    });
  }
  return true;
}

function normalizeQuestions(
  questions: NonNullable<
    Extract<
      ConfirmRecruitingActionInput["proposal"],
      { type: "generate_interview_questions" }
    >["payload"]["interviewQuestions"]
  >,
) {
  return questions.map((question, index) => ({
    ...question,
    order: index + 1,
    question: question.question.trim(),
  }));
}

async function confirmBindCandidateToJob(input: {
  jobDescriptionId: string | null;
  operatorId: string | null;
  organizationId: string;
  proposalId: string;
  proposalTitle: string;
  resumeRecordId: string;
}): Promise<ConfirmRecruitingActionResult> {
  const nextJobDescription = input.jobDescriptionId
    ? await loadJobDescriptionById(input.organizationId, input.jobDescriptionId)
    : null;
  if (input.jobDescriptionId && !nextJobDescription) {
    return { message: "岗位不存在或不属于当前 workspace。", status: "failed" };
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        jobDescriptionId: studioInterview.jobDescriptionId,
        resumeEvaluationStatus: studioInterview.resumeEvaluationStatus,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!existing) {
      return { kind: "not_found" as const };
    }
    if (existing.jobDescriptionId === input.jobDescriptionId) {
      return { kind: "noop" as const };
    }
    await tx
      .update(studioInterview)
      .set({ jobDescriptionId: input.jobDescriptionId, updatedAt: now })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      );
    await tx.insert(interviewAuditLog).values({
      action: "job_description_changed",
      createdAt: now,
      detail: {
        copilotActionProposalId: input.proposalId,
        copilotActionTitle: input.proposalTitle,
        fromJobDescriptionId: existing.jobDescriptionId,
        fromJobDescriptionName: null,
        source: "workspace_recruiting_copilot",
        toJobDescriptionId: input.jobDescriptionId,
        toJobDescriptionName: nextJobDescription?.name ?? null,
      },
      id: crypto.randomUUID(),
      interviewRecordId: input.resumeRecordId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
    });
    return {
      kind: "updated" as const,
      previousJobDescriptionId: existing.jobDescriptionId,
      previousStatus: existing.resumeEvaluationStatus,
    };
  });

  if (result.kind === "not_found") {
    return { message: "候选人记录不存在。", status: "failed" };
  }
  if (result.kind === "noop") {
    return {
      actionType: "bind_candidate_to_job",
      message: "候选人已绑定到该岗位。",
      status: "noop",
    };
  }
  if (result.previousStatus) {
    await resetResumeEvaluationForJobChange({
      id: input.resumeRecordId,
      nextJobDescriptionId: input.jobDescriptionId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      previousJobDescriptionId: result.previousJobDescriptionId,
      previousStatus: result.previousStatus as ResumeEvaluationStatus,
    });
  }
  invalidateStudioInterviewCaches(input.organizationId);
  return {
    actionType: "bind_candidate_to_job",
    message: "已绑定候选人到岗位。",
    status: "executed",
  };
}

async function confirmAdvanceCandidateStage(input: {
  headers: Headers;
  operatorId: string | null;
  organizationId: string;
  payload: Extract<
    ConfirmRecruitingActionInput["proposal"],
    { type: "advance_candidate_stage" }
  >["payload"];
  proposalId: string;
  proposalTitle: string;
}): Promise<ConfirmRecruitingActionResult> {
  if (
    !(await canManageStageTransition(
      input.headers,
      input.organizationId,
      input.payload.pipelineStage,
    ))
  ) {
    return { message: "没有权限执行目标阶段流转。", status: "failed" };
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        closedMeta: studioInterview.closedMeta,
        jobDescriptionId: studioInterview.jobDescriptionId,
        outcome: studioInterview.outcome,
        pipelineStage: studioInterview.pipelineStage,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.payload.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!existing) {
      return { kind: "not_found" as const };
    }
    if (
      existing.pipelineStage === "closed" &&
      input.payload.pipelineStage !== "closed" &&
      !input.payload.reactivationReason
    ) {
      return { kind: "missing_reactivation_reason" as const };
    }
    let humanInterviewOfferReadinessError: string | null = null;
    let humanInterviewReadyForOffer = false;
    if (existing.pipelineStage === "human_interview" && input.payload.pipelineStage === "offer") {
      const readiness = await loadHumanInterviewRoundReadiness(
        input.payload.resumeRecordId,
        input.organizationId,
      );
      humanInterviewOfferReadinessError = getHumanInterviewOfferReadinessError(readiness);
      humanInterviewReadyForOffer = !humanInterviewOfferReadinessError;
    }
    const stageTransitionError = getCandidateStageTransitionError({
      from: existing.pipelineStage,
      hasJobDescription: Boolean(existing.jobDescriptionId),
      humanInterviewReadyForOffer,
      to: input.payload.pipelineStage,
    });
    if (stageTransitionError) {
      return {
        kind: "invalid_stage_transition" as const,
        message: humanInterviewOfferReadinessError ?? stageTransitionError,
      };
    }
    if (
      existing.pipelineStage === input.payload.pipelineStage &&
      existing.outcome === (input.payload.outcome ?? "in_pipeline")
    ) {
      return { kind: "noop" as const };
    }
    const transition = resolveCandidateTransitionPatch({
      existing,
      input: input.payload,
      now,
    });
    await tx
      .update(studioInterview)
      .set(transition.patch)
      .where(eq(studioInterview.id, input.payload.resumeRecordId));
    await tx.insert(interviewAuditLog).values({
      action: "candidate_transition",
      createdAt: now,
      detail: {
        ...transition.auditDetail,
        copilotActionProposalId: input.proposalId,
        copilotActionTitle: input.proposalTitle,
        source: "workspace_recruiting_copilot",
      },
      id: crypto.randomUUID(),
      interviewRecordId: input.payload.resumeRecordId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      scheduleEntryId: null,
    });
    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") {
    return { message: "候选人记录不存在。", status: "failed" };
  }
  if (result.kind === "missing_reactivation_reason") {
    return { message: "请填写重新激活原因。", status: "failed" };
  }
  if (result.kind === "invalid_stage_transition") {
    return { message: result.message, status: "failed" };
  }
  if (result.kind === "noop") {
    return {
      actionType: "advance_candidate_stage",
      message: "候选人已经处于目标阶段。",
      status: "noop",
    };
  }
  invalidateStudioInterviewCaches(input.organizationId);
  return {
    actionType: "advance_candidate_stage",
    message: "已推进候选人阶段。",
    status: "executed",
  };
}

async function confirmGenerateInterviewQuestions(input: {
  operatorId: string | null;
  organizationId: string;
  payload: Extract<
    ConfirmRecruitingActionInput["proposal"],
    { type: "generate_interview_questions" }
  >["payload"];
  proposalId: string;
  proposalTitle: string;
}): Promise<ConfirmRecruitingActionResult> {
  const [existing] = await db
    .select({ resumeProfile: studioInterview.resumeProfile })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, input.payload.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!existing) {
    return { message: "候选人记录不存在。", status: "failed" };
  }
  if (!(input.payload.interviewQuestions?.length || existing.resumeProfile)) {
    return { message: "候选人没有可用于生成面试题的结构化简历。", status: "failed" };
  }
  try {
    let questions = input.payload.interviewQuestions?.length
      ? normalizeQuestions(input.payload.interviewQuestions)
      : [];
    if (questions.length === 0 && existing.resumeProfile) {
      questions = await generateInterviewQuestionsForProfile(existing.resumeProfile);
    }
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(studioInterview)
        .set({ interviewQuestions: questions, updatedAt: now })
        .where(
          and(
            eq(studioInterview.id, input.payload.resumeRecordId),
            eq(studioInterview.organizationId, input.organizationId),
          ),
        );
      await tx.insert(interviewAuditLog).values({
        action: "interview_questions_drafted",
        createdAt: now,
        detail: {
          copilotActionProposalId: input.proposalId,
          copilotActionTitle: input.proposalTitle,
          questionCount: questions.length,
          source: "workspace_recruiting_copilot",
        },
        id: crypto.randomUUID(),
        interviewRecordId: input.payload.resumeRecordId,
        operatorId: input.operatorId,
        organizationId: input.organizationId,
      });
    });
    invalidateStudioInterviewCaches(input.organizationId);
    return {
      actionType: "generate_interview_questions",
      message: `已生成 ${questions.length} 道面试题草稿。`,
      status: "executed",
    };
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      return { message: error.message, status: "failed" };
    }
    return { message: "面试题生成失败。", status: "failed" };
  }
}

export function confirmRecruitingAction(input: {
  headers: Headers;
  operatorId: string | null;
  organizationId: string;
  proposal: ConfirmRecruitingActionInput["proposal"];
}) {
  if (input.proposal.type === "bind_candidate_to_job") {
    return confirmBindCandidateToJob({
      jobDescriptionId: input.proposal.payload.jobDescriptionId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      proposalId: input.proposal.id,
      proposalTitle: input.proposal.title,
      resumeRecordId: input.proposal.payload.resumeRecordId,
    });
  }
  if (input.proposal.type === "advance_candidate_stage") {
    return confirmAdvanceCandidateStage({
      headers: input.headers,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      payload: input.proposal.payload,
      proposalId: input.proposal.id,
      proposalTitle: input.proposal.title,
    });
  }
  return confirmGenerateInterviewQuestions({
    operatorId: input.operatorId,
    organizationId: input.organizationId,
    payload: input.proposal.payload,
    proposalId: input.proposal.id,
    proposalTitle: input.proposal.title,
  });
}
