"use client";

import type { RecruitingLedgerRecord } from "@app/shared/studio-recruiting-ledger";
import {
  calculateRecruitingPoints,
  recruitingPriorityCoefficients,
} from "@app/shared/studio-recruiting-ledger";
import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const recruitingPriorityMeta = {
  high: {
    coefficient: recruitingPriorityCoefficients.high,
    label: "高优先级",
    variant: "danger" as const,
  },
  low: {
    coefficient: recruitingPriorityCoefficients.low,
    label: "低优先级",
    variant: "outline" as const,
  },
  medium: {
    coefficient: recruitingPriorityCoefficients.medium,
    label: "中优先级",
    variant: "warning" as const,
  },
};

export function recruitingPointsCalculationText({
  hiredCount,
  isHired,
  jobPriority,
  jobWeight,
  points,
}: {
  hiredCount?: number;
  isHired?: boolean;
  jobPriority: RecruitingLedgerRecord["jobPriority"];
  jobWeight: string | null;
  points: number;
}): string {
  const priority = jobPriority ? recruitingPriorityMeta[jobPriority] : null;
  const parsedWeight = Number(jobWeight);
  const validWeight = Number.isFinite(parsedWeight) && parsedWeight > 0;
  if (!(validWeight && priority)) {
    return "缺少岗位权重或优先级，当前积分为 0.0";
  }
  const singlePoints = calculateRecruitingPoints({
    jobPriority,
    jobWeight,
    outcome: "hired",
  });
  const singleFormula = `${parsedWeight} × ${priority.coefficient} = ${singlePoints.toFixed(1)}`;
  if (hiredCount !== undefined) {
    return `${singleFormula}（单人）；${singlePoints.toFixed(1)} × ${hiredCount} 人 = ${points.toFixed(1)}`;
  }
  if (isHired) {
    return singleFormula;
  }
  return `尚未入职，不计分；入职后为 ${singleFormula}`;
}

export function RecruitingPointsTooltip({
  children,
  hiredCount,
  isHired,
  jobPriority,
  jobWeight,
  points,
  trigger,
}: {
  children: ReactNode;
  hiredCount?: number;
  isHired?: boolean;
  jobPriority: RecruitingLedgerRecord["jobPriority"];
  jobWeight: string | null;
  points: number;
  trigger: ReactElement;
}) {
  const priority = jobPriority ? recruitingPriorityMeta[jobPriority] : null;
  const parsedWeight = Number(jobWeight);
  const validWeight = Number.isFinite(parsedWeight) && parsedWeight > 0;
  const calculation = recruitingPointsCalculationText({
    hiredCount,
    isHired,
    jobPriority,
    jobWeight,
    points,
  });
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
      <TooltipContent className="max-w-80" side="top">
        <div className="grid gap-1.5 text-left">
          <div className="font-medium">招聘积分计算</div>
          <div>岗位权重：{validWeight ? parsedWeight : "未设置"}</div>
          <div>
            优先级：{priority ? `${priority.label}（系数 ${priority.coefficient}）` : "未设置"}
          </div>
          {hiredCount === undefined ? (
            <div>计分状态：{isHired ? "已入职" : "未入职"}</div>
          ) : (
            <div>已入职人数：{hiredCount}</div>
          )}
          <div>计算过程：{calculation}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
