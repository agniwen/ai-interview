import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type { WorkspaceAuthorizer } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy";
import {
  generateInterviewQuestionsForProfile,
  ResumeAnalysisError,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { resetResumeEvaluationForJobChange } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/evaluation";
import { transitionCandidateStage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/utils/candidate-stage-transition";
import { loadJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  bindResumePoolItemJobDescription,
  loadResumePoolItem,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { normalizeResumePoolItemId } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/tools/resume-pool-id";
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

async function confirmBindPoolItemToJob(input: {
  jobDescriptionId: string;
  operatorId: string | null;
  organizationId: string;
  poolItemId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<ConfirmRecruitingActionResult> {
  const poolItemId = normalizeResumePoolItemId(input.poolItemId);
  const nextJobDescription = await loadJobDescriptionById(
    input.organizationId,
    input.jobDescriptionId,
  );
  if (!nextJobDescription) {
    return { message: "岗位不存在或不属于当前 workspace。", status: "failed" };
  }

  const existing = await loadResumePoolItem({
    organizationId: input.organizationId,
    poolItemId,
    visibilityScope: input.visibilityScope,
  });
  if (!existing) {
    return { message: "人才库记录不存在或无权访问。", status: "failed" };
  }
  if (existing.jobDescriptionId === input.jobDescriptionId) {
    return {
      actionType: "bind_pool_item_to_job",
      message: "人才库条目已绑定到该岗位。",
      status: "noop",
    };
  }
  if (existing.jobDescriptionId) {
    return { message: "该人才库条目已绑定其他岗位。", status: "failed" };
  }

  const bound = await bindResumePoolItemJobDescription({
    actorId: input.operatorId,
    jobDescriptionId: input.jobDescriptionId,
    organizationId: input.organizationId,
    poolItemId,
  });
  if (!bound) {
    return { message: "该人才库条目已绑定岗位。", status: "failed" };
  }
  return {
    actionType: "bind_pool_item_to_job",
    message: "已绑定人才库条目到岗位。",
    status: "executed",
  };
}

async function confirmAdvanceCandidateStage(input: {
  authorize: WorkspaceAuthorizer;
  operatorId: string | null;
  organizationId: string;
  payload: Extract<
    ConfirmRecruitingActionInput["proposal"],
    { type: "advance_candidate_stage" }
  >["payload"];
  proposalId: string;
  proposalTitle: string;
}): Promise<ConfirmRecruitingActionResult> {
  const result = await transitionCandidateStage({
    authorize: input.authorize,
    candidateId: input.payload.resumeRecordId,
    input: input.payload,
    operatorId: input.operatorId,
    organizationId: input.organizationId,
    provenance: {
      kind: "workspace_recruiting_copilot",
      proposalId: input.proposalId,
      proposalTitle: input.proposalTitle,
    },
  });

  if (result.kind === "forbidden") {
    return { message: "没有权限执行目标阶段流转。", status: "failed" };
  }
  if (result.kind === "not_found") {
    return { message: "候选人记录不存在。", status: "failed" };
  }
  if (result.kind === "invalid") {
    return { message: result.message, status: "failed" };
  }
  if (result.kind === "noop") {
    return {
      actionType: "advance_candidate_stage",
      message: "候选人已经处于目标阶段。",
      status: "noop",
    };
  }
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
  authorize: WorkspaceAuthorizer;
  operatorId: string | null;
  organizationId: string;
  proposal: ConfirmRecruitingActionInput["proposal"];
  visibilityScope: RecruitingVisibilityScope;
}) {
  if (input.proposal.type === "bind_candidate_to_job") {
    const jobDescriptionId = input.proposal.payload.jobDescriptionId ?? null;
    if (!jobDescriptionId) {
      return { message: "请先选择要绑定的岗位。", status: "failed" };
    }
    return confirmBindCandidateToJob({
      jobDescriptionId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      proposalId: input.proposal.id,
      proposalTitle: input.proposal.title,
      resumeRecordId: input.proposal.payload.resumeRecordId,
    });
  }
  if (input.proposal.type === "bind_pool_item_to_job") {
    const jobDescriptionId = input.proposal.payload.jobDescriptionId ?? null;
    if (!jobDescriptionId) {
      return { message: "请先选择要绑定的岗位。", status: "failed" };
    }
    return confirmBindPoolItemToJob({
      jobDescriptionId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      poolItemId: input.proposal.payload.poolItemId,
      visibilityScope: input.visibilityScope,
    });
  }
  if (input.proposal.type === "advance_candidate_stage") {
    return confirmAdvanceCandidateStage({
      authorize: input.authorize,
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
