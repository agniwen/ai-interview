import type { RecruitingNodeResult, RecruitingNodeStatus } from "@app/db-schema/schema";
import type { PipelineStage } from "@app/db-schema/studio-interviews";

export interface RecruitingHrAction {
  description: string;
  label: string;
}

interface RecruitingHrActionInput {
  nodeResult?: RecruitingNodeResult | null;
  nodeStatus?: RecruitingNodeStatus | null;
  pipelineStage: PipelineStage;
  stageProgress?: {
    aiInterview: {
      activeRound: unknown | null;
      totalRounds: number;
    } | null;
    humanInterview: {
      activeRound: { scheduledAt: string | null } | null;
      byRoundKind?: Partial<
        Record<
          "second_interview" | "final_interview",
          {
            activeRound: { scheduledAt: string | null } | null;
            completedRoundsMissingFeedback: number;
            totalRounds: number;
          } | null
        >
      >;
      completedRoundsMissingFeedback: number;
      totalRounds: number;
    } | null;
    offer: {
      latestDraft: { status: string } | null;
    } | null;
  };
}

type ActivePipelineStage = Exclude<PipelineStage, "closed">;
type ActiveHrActionInput = Omit<RecruitingHrActionInput, "pipelineStage"> & {
  nodeStatus: RecruitingNodeStatus;
};

const PASSED_NODE_ACTIONS = {
  ai_interview: {
    description: "AI 初面已确认通过，请将候选人推进到复试。",
    label: "推进复试",
  },
  background_check: {
    description: "背调已通过，请将候选人推进到入职办理。",
    label: "推进入职",
  },
  final_interview: {
    description: "终试已确认通过，请将候选人推进到流水提供。",
    label: "推进流水",
  },
  income_proof: {
    description: "薪资流水已确认，请将候选人推进到谈薪发 Offer。",
    label: "推进谈薪",
  },
  offer: {
    description: "候选人已接受 Offer，请将候选人推进到背调。",
    label: "推进背调",
  },
  onboarding: {
    description: "入职办理已完成，请确认候选人已入职并结束流程。",
    label: "确认入职",
  },
  screening: {
    description: "简历筛选已通过，请选择 AI 初面或复试并推进流程。",
    label: "推进面试",
  },
  second_interview: {
    description: "复试已确认通过，请将候选人推进到终试。",
    label: "推进终试",
  },
} as const satisfies Record<Exclude<PipelineStage, "closed">, RecruitingHrAction>;

function isOneOfStatuses(status: RecruitingNodeStatus, statuses: RecruitingNodeStatus[]): boolean {
  return statuses.includes(status);
}

function getScreeningAction(status: RecruitingNodeStatus): RecruitingHrAction | null {
  return isOneOfStatuses(status, ["pending", "awaiting_review"])
    ? {
        description: "请确认候选人是否通过简历筛选，并选择后续面试流程或结束招聘。",
        label: "筛选简历",
      }
    : null;
}

function getAiInterviewAction(input: ActiveHrActionInput): RecruitingHrAction | null {
  const progress = input.stageProgress?.aiInterview;
  if (progress?.activeRound) {
    return null;
  }
  if (progress && progress.totalRounds > 0) {
    return {
      description: "AI 初面已完成，请审核面试结果并确认通过或淘汰。",
      label: "审核 AI 结果",
    };
  }
  const { nodeStatus: status } = input;
  if (status === "pending") {
    return {
      description: "候选人已进入 AI 初面阶段，请发起 AI 面试。",
      label: "发起 AI 初面",
    };
  }
  return status === "awaiting_review"
    ? {
        description: "AI 初面已完成，请审核面试结果并确认通过或淘汰。",
        label: "审核 AI 结果",
      }
    : null;
}

function getHumanInterviewAction(
  input: ActiveHrActionInput,
  stageLabel: "复试" | "终试",
  roundKind: "second_interview" | "final_interview",
): RecruitingHrAction | null {
  const aggregate = input.stageProgress?.humanInterview;
  const stageProgress = aggregate?.byRoundKind;
  const progress =
    stageProgress && Object.hasOwn(stageProgress, roundKind)
      ? (stageProgress[roundKind] ?? null)
      : aggregate;
  if (progress?.activeRound?.scheduledAt) {
    return null;
  }
  if (progress?.activeRound) {
    return {
      description: `候选人已进入${stageLabel}阶段，请安排面试。`,
      label: `安排${stageLabel}`,
    };
  }
  if (progress && progress.totalRounds > 0 && !progress.activeRound) {
    return progress.completedRoundsMissingFeedback > 0
      ? null
      : {
          description: `${stageLabel}已完成，请审核面试结果并确认通过或淘汰。`,
          label: `审核${stageLabel}结果`,
        };
  }
  const { nodeStatus: status } = input;
  if (status === "pending") {
    return {
      description: `候选人已进入${stageLabel}阶段，请安排面试。`,
      label: `安排${stageLabel}`,
    };
  }
  return status === "awaiting_review"
    ? {
        description: `${stageLabel}已完成，请审核面试结果并确认通过或淘汰。`,
        label: `审核${stageLabel}结果`,
      }
    : null;
}

function getMaterialAction(
  status: RecruitingNodeStatus,
  action: RecruitingHrAction,
): RecruitingHrAction | null {
  return isOneOfStatuses(status, ["pending", "in_progress", "awaiting_review"]) ? action : null;
}

function getOfferAction(input: ActiveHrActionInput): RecruitingHrAction | null {
  const draftStatus = input.stageProgress?.offer?.latestDraft?.status;
  if (draftStatus === "sent") {
    return null;
  }
  if (draftStatus === "accepted") {
    return PASSED_NODE_ACTIONS.offer;
  }
  if (draftStatus === "draft") {
    return {
      description: "Offer 已准备好，请发送给候选人。",
      label: "发送 Offer",
    };
  }
  const { nodeStatus: status } = input;
  if (status === "awaiting_send") {
    return {
      description: "Offer 已准备好，请发送给候选人。",
      label: "发送 Offer",
    };
  }
  return isOneOfStatuses(status, ["pending", "negotiating"])
    ? {
        description: "请继续与候选人确认薪资和 Offer 条件，并更新协商结果。",
        label: "处理谈薪",
      }
    : null;
}

const HR_ACTION_RESOLVERS = {
  ai_interview: getAiInterviewAction,
  background_check: ({ nodeStatus }: ActiveHrActionInput) =>
    getMaterialAction(nodeStatus, {
      description: "请发起或跟进候选人背调，并在完成后确认结果。",
      label: "跟进背调",
    }),
  final_interview: (input: ActiveHrActionInput) =>
    getHumanInterviewAction(input, "终试", "final_interview"),
  income_proof: ({ nodeStatus }: ActiveHrActionInput) =>
    getMaterialAction(nodeStatus, {
      description: "请跟进候选人提供薪资流水，并在核验后确认结果。",
      label: "跟进流水",
    }),
  offer: getOfferAction,
  onboarding: ({ nodeStatus }: ActiveHrActionInput) =>
    getMaterialAction(nodeStatus, {
      description: "请跟进入职材料和到岗情况，并确认最终入职结果。",
      label: "办理入职",
    }),
  screening: ({ nodeStatus }: ActiveHrActionInput) => getScreeningAction(nodeStatus),
  second_interview: (input: ActiveHrActionInput) =>
    getHumanInterviewAction(input, "复试", "second_interview"),
} satisfies Record<ActivePipelineStage, (input: ActiveHrActionInput) => RecruitingHrAction | null>;

/**
 * 根据当前招聘节点推导是否存在明确的 HR 作业。这个值不落库，避免与流程状态形成双份事实。
 */
export function getRecruitingHrAction({
  nodeResult,
  nodeStatus,
  pipelineStage,
  stageProgress,
}: RecruitingHrActionInput): RecruitingHrAction | null {
  if (pipelineStage === "closed" || !nodeStatus) {
    return null;
  }
  if (nodeStatus === "completed" && nodeResult === "pass") {
    return PASSED_NODE_ACTIONS[pipelineStage];
  }
  return HR_ACTION_RESOLVERS[pipelineStage]({ nodeResult, nodeStatus, stageProgress });
}

export function requiresRecruitingHrAction(input: RecruitingHrActionInput): boolean {
  return getRecruitingHrAction(input) !== null;
}
