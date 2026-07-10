"use client";

import {
  IconArrowBackUp,
  IconArrowRight,
  IconCircleOff,
  IconInfoCircle,
  IconUsers,
} from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper defined below the export */
// 候选人详情顶部「下一步操作」action bar。
// 按候选人当前 pipelineStage + outcome 决定显示哪些按钮。所有写动作都是
// 一句话调用上层传入的 callback（页面层负责弹 dialog 或调 transition API）。
//
// Stage-aware "next action" bar for the candidate detail view. Each button
// fires a callback supplied by the parent (resume library page); this
// component is presentation-only and stateless.

import type { ComponentProps, ReactNode } from "react";
import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CandidatePipelineEvent } from "@arc/shared/candidate-pipeline-machine";
import { canApplyCandidatePipelineEvent } from "@arc/shared/candidate-pipeline-machine";
import { cn } from "@arc/shared/utils";

export interface PipelineStageActionBarProps {
  pipelineStage: PipelineStage;
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
  // 推进到指定阶段的回调（仅 stage 跳变，无元数据）。
  // Advance to a target stage (no metadata).
  onAdvance: (target: PipelineStage) => void;
  // 查看当前阶段对应内容；不对应独立 tab 时由上层回到概览。
  // View content for the current stage; parent falls back to overview when no stage tab exists.
  onViewCurrentStage: () => void;
  // 打开「标记结案」dialog。
  // Open the close dialog.
  onRequestClose: () => void;
  // 打开「重新激活」dialog（仅 pipelineStage='closed' 时使用）。
  // Open the reactivate dialog.
  onRequestReactivate: () => void;
}

export function PipelineStageActionBar({
  pipelineStage,
  primaryAction,
  canCreateHumanInterview = true,
  canCreateOffer = true,
  hasJobDescription = true,
  humanInterviewDone,
  humanInterviewFeedbackComplete,
  onAdvance,
  onRequestClose,
  onRequestReactivate,
  onViewCurrentStage,
}: PipelineStageActionBarProps) {
  const actions = getStageActions({
    canCreateHumanInterview,
    canCreateOffer,
    hasJobDescription,
    humanInterviewDone,
    humanInterviewFeedbackComplete,
    onAdvance,
    onRequestReactivate,
    pipelineStage,
  });
  const groupedPrimaryAction = pipelineStage === "closed" ? null : primaryAction;
  const hasPrimaryActions = Boolean(groupedPrimaryAction) || actions.right.length > 0;
  const canClose = pipelineStage !== "closed";

  return (
    <div
      aria-label={`当前招聘阶段：${pipelineStageMeta[pipelineStage].label}`}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <RecruitmentStageHoverCard
        onViewCurrentStage={onViewCurrentStage}
        pipelineStage={pipelineStage}
      />
      {hasPrimaryActions ? (
        <ButtonGroup className="flex-wrap justify-end">
          {groupedPrimaryAction}
          {actions.right}
        </ButtonGroup>
      ) : null}
      {canClose ? (
        <Button
          className="border-destructive/20 bg-destructive/8 text-destructive shadow-xs/5 hover:border-destructive/30 hover:bg-destructive/12 hover:text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/12 dark:hover:bg-destructive/18"
          onClick={onRequestClose}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconCircleOff className="size-4" />
          标记结案
        </Button>
      ) : null}
    </div>
  );
}

const DEFAULT_FLOW_STEPS: PipelineStage[] = [
  "screening",
  "ai_interview",
  "human_interview",
  "offer",
  "closed",
];

const WRITTEN_TEST_FLOW_STEPS: PipelineStage[] = [
  "screening",
  "written_test",
  "ai_interview",
  "human_interview",
  "offer",
  "closed",
];

function getHoverFlowSteps(pipelineStage: PipelineStage): PipelineStage[] {
  return pipelineStage === "written_test" ? WRITTEN_TEST_FLOW_STEPS : DEFAULT_FLOW_STEPS;
}

function RecruitmentStageHoverCard({
  onViewCurrentStage,
  pipelineStage,
}: {
  onViewCurrentStage: () => void;
  pipelineStage: PipelineStage;
}) {
  const flowSteps = getHoverFlowSteps(pipelineStage);
  const currentIndex = flowSteps.indexOf(pipelineStage);

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Button
            aria-label={`查看当前阶段：${pipelineStageMeta[pipelineStage].label}`}
            className="h-8 px-3 font-medium"
            onClick={onViewCurrentStage}
            size="sm"
            type="button"
            variant="ghost"
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
                      {isCurrent ? (
                        <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                          当前
                        </Badge>
                      ) : null}
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

interface StageButton {
  key: string;
  node: ReactNode;
  side: "left" | "right";
}

function getStageActions(props: {
  pipelineStage: PipelineStage;
  canCreateHumanInterview: boolean;
  canCreateOffer: boolean;
  hasJobDescription: boolean;
  humanInterviewFeedbackComplete?: boolean;
  humanInterviewDone?: boolean;
  onAdvance: (target: PipelineStage) => void;
  onRequestReactivate: () => void;
}): { left: ReactNode[]; right: ReactNode[] } {
  const {
    pipelineStage,
    canCreateHumanInterview,
    canCreateOffer,
    hasJobDescription,
    humanInterviewFeedbackComplete,
    humanInterviewDone,
    onAdvance,
    onRequestReactivate,
  } = props;

  // closed：唯一行动是重新激活。
  // closed → only reactivate is available.
  if (pipelineStage === "closed") {
    return {
      left: [],
      right: [
        <Button key="reactivate" onClick={onRequestReactivate} size="sm" variant="outline">
          <IconArrowBackUp className="size-4" />
          重新激活
        </Button>,
      ],
    };
  }

  const buttons: StageButton[] = [];
  const pipelineSnapshot = {
    humanInterviewReadyForOffer: Boolean(humanInterviewDone && humanInterviewFeedbackComplete),
    stage: pipelineStage,
  };
  const hasEvent = (event: CandidatePipelineEvent) =>
    canApplyCandidatePipelineEvent(pipelineSnapshot, event);

  switch (pipelineStage) {
    case "screening": {
      // 简历筛选阶段：可发起 AI 面试，也可跳过 AI 直接进入真人复面；Offer 必须在真人复面后。
      // Screening: start AI, or skip to human interview. Offer requires human interview first.
      const canAdvanceToHumanInterview = hasEvent({ type: "SKIP_TO_HUMAN_INTERVIEW" });
      if (canAdvanceToHumanInterview && canCreateHumanInterview) {
        buttons.push({
          key: "to-human",
          node: (
            <HumanInterviewAdvanceButton
              disabledReason={resolveHumanInterviewAdvanceDisabledReason(
                hasJobDescription,
                canAdvanceToHumanInterview,
              )}
              key="to-human"
              onAdvance={onAdvance}
            />
          ),
          side: "right",
        });
      }
      break;
    }

    case "ai_interview": {
      // AI 面试阶段只能进入真人复面或结案，不能直接进入 Offer。
      // AI interview can only advance to human interview or close, never directly to offer.
      const canAdvanceToHumanInterview = hasEvent({ type: "ADVANCE_TO_HUMAN_INTERVIEW" });
      if (canAdvanceToHumanInterview && canCreateHumanInterview) {
        // 还没跑完时，允许 HR 提前安排复面（跳过场景：技术面已经过、不想等剩下的）。
        // Skip-ahead path while AI interviews are still in flight.
        buttons.push({
          key: "to-human",
          node: (
            <HumanInterviewAdvanceButton
              disabledReason={resolveHumanInterviewAdvanceDisabledReason(
                hasJobDescription,
                canAdvanceToHumanInterview,
              )}
              key="to-human"
              onAdvance={onAdvance}
            />
          ),
          side: "right",
        });
      }
      break;
    }

    case "human_interview": {
      // 真人复面阶段：只有完成所有轮次并补全评价后才能进入 Offer。
      // Human interview: offer is available only after rounds are complete with feedback.
      if (canCreateOffer) {
        const disabledReason = resolveOfferAdvanceDisabledReason(
          humanInterviewDone,
          humanInterviewFeedbackComplete,
          hasEvent({ type: "ADVANCE_TO_OFFER" }),
        );
        buttons.push({
          key: "to-offer",
          node: (
            <OfferAdvanceButton
              disabledReason={disabledReason}
              humanInterviewDone={humanInterviewDone}
              key="to-offer"
              onAdvance={onAdvance}
            />
          ),
          side: "right",
        });
      }
      break;
    }

    case "offer": {
      // Offer 阶段只等待结案。
      // Offer stage only closes.
      break;
    }

    case "written_test": {
      // 笔试阶段当前 UI 隐藏；但万一被 API 直接置过来了，至少给个出口。
      // Hidden tab currently; allow advance/back so HR isn't stuck.
      buttons.push({
        key: "to-ai",
        node: (
          <Button key="to-ai" onClick={() => onAdvance("ai_interview")} size="sm">
            <IconArrowRight className="size-4" />
            推进到 AI 面试
          </Button>
        ),
        side: "right",
      });
      break;
    }

    default: {
      break;
    }
  }

  return {
    left: buttons.filter((button) => button.side === "left").map((button) => button.node),
    right: buttons.filter((button) => button.side === "right").map((button) => button.node),
  };
}

function resolveHumanInterviewAdvanceDisabledReason(
  hasJobDescription: boolean,
  canAdvanceToHumanInterview: boolean,
): string | null {
  return hasJobDescription && canAdvanceToHumanInterview
    ? null
    : "请先绑定在招岗位后再安排真人面试";
}

function resolveOfferAdvanceDisabledReason(
  humanInterviewDone: boolean | undefined,
  humanInterviewFeedbackComplete: boolean | undefined,
  canAdvanceToOffer: boolean,
): string | null {
  return humanInterviewDone && humanInterviewFeedbackComplete && canAdvanceToOffer
    ? null
    : "请先完成所有真人面试轮次，并补全每轮面试评价";
}

function HumanInterviewAdvanceButton({
  disabledReason,
  onAdvance,
  variant = "default",
}: {
  disabledReason: string | null;
  onAdvance: (target: PipelineStage) => void;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const targetStage: PipelineStage = "human_interview";
  const button = (
    <Button
      aria-disabled={Boolean(disabledReason)}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:active:scale-100"
      key="to-human"
      onClick={() => {
        if (disabledReason) {
          return;
        }
        onAdvance(targetStage);
      }}
      size="sm"
      variant={variant}
    >
      <IconUsers className="size-4" />
      安排真人面试
    </Button>
  );

  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip key="to-human">
      <TooltipTrigger render={button} />
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function OfferAdvanceButton({
  disabledReason,
  humanInterviewDone,
  onAdvance,
}: {
  disabledReason: string | null;
  humanInterviewDone?: boolean;
  onAdvance: (target: PipelineStage) => void;
}) {
  const targetStage: PipelineStage = "offer";
  const button = (
    <Button
      aria-disabled={Boolean(disabledReason)}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:active:scale-100"
      key="to-offer"
      onClick={() => {
        if (disabledReason) {
          return;
        }
        onAdvance(targetStage);
      }}
      size="sm"
      variant={humanInterviewDone ? "default" : "outline"}
    >
      <IconArrowRight className="size-4" />
      推进到 Offer
    </Button>
  );

  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip key="to-offer">
      <TooltipTrigger render={button} />
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
