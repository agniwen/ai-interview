"use client";
import {
  useActionFlowCompletion,
  useCandidateActionFlow,
  useCandidateActionDock,
} from "./candidate-action-dock/candidate-action-dock";

import {
  IconArrowBackUp,
  IconArrowRight,
  IconCircleOff,
  IconInfoCircle,
  IconLink,
} from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper defined below the export */
// 候选人详情顶部「下一步操作」action bar。
// 按候选人当前 pipelineStage + outcome 决定显示哪些按钮。所有写动作都是
// 一句话调用上层传入的 callback（页面层负责弹 dialog 或调 transition API）。
//
// Stage-aware "next action" bar for the candidate detail view. Each button
// fires a callback supplied by the parent (resume library page); this
// component is presentation-only and stateless.

import type { ReactNode } from "react";
import { useState } from "react";
import { pipelineStageMeta, recruitingPipelineNodeValues } from "@app/db-schema/studio-interviews";
import type { PipelineStage, ScheduleEntryStatus } from "@app/db-schema/studio-interviews";
import { Badge } from "@/components/ui/badge";
import {
  RecruitingActionBusyContext,
  RecruitingActionButton as Button,
} from "./recruiting-action-button";
import { withCleanup } from "@/lib/client/async-control";
import { ButtonGroup } from "@/components/ui/button-group";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { usePipelineAdvanceConfirmation } from "./candidate-action-dock/pipeline-advance-confirmation";
import { ActionFlowSurface } from "./candidate-action-dock/action-flow-surface";
import { cn } from "@app/shared/utils";
import { copyInterviewLink } from "@/components/features/studio/interviews/interview-link-actions";

export interface PipelineStageActionBarProps {
  pipelineStage: PipelineStage;
  currentNodePassed?: boolean;
  primaryAction?: ReactNode;
  canCreateHumanInterview?: boolean;
  canCreateOffer?: boolean;
  hasJobDescription?: boolean;
  // 真人复面是否全部 completed。
  // Whether all human interview rounds are done.
  humanInterviewDone?: boolean;
  // 已完成真人复面是否都填写了评价。
  // Whether every completed human interview round has feedback.
  humanInterviewFeedbackComplete?: boolean;
  aiRoundReset?: {
    isResetting: boolean;
    onReset: (() => void) | (() => Promise<boolean>);
    roundLabel: string;
    status: ScheduleEntryStatus;
  };
  /** 待开始轮次的面试链接；有值时展示「复制面试链接」及有效期。 */
  aiRoundInterviewLink?: {
    candidateInviteExpiresAt: string | null;
    interviewLink: string;
    status: ScheduleEntryStatus;
  };
  // 推进到指定阶段的回调（仅 stage 跳变，无元数据）。
  // Advance to a target stage (no metadata). May return a Promise so the bar can lock while pending.
  onAdvance: (target: PipelineStage) => void | Promise<void>;
  // 查看当前阶段对应内容；不对应独立 tab 时由上层回到概览。
  // View content for the current stage; parent falls back to overview when no stage tab exists.
  onViewCurrentStage: () => void;
  // 打开「标记结束」dialog。
  // Open the close dialog.
  onRequestClose: () => void;
  // 打开回退对话框：进行中或已结束都可回到已到达节点。
  // Open the reactivate dialog.
  onRequestReactivate: () => void;
}

export function PipelineStageActionBar({
  pipelineStage,
  primaryAction,
  currentNodePassed = false,
  canCreateHumanInterview = true,
  canCreateOffer = true,
  hasJobDescription = true,
  humanInterviewDone,
  humanInterviewFeedbackComplete,
  aiRoundReset,
  aiRoundInterviewLink,
  onAdvance,
  onRequestClose,
  onRequestReactivate,
  onViewCurrentStage,
}: PipelineStageActionBarProps) {
  const dock = useCandidateActionDock();
  const advanceConfirmation = usePipelineAdvanceConfirmation(pipelineStage);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const isBusy = isAdvancing || Boolean(aiRoundReset?.isResetting);
  let busyReason: string | null = null;
  if (isAdvancing) {
    busyReason = "正在推进流程，请稍候";
  }
  if (aiRoundReset?.isResetting) {
    busyReason = "正在重置面试，请稍候";
  }

  async function handleAdvance(target: PipelineStage) {
    if (isBusy) {
      return;
    }
    if (target === "second_interview") {
      dock?.dispatch({ id: "interview-questions", type: "enter" });
    }
    setIsAdvancing(true);
    await withCleanup(
      () => onAdvance(target),
      () => setIsAdvancing(false),
    );
  }

  const actions = getStageActions({
    canCreateHumanInterview,
    canCreateOffer,
    currentNodePassed,
    hasJobDescription,
    humanInterviewDone,
    humanInterviewFeedbackComplete,
    isAdvancing,
    isBusy,
    onAdvance: (target) => {
      if (target === "second_interview") {
        return handleAdvance(target);
      }
      advanceConfirmation.request(target, () => handleAdvance(target));
    },
    onRequestReactivate,
    pipelineStage,
  });
  const groupedPrimaryAction = pipelineStage === "closed" ? null : primaryAction;
  const aiRoundCopyLinkAction =
    pipelineStage === "ai_interview" && aiRoundInterviewLink ? (
      <Button
        disabled={isBusy}
        key="copy-ai-interview-link"
        onClick={async () => {
          await copyInterviewLink(aiRoundInterviewLink);
        }}
        size="sm"
        type="button"
      >
        <IconLink className="size-4" />
        复制面试链接
      </Button>
    ) : null;
  const aiRoundResetAction =
    pipelineStage === "ai_interview" && aiRoundReset ? (
      <AiRoundResetAction {...aiRoundReset} isBusy={isBusy} />
    ) : null;
  const hasPrimaryActions =
    Boolean(groupedPrimaryAction) ||
    Boolean(aiRoundCopyLinkAction) ||
    Boolean(aiRoundResetAction) ||
    actions.right.length > 0;
  const canClose = pipelineStage !== "closed";

  return (
    <div
      aria-busy={isBusy}
      aria-label={`当前招聘阶段：${pipelineStageMeta[pipelineStage].label}`}
      className="flex w-full flex-col items-stretch gap-2 max-md:[&_button]:h-11 max-md:[&_button]:text-sm md:w-auto md:flex-row md:flex-wrap md:items-center md:justify-end"
    >
      {advanceConfirmation.surface}
      <RecruitmentStageHoverCard
        onViewCurrentStage={onViewCurrentStage}
        pipelineStage={pipelineStage}
      />
      <RecruitingActionBusyContext.Provider value={busyReason}>
        <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0 [&>button]:flex-1 md:justify-end md:[&>button]:flex-none">
          {hasPrimaryActions ? (
            <ButtonGroup className="w-full min-w-0 [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-2 md:w-fit md:[&>button]:flex-none md:[&>button]:px-3">
              {groupedPrimaryAction}
              {aiRoundCopyLinkAction}
              {aiRoundResetAction}
              {actions.right}
            </ButtonGroup>
          ) : null}
          {actions.left}
          {canClose ? (
            <Button onClick={onRequestClose} size="sm" type="button" variant="destructive">
              <IconCircleOff className="size-4" />
              标记结束
            </Button>
          ) : null}
        </fieldset>
      </RecruitingActionBusyContext.Provider>
    </div>
  );
}

export function getAiRoundResetBehavior(status: ScheduleEntryStatus) {
  if (status === "pending") {
    return "direct" as const;
  }
  if (status === "completed") {
    return "confirm" as const;
  }
  return "disabled" as const;
}

function AiRoundResetAction({
  isBusy,
  isResetting,
  onReset,
  roundLabel,
  status,
}: NonNullable<PipelineStageActionBarProps["aiRoundReset"]> & { isBusy: boolean }) {
  const { open, setOpen } = useCandidateActionFlow("reset-ai-round");
  const [resetError, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const complete = useActionFlowCompletion("reset-ai-round");
  const behavior = getAiRoundResetBehavior(status);
  const buttonLabel = getAiRoundResetButtonLabel(behavior, isResetting);

  if (behavior === "direct") {
    return (
      <Button isLoading={isResetting} disabled={isBusy} onClick={onReset} size="sm" type="button">
        <IconArrowBackUp />
        {buttonLabel}
      </Button>
    );
  }

  if (behavior === "disabled") {
    return (
      <Button
        disabledReason={
          status === "interrupted" ? "面试已中断，请先结束本轮面试" : "面试进行中，请先结束本轮面试"
        }
        size="sm"
        type="button"
      >
        <IconArrowBackUp />
        重置面试轮次
      </Button>
    );
  }

  return (
    <>
      <Button
        isLoading={isResetting}
        disabled={isBusy}
        size="sm"
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <IconArrowBackUp />
        {buttonLabel}
      </Button>
      <ActionFlowSurface
        flowId="reset-ai-round"
        open={open}
        onOpenChange={setOpen}
        busy={pending || isResetting}
        error={resetError}
        title={`确定重置${roundLabel}？`}
        description="重置后，候选人需要重新完成本轮面试。"
        footer={
          <>
            <Button
              disabled={pending || isResetting}
              onClick={() => setOpen(false)}
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={pending || isResetting}
              isLoading={pending || isResetting}
              variant="destructive"
              onClick={async () => {
                if (pending) {
                  return;
                }
                setPending(true);
                setError(null);
                try {
                  const success = await onReset();
                  if (success === false) {
                    setError("重置失败，请重试");
                  } else {
                    complete("面试轮次已重置");
                    setOpen(false);
                  }
                } catch (error) {
                  setError(error instanceof Error ? error.message : "重置失败，请重试");
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending || isResetting ? "重置中…" : "确认重置"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">请确认已与候选人沟通本次重置。</p>
      </ActionFlowSurface>
    </>
  );
}

function getAiRoundResetButtonLabel(
  behavior: ReturnType<typeof getAiRoundResetBehavior>,
  isResetting: boolean,
): string {
  if (isResetting) {
    return "重置中...";
  }
  return behavior === "direct" ? "重置沟通" : "重置面试轮次";
}

function getHoverFlowSteps(): PipelineStage[] {
  return [...recruitingPipelineNodeValues, "closed"];
}

function RecruitmentStageHoverCard({
  onViewCurrentStage,
  pipelineStage,
}: {
  onViewCurrentStage: () => void;
  pipelineStage: PipelineStage;
}) {
  const flowSteps = getHoverFlowSteps();
  const currentIndex = flowSteps.indexOf(pipelineStage);

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Button
            aria-label={`查看当前阶段：${pipelineStageMeta[pipelineStage].label}`}
            className="h-8 self-start px-3 font-medium"
            onClick={onViewCurrentStage}
            size="sm"
            type="button"
            variant="text"
          >
            <IconInfoCircle className="size-4" />
            当前阶段：{pipelineStageMeta[pipelineStage].label}
          </Button>
        }
      />
      <HoverCardContent align="end" className="w-72 p-4" side="bottom" sideOffset={8}>
        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">完整招聘流程</p>
            <p className="mt-1 text-muted-foreground text-xs">
              当前处于「{pipelineStageMeta[pipelineStage].label}」
            </p>
          </div>
          <ol className="space-y-0">
            {flowSteps.map((stage, index) => {
              const isCurrent = stage === pipelineStage;
              const isDone = currentIndex !== -1 && index < currentIndex;
              const isLast = index === flowSteps.length - 1;

              return (
                <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2" key={stage}>
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-1 size-2.5 rounded-full border",
                        isCurrent && "border-primary bg-primary",
                        isDone && !isCurrent && "border-primary/40 bg-primary/20",
                        !isDone && !isCurrent && "border-border bg-background",
                      )}
                    />
                    {isLast ? null : <span className="mt-1 h-6 w-px bg-border" />}
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {pipelineStageMeta[stage].label}
                      </span>
                      {isCurrent ? <Badge variant="outline">当前</Badge> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

interface StageActionGroups {
  left: ReactNode[];
  right: ReactNode[];
}

function getAdvanceTarget(pipelineStage: Exclude<PipelineStage, "closed">) {
  if (pipelineStage === "screening") {
    return "second_interview";
  }
  return recruitingPipelineNodeValues[recruitingPipelineNodeValues.indexOf(pipelineStage) + 1];
}

function getAdvanceLabel(
  pipelineStage: PipelineStage,
  target: Exclude<PipelineStage, "closed">,
  isAdvancing: boolean,
) {
  if (isAdvancing) {
    return "处理中…";
  }
  if (pipelineStage === "screening") {
    return "直接安排复试";
  }
  if (pipelineStage === "final_interview") {
    return "面试结束，进入 Offer 协商";
  }
  return target === "salary_negotiation" ? "进入谈薪" : `进入${pipelineStageMeta[target].label}`;
}

function getStageActions(props: {
  pipelineStage: PipelineStage;
  currentNodePassed: boolean;
  canCreateHumanInterview: boolean;
  canCreateOffer: boolean;
  hasJobDescription: boolean;
  humanInterviewFeedbackComplete?: boolean;
  humanInterviewDone?: boolean;
  isAdvancing: boolean;
  isBusy: boolean;
  onAdvance: (target: PipelineStage) => void | Promise<void>;
  onRequestReactivate: () => void;
}): StageActionGroups {
  const { pipelineStage, isBusy, isAdvancing, onAdvance } = props;
  const reopen = (
    <Button
      key="reopen"
      disabled={isBusy}
      onClick={props.onRequestReactivate}
      size="sm"
      variant="outline"
    >
      <IconArrowBackUp className="size-4" />
      回到之前节点
    </Button>
  );
  const baseActions = { left: pipelineStage === "screening" ? [] : [reopen], right: [] };
  if (pipelineStage === "closed") {
    return baseActions;
  }
  const target = getAdvanceTarget(pipelineStage);
  if (!target) {
    return baseActions;
  }
  const isHumanTarget = target === "second_interview" || target === "final_interview";
  if (isHumanTarget && !props.canCreateHumanInterview) {
    return baseActions;
  }
  if (
    ["income_proof", "salary_negotiation", "offer", "background_check"].includes(target) &&
    !props.canCreateOffer
  ) {
    return baseActions;
  }
  const allowed =
    pipelineStage === "screening" ||
    pipelineStage === "second_interview" ||
    props.currentNodePassed;
  const advanceLabel = getAdvanceLabel(pipelineStage, target, isAdvancing);
  let disabledReason: string | null = null;
  if (!allowed) {
    disabledReason = `请先完成${pipelineStageMeta[pipelineStage].label}并确认通过`;
  }
  if (isHumanTarget && !props.hasJobDescription) {
    disabledReason = "请先绑定在招岗位";
  }
  if (isBusy) {
    disabledReason = "正在推进流程，请稍候";
  }
  return {
    left: baseActions.left,
    right: [
      <Button
        key="advance"
        isLoading={isAdvancing}
        disabledReason={disabledReason}
        onClick={() => {
          void onAdvance(target);
        }}
        size="sm"
      >
        <IconArrowRight className="size-4" />
        {advanceLabel}
      </Button>,
    ],
  };
}
