"use client";

import {
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowRight,
  IconCircleOff,
  IconSend,
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

import type { ReactNode } from "react";
import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@arc/shared/utils";

export interface PipelineStageActionBarProps {
  pipelineStage: PipelineStage;
  primaryAction?: ReactNode;
  showAiInterviewStep?: boolean;
  canManageHumanInterview?: boolean;
  canManageOffer?: boolean;
  // AI 面试是否全部 completed（决定 ai_interview tab 是否显示「待决策」按钮组）。
  // Whether all AI rounds are done; drives the "待决策" CTA group.
  aiInterviewDone?: boolean;
  // 真人复面是否全部 completed。
  // Whether all human interview rounds are done.
  humanInterviewDone?: boolean;
  // 已完成真人复面是否都填写了评价。
  // Whether every completed human interview round has feedback.
  humanInterviewFeedbackComplete?: boolean;
  // 推进到指定阶段的回调（仅 stage 跳变，无元数据）。
  // Advance to a target stage (no metadata).
  onAdvance: (target: PipelineStage) => void;
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
  showAiInterviewStep = true,
  canManageHumanInterview = true,
  canManageOffer = true,
  aiInterviewDone,
  humanInterviewDone,
  humanInterviewFeedbackComplete,
  onAdvance,
  onRequestClose,
  onRequestReactivate,
}: PipelineStageActionBarProps) {
  const actions = getStageActions({
    aiInterviewDone,
    canManageHumanInterview,
    canManageOffer,
    humanInterviewDone,
    humanInterviewFeedbackComplete,
    onAdvance,
    onRequestClose,
    onRequestReactivate,
    pipelineStage,
  });
  const routeSteps = getRouteSteps(pipelineStage, showAiInterviewStep);
  const groupedPrimaryAction = pipelineStage === "closed" ? null : primaryAction;

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-background p-3 shadow-xs">
      <ol
        aria-label={`招聘流程，当前阶段：${pipelineStageMeta[pipelineStage].label}`}
        className="grid list-none overflow-x-auto rounded-xl bg-muted/30 p-2"
        style={{ gridTemplateColumns: `repeat(${routeSteps.length}, minmax(6.5rem, 1fr))` }}
      >
        {routeSteps.map((stage, index) => {
          const isCurrent = stage === pipelineStage;
          const isLast = index === routeSteps.length - 1;
          return (
            <li className="relative flex min-w-[6.5rem] items-center px-1" key={stage}>
              {isLast ? null : (
                <span
                  aria-hidden
                  className="-translate-y-1/2 absolute top-1/2 left-1/2 h-px w-full bg-border"
                />
              )}
              <span
                className={cn(
                  "relative z-10 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium text-xs",
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-background text-muted-foreground ring-1 ring-border/60",
                )}
              >
                <span className="tabular-nums">{index + 1}</span>
                <span className="truncate">{pipelineStageMeta[stage].label}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-end gap-2 border-border border-t pt-2">
        {actions.left.length > 0 ? actions.left : null}
        {groupedPrimaryAction || actions.right.length > 0 ? (
          <ButtonGroup className="flex-wrap justify-end">
            {groupedPrimaryAction}
            {actions.right}
          </ButtonGroup>
        ) : null}
      </div>
    </div>
  );
}

const DEFAULT_ROUTE_STEPS: PipelineStage[] = [
  "screening",
  "ai_interview",
  "human_interview",
  "offer",
  "closed",
];

const DEFAULT_ROUTE_STEPS_WITHOUT_AI: PipelineStage[] = [
  "screening",
  "human_interview",
  "offer",
  "closed",
];

const ROUTE_WITH_WRITTEN_TEST: PipelineStage[] = [
  "screening",
  "written_test",
  "ai_interview",
  "human_interview",
  "offer",
  "closed",
];

function getRouteSteps(
  pipelineStage: PipelineStage,
  showAiInterviewStep: boolean,
): PipelineStage[] {
  if (pipelineStage === "written_test") {
    return ROUTE_WITH_WRITTEN_TEST;
  }
  if (pipelineStage === "ai_interview") {
    return DEFAULT_ROUTE_STEPS;
  }
  return showAiInterviewStep ? DEFAULT_ROUTE_STEPS : DEFAULT_ROUTE_STEPS_WITHOUT_AI;
}

interface StageButton {
  key: string;
  node: ReactNode;
  side: "left" | "right";
}

function getStageActions(props: {
  pipelineStage: PipelineStage;
  aiInterviewDone?: boolean;
  canManageHumanInterview: boolean;
  canManageOffer: boolean;
  humanInterviewFeedbackComplete?: boolean;
  humanInterviewDone?: boolean;
  onAdvance: (target: PipelineStage) => void;
  onRequestClose: () => void;
  onRequestReactivate: () => void;
}): { left: ReactNode[]; right: ReactNode[] } {
  const {
    pipelineStage,
    aiInterviewDone,
    canManageHumanInterview,
    canManageOffer,
    humanInterviewFeedbackComplete,
    humanInterviewDone,
    onAdvance,
    onRequestClose,
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

  // 所有非 closed 阶段都能直接结案。
  // Every non-closed stage can be closed.
  const closeBtn: ReactNode = (
    <Button key="close" onClick={onRequestClose} size="sm" variant="outline">
      <IconCircleOff className="size-4" />
      标记结案
    </Button>
  );

  const buttons: StageButton[] = [];
  const canAdvanceToHumanInterview = canManageHumanInterview;
  const canAdvanceToOffer = canManageOffer;

  switch (pipelineStage) {
    case "screening": {
      // 简历筛选阶段：HR 可以跳过 AI 面试直接安排真人复面 / 发 Offer。
      // Screening: HR may skip ahead to human interview / offer.
      if (canAdvanceToHumanInterview) {
        buttons.push({
          key: "to-human",
          node: (
            <Button key="to-human" onClick={() => onAdvance("human_interview")} size="sm">
              <IconUsers className="size-4" />
              安排真人面试
            </Button>
          ),
          side: "right",
        });
      }
      if (canAdvanceToOffer) {
        buttons.push({
          key: "to-offer",
          node: (
            <Button key="to-offer" onClick={() => onAdvance("offer")} size="sm">
              <IconSend className="size-4" />
              直接发 Offer
            </Button>
          ),
          side: "right",
        });
      }
      break;
    }

    case "ai_interview": {
      // AI 面试全部完成才提示推进；否则只提供「跳过」选项。
      // Once AI interviews are done, surface "推进" CTAs; else only skip options.
      if (aiInterviewDone) {
        if (canAdvanceToHumanInterview) {
          buttons.push({
            key: "to-human",
            node: (
              <Button key="to-human" onClick={() => onAdvance("human_interview")} size="sm">
                <IconUsers className="size-4" />
                安排真人面试
              </Button>
            ),
            side: "right",
          });
        }
        if (canAdvanceToOffer) {
          buttons.push({
            key: "to-offer",
            node: (
              <Button key="to-offer" onClick={() => onAdvance("offer")} size="sm">
                <IconSend className="size-4" />
                直接发 Offer
              </Button>
            ),
            side: "right",
          });
        }
      } else if (canAdvanceToHumanInterview) {
        // 还没跑完时，允许 HR 提前安排复面（跳过场景：技术面已经过、不想等剩下的）。
        // Skip-ahead path while AI interviews are still in flight.
        buttons.push({
          key: "to-human",
          node: (
            <Button
              key="to-human"
              onClick={() => onAdvance("human_interview")}
              size="sm"
              variant="outline"
            >
              <IconUsers className="size-4" />
              安排真人面试
            </Button>
          ),
          side: "right",
        });
      }
      break;
    }

    case "human_interview": {
      // 真人复面阶段：推进到 Offer / 退回 AI 面试（万一 HR 误推进）。
      // Human interview stage: advance to offer, or step back to AI interview.
      if (canAdvanceToOffer) {
        const disabledReason = resolveOfferAdvanceDisabledReason(
          humanInterviewDone,
          humanInterviewFeedbackComplete,
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
      if (canManageHumanInterview) {
        buttons.push({
          key: "back-ai",
          node: (
            <Button
              key="back-ai"
              onClick={() => onAdvance("ai_interview")}
              size="sm"
              variant="outline"
            >
              <IconArrowLeft className="size-4" />
              退回 AI 面试
            </Button>
          ),
          side: "left",
        });
      }
      break;
    }

    case "offer": {
      // Offer 阶段：通常等结案；退回真人复面备用。
      // Offer stage: usually waiting to close; allow stepping back if needed.
      if (canManageHumanInterview) {
        buttons.push({
          key: "back-human",
          node: (
            <Button
              key="back-human"
              onClick={() => onAdvance("human_interview")}
              size="sm"
              variant="ghost"
            >
              <IconArrowLeft className="size-4" />
              退回真人复面
            </Button>
          ),
          side: "left",
        });
      }
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
    left: [
      ...buttons.filter((button) => button.side === "left").map((button) => button.node),
      closeBtn,
    ],
    right: buttons.filter((button) => button.side === "right").map((button) => button.node),
  };
}

function resolveOfferAdvanceDisabledReason(
  humanInterviewDone: boolean | undefined,
  humanInterviewFeedbackComplete: boolean | undefined,
): string | null {
  return humanInterviewDone && humanInterviewFeedbackComplete
    ? null
    : "请先完成所有真人面试轮次，并补全每轮面试评价";
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
  const button = (
    <Button
      aria-disabled={Boolean(disabledReason)}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:active:scale-100"
      key="to-offer"
      onClick={() => {
        if (disabledReason) {
          return;
        }
        onAdvance("offer");
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
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
