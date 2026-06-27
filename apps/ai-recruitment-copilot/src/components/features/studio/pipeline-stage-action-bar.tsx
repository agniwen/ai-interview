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
import { candidateOutcomeMeta, pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { CandidateOutcome, PipelineStage } from "@arc/db-schema/studio-interviews";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";

export interface PipelineStageActionBarProps {
  pipelineStage: PipelineStage;
  outcome: CandidateOutcome;
  // AI 面试是否全部 completed（决定 ai_interview tab 是否显示「待决策」按钮组）。
  // Whether all AI rounds are done; drives the "待决策" CTA group.
  aiInterviewDone?: boolean;
  // 真人复面是否全部 completed。
  // Whether all human interview rounds are done.
  humanInterviewDone?: boolean;
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
  outcome,
  aiInterviewDone,
  humanInterviewDone,
  onAdvance,
  onRequestClose,
  onRequestReactivate,
}: PipelineStageActionBarProps) {
  const actions = getStageActions({
    aiInterviewDone,
    humanInterviewDone,
    onAdvance,
    onRequestClose,
    onRequestReactivate,
    pipelineStage,
  });
  const routeSteps = getRouteSteps(pipelineStage);
  const currentIndex = routeSteps.indexOf(pipelineStage);
  const nextLabel = getNextStepLabel({
    aiInterviewDone,
    humanInterviewDone,
    outcome,
    pipelineStage,
    routeSteps,
  });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background p-4 shadow-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">招聘流程</span>
          <Badge variant={pipelineStageMeta[pipelineStage].tone}>
            当前：{pipelineStageMeta[pipelineStage].label}
          </Badge>
          {outcome === "in_pipeline" ? null : (
            <Badge variant={candidateOutcomeMeta[outcome].tone}>
              {candidateOutcomeMeta[outcome].label}
            </Badge>
          )}
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs">
          {nextLabel}
        </span>
      </div>

      <ol
        aria-label={`当前阶段：${pipelineStageMeta[pipelineStage].label}。${nextLabel}`}
        className="grid list-none overflow-x-auto rounded-xl bg-muted/30 px-3 py-3"
        style={{ gridTemplateColumns: `repeat(${routeSteps.length}, minmax(5.75rem, 1fr))` }}
      >
        {routeSteps.map((stage, index) => {
          const status = getStepStatus(index, currentIndex, pipelineStage);
          const isLast = index === routeSteps.length - 1;
          return (
            <li
              className="relative flex min-w-[5.75rem] flex-col items-center gap-2 px-1 text-center"
              key={stage}
            >
              {isLast ? null : (
                <span
                  aria-hidden
                  className={cn(
                    "-translate-y-1/2 absolute top-3 left-1/2 h-px w-full",
                    status === "done" || status === "current" ? "bg-primary/70" : "bg-border",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-6 items-center justify-center rounded-full border bg-background text-[11px]",
                  status === "done" && "border-primary bg-primary text-primary-foreground",
                  status === "current" &&
                    "border-primary bg-background text-primary ring-4 ring-primary/10",
                  status === "next" && "border-primary/50 bg-primary/10 text-primary",
                  status === "todo" && "border-border text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate font-medium text-xs",
                    status === "current" ? "text-foreground" : "text-muted-foreground",
                    status === "next" && "text-primary",
                  )}
                >
                  {pipelineStageMeta[stage].label}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{getStepCaption(status)}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-end gap-2 border-border border-t pt-3">
        {actions.left.length > 0 ? actions.left : null}
        {actions.right.length > 0 ? (
          <div className=" flex flex-wrap justify-end gap-2">{actions.right}</div>
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

const ROUTE_WITH_WRITTEN_TEST: PipelineStage[] = [
  "screening",
  "written_test",
  "ai_interview",
  "human_interview",
  "offer",
  "closed",
];

function getRouteSteps(pipelineStage: PipelineStage): PipelineStage[] {
  return pipelineStage === "written_test" ? ROUTE_WITH_WRITTEN_TEST : DEFAULT_ROUTE_STEPS;
}

function getStepStatus(
  index: number,
  currentIndex: number,
  pipelineStage: PipelineStage,
): "done" | "current" | "next" | "todo" {
  if (pipelineStage === "closed") {
    if (index < currentIndex) {
      return "done";
    }
    if (index === currentIndex) {
      return "current";
    }
    return "todo";
  }
  if (index < currentIndex) {
    return "done";
  }
  if (index === currentIndex) {
    return "current";
  }
  return index === currentIndex + 1 ? "next" : "todo";
}

function getStepCaption(status: "done" | "current" | "next" | "todo") {
  if (status === "done") {
    return "已完成";
  }
  if (status === "current") {
    return "当前";
  }
  if (status === "next") {
    return "下一步";
  }
  return "待进行";
}

function getNextStepLabel({
  pipelineStage,
  outcome,
  routeSteps,
  aiInterviewDone,
  humanInterviewDone,
}: {
  pipelineStage: PipelineStage;
  outcome: CandidateOutcome;
  routeSteps: PipelineStage[];
  aiInterviewDone?: boolean;
  humanInterviewDone?: boolean;
}) {
  if (pipelineStage === "closed") {
    return `流程已结束：${candidateOutcomeMeta[outcome].label}`;
  }
  if (pipelineStage === "ai_interview" && !aiInterviewDone) {
    return "接下来：等待候选人完成 AI 面试";
  }
  if (pipelineStage === "human_interview" && !humanInterviewDone) {
    return "接下来：完成真人复面";
  }
  if (pipelineStage === "offer") {
    return "接下来：等待 Offer 回复并结案";
  }

  const currentIndex = routeSteps.indexOf(pipelineStage);
  const next = routeSteps[currentIndex + 1];
  return next ? `接下来：${pipelineStageMeta[next].label}` : "接下来：确认最终结论";
}

interface StageButton {
  key: string;
  node: ReactNode;
  side: "left" | "right";
}

function getStageActions(props: {
  pipelineStage: PipelineStage;
  aiInterviewDone?: boolean;
  humanInterviewDone?: boolean;
  onAdvance: (target: PipelineStage) => void;
  onRequestClose: () => void;
  onRequestReactivate: () => void;
}): { left: ReactNode[]; right: ReactNode[] } {
  const {
    pipelineStage,
    aiInterviewDone,
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

  switch (pipelineStage) {
    case "screening": {
      // 简历筛选阶段：HR 可以跳过 AI 面试直接安排真人复面 / 发 Offer。
      // Screening: HR may skip ahead to human interview / offer.
      buttons.push({
        key: "to-human",
        node: (
          <Button key="to-human" onClick={() => onAdvance("human_interview")} size="sm">
            <IconUsers className="size-4" />
            安排真人复面
          </Button>
        ),
        side: "right",
      });
      buttons.push({
        key: "to-offer",
        node: (
          <Button key="to-offer" onClick={() => onAdvance("offer")} size="sm" variant="outline">
            <IconSend className="size-4" />
            直接发 Offer
          </Button>
        ),
        side: "right",
      });
      break;
    }

    case "ai_interview": {
      // AI 面试全部完成才提示推进；否则只提供「跳过」选项。
      // Once AI interviews are done, surface "推进" CTAs; else only skip options.
      if (aiInterviewDone) {
        buttons.push({
          key: "to-human",
          node: (
            <Button key="to-human" onClick={() => onAdvance("human_interview")} size="sm">
              <IconUsers className="size-4" />
              安排真人复面
            </Button>
          ),
          side: "right",
        });
        buttons.push({
          key: "to-offer",
          node: (
            <Button key="to-offer" onClick={() => onAdvance("offer")} size="sm" variant="outline">
              <IconSend className="size-4" />
              直接发 Offer
            </Button>
          ),
          side: "right",
        });
      } else {
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
              推进到真人复面
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
      buttons.push({
        key: "to-offer",
        node: (
          <Button
            key="to-offer"
            onClick={() => onAdvance("offer")}
            size="sm"
            variant={humanInterviewDone ? "default" : "outline"}
          >
            <IconArrowRight className="size-4" />
            推进到 Offer
          </Button>
        ),
        side: "right",
      });
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
      break;
    }

    case "offer": {
      // Offer 阶段：通常等结案；退回真人复面备用。
      // Offer stage: usually waiting to close; allow stepping back if needed.
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
    right: [
      ...buttons.filter((button) => button.side === "right").map((button) => button.node),
      closeBtn,
    ],
  };
}
