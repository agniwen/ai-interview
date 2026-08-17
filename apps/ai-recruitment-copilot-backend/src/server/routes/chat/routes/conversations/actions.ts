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
import { transitionCandidateStage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/utils/candidate-stage-transition";
import { loadRecruitingJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { loadResumePoolItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { normalizeResumePoolItemId } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/tools/resume-pool-id";
import { interviewAuditLog, studioInterview } from "@arc/db-schema/schema";
import {
  patchRecruitingActionConfirmationInConversation,
  upsertConversationContextJobBinding,
} from "../../dao/chat";
import type { confirmRecruitingActionSchema } from "../../schema";

export type ConfirmRecruitingActionInput = z.infer<typeof confirmRecruitingActionSchema>;

export type ConfirmRecruitingActionResult =
  | {
      actionType: ConfirmRecruitingActionInput["proposal"]["type"];
      confirmation?: {
        confirmedAt: string;
        jobDescriptionId?: string;
        jobDescriptionName?: string | null;
        status: "confirmed" | "ignored";
      };
      message: string;
      status: "executed" | "noop";
    }
  | { message: string; status: "failed" };

export interface RecruitingActionDependencies {
  loadJobDescription: typeof loadRecruitingJobDescriptionById;
  loadPoolItem: typeof loadResumePoolItem;
  patchConfirmation: typeof patchRecruitingActionConfirmationInConversation;
  resumeRecordExists(input: { organizationId: string; resumeRecordId: string }): Promise<boolean>;
  upsertBinding: typeof upsertConversationContextJobBinding;
}

const defaultDependencies: RecruitingActionDependencies = {
  loadJobDescription: loadRecruitingJobDescriptionById,
  loadPoolItem: loadResumePoolItem,
  patchConfirmation: patchRecruitingActionConfirmationInConversation,
  async resumeRecordExists(input) {
    const [existing] = await db
      .select({ id: studioInterview.id })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    return Boolean(existing);
  },
  upsertBinding: upsertConversationContextJobBinding,
};

type RecruitingActionConfirmation = NonNullable<
  Extract<ConfirmRecruitingActionResult, { status: "executed" | "noop" }>["confirmation"]
>;

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

async function stampProposalConfirmation(
  input: {
    conversationId: string;
    jobDescriptionId?: string;
    jobDescriptionName?: string | null;
    organizationId: string;
    proposalId: string;
    status: "confirmed" | "ignored";
  },
  dependencies: RecruitingActionDependencies,
) {
  const confirmation: RecruitingActionConfirmation = {
    confirmedAt: new Date().toISOString(),
    status: input.status,
  };
  if (input.jobDescriptionId) {
    confirmation.jobDescriptionId = input.jobDescriptionId;
  }
  if (input.jobDescriptionName !== undefined) {
    confirmation.jobDescriptionName = input.jobDescriptionName;
  }
  await dependencies.patchConfirmation({
    confirmation,
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
  });
  return confirmation;
}

async function confirmBindCandidateToJob(
  input: {
    conversationId: string;
    jobDescriptionId: string;
    organizationId: string;
    proposalId: string;
    resumeRecordId: string;
  },
  dependencies: RecruitingActionDependencies,
): Promise<ConfirmRecruitingActionResult> {
  const nextJobDescription = await dependencies.loadJobDescription(
    input.organizationId,
    input.jobDescriptionId,
  );
  if (!nextJobDescription) {
    return { message: "岗位不存在或不属于当前 workspace。", status: "failed" };
  }

  const existing = await dependencies.resumeRecordExists(input);
  if (!existing) {
    return { message: "候选人记录不存在。", status: "failed" };
  }

  const result = await dependencies.upsertBinding({
    conversationId: input.conversationId,
    jobDescriptionId: input.jobDescriptionId,
    jobDescriptionName: nextJobDescription.name,
    kind: "resume_record",
    organizationId: input.organizationId,
    recordId: input.resumeRecordId,
    summaryText: `已在本对话中将该候选人关联到「${nextJobDescription.name}」（仅影响本轮分析，未改招聘台数据）。`,
  });
  const confirmation = await stampProposalConfirmation(
    {
      conversationId: input.conversationId,
      jobDescriptionId: input.jobDescriptionId,
      jobDescriptionName: nextJobDescription.name,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      status: "confirmed",
    },
    dependencies,
  );
  if (result.status === "noop") {
    return {
      actionType: "bind_candidate_to_job",
      confirmation,
      message: "本对话已将该候选人关联到该岗位（仅影响本轮分析，未改招聘台数据）。",
      status: "noop",
    };
  }
  return {
    actionType: "bind_candidate_to_job",
    confirmation,
    message: "已在本对话中将该候选人关联到所选岗位（仅影响本轮分析，未改招聘台数据）。",
    status: "executed",
  };
}

async function confirmBindPoolItemToJob(
  input: {
    conversationId: string;
    jobDescriptionId: string;
    organizationId: string;
    poolItemId: string;
    proposalId: string;
    visibilityScope: RecruitingVisibilityScope;
  },
  dependencies: RecruitingActionDependencies,
): Promise<ConfirmRecruitingActionResult> {
  const poolItemId = normalizeResumePoolItemId(input.poolItemId);
  const nextJobDescription = await dependencies.loadJobDescription(
    input.organizationId,
    input.jobDescriptionId,
  );
  if (!nextJobDescription) {
    return { message: "岗位不存在或不属于当前 workspace。", status: "failed" };
  }

  const existing = await dependencies.loadPoolItem({
    organizationId: input.organizationId,
    poolItemId,
    visibilityScope: input.visibilityScope,
  });
  if (!existing) {
    return { message: "人才库记录不存在或无权访问。", status: "failed" };
  }

  const result = await dependencies.upsertBinding({
    conversationId: input.conversationId,
    jobDescriptionId: input.jobDescriptionId,
    jobDescriptionName: nextJobDescription.name,
    kind: "resume_pool_item",
    organizationId: input.organizationId,
    recordId: poolItemId,
    summaryText: `已在本对话中将该人才库条目关联到「${nextJobDescription.name}」（仅影响本轮分析，未改人才库数据）。`,
  });
  const confirmation = await stampProposalConfirmation(
    {
      conversationId: input.conversationId,
      jobDescriptionId: input.jobDescriptionId,
      jobDescriptionName: nextJobDescription.name,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      status: "confirmed",
    },
    dependencies,
  );
  if (result.status === "noop") {
    return {
      actionType: "bind_pool_item_to_job",
      confirmation,
      message: "本对话已将该人才库条目关联到该岗位（仅影响本轮分析，未改人才库数据）。",
      status: "noop",
    };
  }
  return {
    actionType: "bind_pool_item_to_job",
    confirmation,
    message: "已在本对话中将该人才库条目关联到所选岗位（仅影响本轮分析，未改人才库数据）。",
    status: "executed",
  };
}

async function ignoreRecruitingAction(
  input: {
    conversationId: string;
    organizationId: string;
    proposal: ConfirmRecruitingActionInput["proposal"];
  },
  dependencies: RecruitingActionDependencies,
): Promise<ConfirmRecruitingActionResult> {
  const confirmation = await stampProposalConfirmation(
    {
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      proposalId: input.proposal.id,
      status: "ignored",
    },
    dependencies,
  );
  return {
    actionType: input.proposal.type,
    confirmation,
    message: "已忽略该动作建议。",
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

export function confirmRecruitingAction(
  input: {
    authorize: WorkspaceAuthorizer;
    conversationId: string;
    decision?: ConfirmRecruitingActionInput["decision"];
    operatorId: string | null;
    organizationId: string;
    proposal: ConfirmRecruitingActionInput["proposal"];
    visibilityScope: RecruitingVisibilityScope;
  },
  dependencies: RecruitingActionDependencies = defaultDependencies,
) {
  if (input.decision === "ignore") {
    return ignoreRecruitingAction(
      {
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        proposal: input.proposal,
      },
      dependencies,
    );
  }
  if (input.proposal.type === "bind_candidate_to_job") {
    const jobDescriptionId = input.proposal.payload.jobDescriptionId ?? null;
    if (!jobDescriptionId) {
      return { message: "请先选择要绑定的岗位。", status: "failed" };
    }
    return confirmBindCandidateToJob(
      {
        conversationId: input.conversationId,
        jobDescriptionId,
        organizationId: input.organizationId,
        proposalId: input.proposal.id,
        resumeRecordId: input.proposal.payload.resumeRecordId,
      },
      dependencies,
    );
  }
  if (input.proposal.type === "bind_pool_item_to_job") {
    const jobDescriptionId = input.proposal.payload.jobDescriptionId ?? null;
    if (!jobDescriptionId) {
      return { message: "请先选择要绑定的岗位。", status: "failed" };
    }
    return confirmBindPoolItemToJob(
      {
        conversationId: input.conversationId,
        jobDescriptionId,
        organizationId: input.organizationId,
        poolItemId: input.proposal.payload.poolItemId,
        proposalId: input.proposal.id,
        visibilityScope: input.visibilityScope,
      },
      dependencies,
    );
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
