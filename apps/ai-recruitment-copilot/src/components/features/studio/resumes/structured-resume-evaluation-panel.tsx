"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { StructuredResumeGateStatus } from "@arc/db-schema/structured-resume-evaluation";
import { STRUCTURED_RESUME_DIMENSIONS } from "@arc/shared/structured-resume-scoring";
import { cn } from "@arc/shared/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { correctStructuredResumeGate } from "@/lib/client/api/endpoints/studio-resumes";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";

const DIMENSION_LABELS = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
} as const;

const GATE_LABELS: Record<StructuredResumeGateStatus, string> = {
  failed: "未通过门槛",
  needs_verification: "门槛待核实",
  passed: "门槛通过",
};

const GRADE_LABELS = {
  matched: "匹配",
  recommended: "推荐",
  unmatched: "不匹配",
} as const;

function statusVariant(status: StructuredResumeGateStatus) {
  if (status === "failed") {
    return "destructive" as const;
  }
  if (status === "needs_verification") {
    return "warning" as const;
  }
  return "success" as const;
}

function hrStatusLabel(status: ResumeLibraryDetail["resumeEvaluationStatus"]) {
  if (status === "pass") {
    return "HR 已通过";
  }
  if (status === "fail") {
    return "HR 未通过";
  }
  return null;
}

export function StructuredResumeEvaluationPanel({
  canEdit,
  detail,
  onUpdated,
  slug,
}: {
  canEdit: boolean;
  detail: ResumeLibraryDetail;
  onUpdated?: () => void;
  slug?: string;
}) {
  const evaluation = detail.structuredResumeEvaluation;
  const [savingRequirementId, setSavingRequirementId] = useState<string | null>(null);
  if (!evaluation) {
    return (
      <section className="space-y-2">
        <h3 className="font-medium text-sm">AI 结构化评估</h3>
        <p className="text-muted-foreground text-sm">
          {detail.resumeReviewStatus === "failed"
            ? detail.resumeReviewError || "评估失败"
            : "评估尚未完成"}
        </p>
      </section>
    );
  }

  const dimensions = STRUCTURED_RESUME_DIMENSIONS.map((key) => ({
    contribution: Math.round(evaluation.dimensions[key].weightedContributionHundredths / 100),
    key,
    label: DIMENSION_LABELS[key],
    score: evaluation.dimensions[key].rawScore,
    weight: evaluation.dimensions[key].weight,
  }));
  const hrLabel = hrStatusLabel(detail.resumeEvaluationStatus);

  async function updateGate(
    requirementId: string,
    correctedStatus: StructuredResumeGateStatus | null,
  ) {
    if (!(slug && detail.resumeReviewRunId)) {
      return;
    }
    setSavingRequirementId(requirementId);
    try {
      await correctStructuredResumeGate(slug, detail.id, requirementId, {
        correctedStatus,
        expectedRunId: detail.resumeReviewRunId,
      });
      toast.success("门槛核实结果已更新");
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新门槛核实结果失败");
    } finally {
      setSavingRequirementId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-sm">AI 结构化评估</h3>
        {hrLabel ? (
          <Badge variant={detail.resumeEvaluationStatus === "pass" ? "success" : "destructive"}>
            {hrLabel}
          </Badge>
        ) : null}
        <Badge variant={statusVariant(evaluation.gates.effectiveStatus)}>
          {GATE_LABELS[evaluation.gates.effectiveStatus]}
        </Badge>
        <Badge variant="outline">
          {GRADE_LABELS[evaluation.grade]} · {evaluation.calculations.compositeScore} 分
        </Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <ChartContainer
          className="mx-auto aspect-square min-h-[12rem] w-full max-w-[15rem]"
          config={{
            score: { color: "var(--primary)", label: "原始分" },
          }}
        >
          <RadarChart data={dimensions} outerRadius="70%">
            <PolarGrid gridType="polygon" />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <PolarRadiusAxis angle={90} axisLine={false} domain={[0, 100]} tick={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const point = item.payload as (typeof dimensions)[number] | undefined;
                    return point
                      ? `${point.label} ${String(value)} 分 · 权重 ${point.weight}% · 贡献 ${point.contribution} 分`
                      : String(value);
                  }}
                  hideLabel
                />
              }
            />
            <Radar
              dataKey="score"
              dot={{ fill: "var(--color-score)", r: 3 }}
              fill="var(--color-score)"
              fillOpacity={0.22}
              stroke="var(--color-score)"
              strokeWidth={2}
            />
          </RadarChart>
        </ChartContainer>
        <div className="space-y-3">
          <div className="font-semibold text-4xl tabular-nums">
            {evaluation.calculations.compositeScore}
          </div>
          <p className="font-medium text-sm">{evaluation.narrative.summary}</p>
          <p className="text-muted-foreground text-sm leading-6">
            <span className="font-medium text-foreground">AI 原始结论：</span>
            {evaluation.narrative.recommendation}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dimensions.map((dimension) => (
          <div
            className={cn(
              "rounded-lg border p-3",
              dimension.weight === 0 && "bg-muted/50 text-muted-foreground",
            )}
            key={dimension.key}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-sm">{dimension.label}</span>
              <span className="font-semibold tabular-nums">{dimension.score}</span>
            </div>
            <div className="mt-1 text-xs">
              权重 {dimension.weight}% · 贡献 {dimension.weight === 0 ? 0 : dimension.contribution}{" "}
              分
            </div>
          </div>
        ))}
      </div>

      <Frame>
        <FrameHeader>
          <FrameTitle>硬性门槛</FrameTitle>
        </FrameHeader>
        <FramePanel className="divide-y p-0">
          {evaluation.gates.judgments.map((judgment) => {
            const effectiveStatus = judgment.correction?.correctedStatus ?? judgment.aiStatus;
            return (
              <div className="space-y-3 p-4" key={judgment.requirementId}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{judgment.category}</span>
                  <Badge variant={statusVariant(effectiveStatus)}>
                    {GATE_LABELS[effectiveStatus]}
                  </Badge>
                  {judgment.correction ? <Badge variant="outline">HR 已核实</Badge> : null}
                </div>
                <p className="text-muted-foreground text-sm leading-6">{judgment.reason}</p>
                {judgment.evidence.map((evidence) => (
                  <blockquote
                    className="border-l-2 pl-3 text-muted-foreground text-xs"
                    key={`${evidence.source}-${evidence.quote}`}
                  >
                    {evidence.quote}
                  </blockquote>
                ))}
                {canEdit && slug && detail.resumeReviewRunId ? (
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["passed", "标记通过"],
                        ["failed", "标记未通过"],
                        ["needs_verification", "标记待核实"],
                      ] as const
                    ).map(([status, label]) => (
                      <Button
                        disabled={savingRequirementId === judgment.requirementId}
                        key={status}
                        onClick={() => void updateGate(judgment.requirementId, status)}
                        size="sm"
                        type="button"
                        variant={
                          judgment.correction?.correctedStatus === status ? "secondary" : "outline"
                        }
                      >
                        {label}
                      </Button>
                    ))}
                    {judgment.correction ? (
                      <Button
                        disabled={savingRequirementId === judgment.requirementId}
                        onClick={() => void updateGate(judgment.requirementId, null)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        恢复 AI 判断
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>标准化扣分明细</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-4">
          {STRUCTURED_RESUME_DIMENSIONS.flatMap((dimensionKey) =>
            evaluation.dimensions[dimensionKey].ruleJudgments.map((judgment) => (
              <div
                className="rounded-lg border p-3 text-sm"
                key={`${dimensionKey}-${judgment.ruleId}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {DIMENSION_LABELS[dimensionKey]} · {judgment.ruleId}
                  </span>
                  <Badge variant="outline">{judgment.status}</Badge>
                </div>
                <p className="mt-2 text-muted-foreground">{judgment.reason}</p>
              </div>
            )),
          )}
        </FramePanel>
      </Frame>

      {evaluation.adjustments.matches.length > 0 ? (
        <Frame>
          <FrameHeader>
            <FrameTitle>优先与排除条件</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-3">
            {evaluation.adjustments.matches.map((match) => (
              <div className="rounded-lg border p-3 text-sm" key={match.conditionId}>
                <div className="font-medium">{match.sourceText}</div>
                <div className="mt-1 text-muted-foreground">
                  {match.matched ? `命中 · ${match.appliedPoints} 分` : "未命中"} · {match.reason}
                </div>
              </div>
            ))}
          </FramePanel>
        </Frame>
      ) : null}
    </section>
  );
}
