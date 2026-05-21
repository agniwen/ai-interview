"use client";

/* oxlint-disable no-use-before-define -- helper defined below the export */
// 候选人详情顶部「下一步操作」action bar。
// 按候选人当前 pipelineStage + outcome 决定显示哪些按钮。所有写动作都是
// 一句话调用上层传入的 callback（页面层负责弹 dialog 或调 transition API）。
//
// Stage-aware "next action" bar for the candidate detail view. Each button
// fires a callback supplied by the parent (resume library page); this
// component is presentation-only and stateless.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleSlashIcon,
  RotateCcwIcon,
  SendIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { candidateOutcomeMeta, pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { CandidateOutcome, PipelineStage } from "@arc/db-schema/studio-interviews";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const buttons = getStageButtons({
    aiInterviewDone,
    humanInterviewDone,
    onAdvance,
    onRequestClose,
    onRequestReactivate,
    pipelineStage,
  });

  if (buttons.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">当前阶段：</span>
        <Badge variant={pipelineStageMeta[pipelineStage].tone}>
          {pipelineStageMeta[pipelineStage].label}
        </Badge>
        {outcome === "in_pipeline" ? null : (
          <Badge variant={candidateOutcomeMeta[outcome].tone}>
            {candidateOutcomeMeta[outcome].label}
          </Badge>
        )}
      </div>
      <div className="ml-auto flex flex-wrap gap-2">{buttons}</div>
    </div>
  );
}

interface StageButton {
  key: string;
  node: ReactNode;
}

function getStageButtons(props: {
  pipelineStage: PipelineStage;
  aiInterviewDone?: boolean;
  humanInterviewDone?: boolean;
  onAdvance: (target: PipelineStage) => void;
  onRequestClose: () => void;
  onRequestReactivate: () => void;
}): ReactNode[] {
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
    return [
      <Button key="reactivate" onClick={onRequestReactivate} size="sm" variant="outline">
        <RotateCcwIcon className="size-4" />
        重新激活
      </Button>,
    ];
  }

  // 所有非 closed 阶段都能直接结案。
  // Every non-closed stage can be closed.
  const closeBtn: ReactNode = (
    <Button key="close" onClick={onRequestClose} size="sm" variant="outline">
      <CircleSlashIcon className="size-4" />
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
            <UsersIcon className="size-4" />
            安排真人复面
          </Button>
        ),
      });
      buttons.push({
        key: "to-offer",
        node: (
          <Button key="to-offer" onClick={() => onAdvance("offer")} size="sm" variant="outline">
            <SendIcon className="size-4" />
            直接发 Offer
          </Button>
        ),
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
              <UsersIcon className="size-4" />
              安排真人复面
            </Button>
          ),
        });
        buttons.push({
          key: "to-offer",
          node: (
            <Button key="to-offer" onClick={() => onAdvance("offer")} size="sm" variant="outline">
              <SendIcon className="size-4" />
              直接发 Offer
            </Button>
          ),
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
              <UsersIcon className="size-4" />
              跳到真人复面
            </Button>
          ),
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
            <ArrowRightIcon className="size-4" />
            {humanInterviewDone ? "推进到 Offer" : "跳到 Offer"}
          </Button>
        ),
      });
      buttons.push({
        key: "back-ai",
        node: (
          <Button key="back-ai" onClick={() => onAdvance("ai_interview")} size="sm" variant="ghost">
            <ArrowLeftIcon className="size-4" />
            退回 AI 面试
          </Button>
        ),
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
            <ArrowLeftIcon className="size-4" />
            退回真人复面
          </Button>
        ),
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
            <ArrowRightIcon className="size-4" />
            推进到 AI 面试
          </Button>
        ),
      });
      break;
    }

    default: {
      break;
    }
  }

  return [...buttons.map((b) => b.node), closeBtn];
}
