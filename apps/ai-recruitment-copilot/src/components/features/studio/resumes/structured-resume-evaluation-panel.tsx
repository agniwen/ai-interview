"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { StructuredResumeGateStatus } from "@arc/db-schema/structured-resume-evaluation";
import type { StructuredResumeRuleId } from "@arc/shared/structured-resume-scoring";
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

const DEDUCTION_RULE_LABELS: Record<StructuredResumeRuleId, string> = {
  "education.below_tier": "学历低于门槛",
  "education.major_unrelated": "专业与岗位无关",
  "experience.fragmented": "相关经历碎片化",
  "experience.industry_unrelated": "行业完全不相关",
  "experience.missing_year": "经验年限不足",
  "potential.illogical_switches": "职业方向频繁变化",
  "potential.no_growth_two_years": "近两年缺少成长记录",
  "potential.unexplained_gap_over_six_months": "长期空档缺少解释",
  "project.edge_participation": "仅边缘参与项目",
  "project.no_relevant_project": "无相关项目",
  "project.old_relevant_project": "相关项目距今较久",
  "project.scale_low": "项目规模或复杂度不足",
  "skill.missing_auxiliary": "缺少辅助技能",
  "skill.missing_core": "缺少核心技能",
  "skill.no_related_skill": "无岗位相关技能",
  "skill.shallow": "技能仅停留在浅层了解",
  "stability.frequent_unrelated_industries": "频繁跨无关行业",
  "stability.gap_over_six_months": "空档超过六个月",
  "stability.gap_three_to_six_months": "空档三至六个月",
  "stability.short_tenure": "存在短期任职",
  "stability.three_changes_one_year": "一年内变动三次及以上",
  "stability.two_changes_one_year": "一年内变动两次",
  "stability.two_changes_two_years": "两年内变动两次",
};

type StructuredDimensionKey = (typeof STRUCTURED_RESUME_DIMENSIONS)[number];
type StructuredEvaluation = NonNullable<ResumeLibraryDetail["structuredResumeEvaluation"]>;
type StructuredDimensionResult = StructuredEvaluation["dimensions"][StructuredDimensionKey];

function deductionRuleLabel(ruleId: string) {
  return DEDUCTION_RULE_LABELS[ruleId as StructuredResumeRuleId] ?? ruleId;
}

function uniqueEvidence<T extends { quote: string; source: string }>(evidence: T[]) {
  return [...new Map(evidence.map((item) => [`${item.source}:${item.quote}`, item])).values()];
}

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

interface StructuredDimensionDisplay {
  contribution: number;
  deductionTotal: number;
  deductions: StructuredDimensionResult["appliedDeductions"];
  insufficientEvidence: StructuredDimensionResult["ruleJudgments"];
  key: StructuredDimensionKey;
  label: string;
  score: number;
  weight: number;
}

function StructuredDimensionScore({ dimension }: { dimension: StructuredDimensionDisplay }) {
  const hasDeductions = dimension.deductions.length > 0;
  const hasInsufficientEvidence = dimension.insufficientEvidence.length > 0;
  return (
    <div
      className={cn("min-w-0", dimension.weight === 0 && "text-muted-foreground")}
      data-structured-dimension-score={dimension.key}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm leading-6">{dimension.label}</div>
          <div className="mt-0.5 text-muted-foreground text-xs">
            权重 {dimension.weight}% · 贡献 {dimension.weight === 0 ? 0 : dimension.contribution} 分
          </div>
        </div>
        <div className="font-semibold text-xl tabular-nums leading-none">{dimension.score}</div>
      </div>
      {hasDeductions || hasInsufficientEvidence ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-sm">标准化扣分明细</div>
            {dimension.deductionTotal > 0 ? (
              <div className="text-muted-foreground text-xs">
                合计扣分 {dimension.deductionTotal} 分
              </div>
            ) : null}
          </div>
          {dimension.deductions.map((deduction) => (
            <div
              className="rounded-md border border-border/60 bg-muted/20 p-3"
              key={deduction.ruleId}
            >
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="font-medium">{deductionRuleLabel(deduction.ruleId)}</span>
                <span className="shrink-0 font-semibold text-destructive tabular-nums">
                  {deduction.appliedPoints > 0 ? `-${deduction.appliedPoints} 分` : "直接记 0 分"}
                </span>
              </div>
              <p className="mt-1.5 text-muted-foreground text-xs leading-5">{deduction.reason}</p>
              {uniqueEvidence(deduction.evidence).map((evidence) => (
                <blockquote
                  className="mt-2 border-l-2 pl-2 text-muted-foreground text-xs leading-5"
                  key={`${evidence.source}-${evidence.quote}`}
                >
                  {evidence.quote}
                </blockquote>
              ))}
            </div>
          ))}
          {dimension.insufficientEvidence.map((judgment) => (
            <div
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3"
              key={`insufficient-${judgment.ruleId}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{deductionRuleLabel(judgment.ruleId)}</span>
                <Badge variant="warning">证据不足</Badge>
              </div>
              <p className="mt-1.5 text-muted-foreground text-xs leading-5">{judgment.reason}</p>
              {uniqueEvidence(judgment.evidence).map((evidence) => (
                <blockquote
                  className="mt-2 border-l-2 pl-2 text-muted-foreground text-xs leading-5"
                  key={`${evidence.source}-${evidence.quote}`}
                >
                  {evidence.quote}
                </blockquote>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground text-sm leading-6">本维度未触发标准化扣分</p>
      )}
    </div>
  );
}

function StructuredDimensionGroup({ dimensions }: { dimensions: StructuredDimensionDisplay[] }) {
  return (
    <FramePanel className="space-y-4" data-structured-dimension-group>
      {dimensions.map((dimension, index) => (
        <div className={cn(index > 0 && "border-border/50 border-t pt-4")} key={dimension.key}>
          <StructuredDimensionScore dimension={dimension} />
        </div>
      ))}
    </FramePanel>
  );
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

  const dimensions = STRUCTURED_RESUME_DIMENSIONS.map((key) => {
    const result = evaluation.dimensions[key];
    return {
      contribution: Math.round(result.weightedContributionHundredths / 100),
      deductionTotal: result.deductionTotal,
      deductions: result.appliedDeductions,
      insufficientEvidence: result.ruleJudgments.filter(
        (judgment) => judgment.status === "insufficient_evidence",
      ),
      key,
      label: DIMENSION_LABELS[key],
      score: result.rawScore,
      weight: result.weight,
    };
  });
  const evaluationRunId = evaluation.runId;
  const dimensionGroups = [dimensions.slice(0, 2), dimensions.slice(2, 4), dimensions.slice(4, 6)];
  const hrLabel = hrStatusLabel(detail.resumeEvaluationStatus);
  const isPriorRun =
    Boolean(evaluation.runId) &&
    Boolean(detail.resumeReviewRunId) &&
    evaluationRunId !== detail.resumeReviewRunId;
  const canCorrectCurrentRun =
    canEdit &&
    Boolean(slug) &&
    detail.resumeReviewStatus === "ready" &&
    detail.resumeReviewRunId === evaluationRunId;
  let retainedResultNotice: string | null = null;
  if (isPriorRun && detail.resumeReviewStatus === "failed") {
    retainedResultNotice = `${detail.resumeReviewError || "评估失败"} 当前展示上一次已完成的评估结果。`;
  } else if (
    isPriorRun &&
    (detail.resumeReviewStatus === "processing" || detail.resumeReviewStatus === "queued")
  ) {
    retainedResultNotice = "正在重新评估，当前展示上一次已完成的评估结果。";
  }

  async function updateGate(
    requirementId: string,
    correctedStatus: StructuredResumeGateStatus | null,
  ) {
    if (!(slug && canCorrectCurrentRun)) {
      return;
    }
    setSavingRequirementId(requirementId);
    try {
      await correctStructuredResumeGate(slug, detail.id, requirementId, {
        correctedStatus,
        expectedRunId: evaluationRunId,
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
    <section className="space-y-6">
      {retainedResultNotice ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
          {retainedResultNotice}
        </p>
      ) : null}

      <Frame>
        <FrameHeader>
          <FrameTitle>综合评价</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-start">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">推荐建议</span>
                <Badge variant="outline">{GRADE_LABELS[evaluation.grade]}</Badge>
                <Badge variant={statusVariant(evaluation.gates.effectiveStatus)}>
                  {GATE_LABELS[evaluation.gates.effectiveStatus]}
                </Badge>
                {hrLabel ? (
                  <Badge
                    variant={detail.resumeEvaluationStatus === "pass" ? "success" : "destructive"}
                  >
                    {hrLabel}
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-base leading-7">
                  {evaluation.narrative.summary}
                </h3>
                <p className="text-muted-foreground text-sm leading-6">
                  <span className="font-medium text-foreground">AI 原始结论：</span>
                  {evaluation.narrative.recommendation}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-5 lg:items-end lg:text-right">
              <div
                className="font-semibold text-7xl tabular-nums leading-none tracking-tighter"
                data-structured-composite-score
              >
                {evaluation.calculations.compositeScore}
              </div>
              <div className="-mt-3 text-muted-foreground text-xs">综合评分 / 100</div>
            </div>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader className="justify-between gap-3">
          <FrameTitle>维度评分</FrameTitle>
          <span className="text-muted-foreground text-xs">AI 原始分 0-100</span>
        </FrameHeader>
        <div className="grid gap-1 lg:grid-cols-2">
          <FramePanel className="flex min-w-0 items-center justify-center">
            <ChartContainer
              className="mx-auto aspect-square min-h-[16rem] w-full max-w-[19rem] lg:min-h-[17rem]"
              config={{
                score: { color: "var(--primary)", label: "原始分" },
              }}
            >
              <RadarChart
                data={dimensions}
                margin={{ bottom: 18, left: 18, right: 18, top: 18 }}
                outerRadius="72%"
              >
                <PolarGrid gridType="polygon" />
                <PolarAngleAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
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
          </FramePanel>
          {dimensionGroups.map((group) => (
            <StructuredDimensionGroup
              dimensions={group}
              key={group.map((dimension) => dimension.key).join("-")}
            />
          ))}
        </div>
      </Frame>

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
                {canCorrectCurrentRun ? (
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
                {match.evidence.map((evidence) => (
                  <blockquote
                    className="mt-2 border-l-2 pl-3 text-muted-foreground text-xs"
                    key={`${evidence.source}-${evidence.quote}`}
                  >
                    {evidence.quote}
                  </blockquote>
                ))}
              </div>
            ))}
          </FramePanel>
        </Frame>
      ) : null}
    </section>
  );
}
