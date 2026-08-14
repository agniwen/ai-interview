"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { StructuredResumeGateStatus } from "@arc/db-schema/structured-resume-evaluation";
import { STRUCTURED_RESUME_DIMENSIONS } from "@arc/shared/structured-resume-scoring";
import { cn } from "@arc/shared/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { correctStructuredResumeGate } from "@/lib/client/studio-resumes";

const DIMENSION_LABELS = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
} as const;

const RADAR_DIMENSION_ORDER = [
  "skillMatch",
  "experienceRelevance",
  "stability",
  "educationBackground",
  "potential",
  "projectMatch",
] as const;

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

type StructuredDimensionKey = (typeof STRUCTURED_RESUME_DIMENSIONS)[number];
type StructuredEvaluation = NonNullable<ResumeLibraryDetail["structuredResumeEvaluation"]>;
type StructuredDimensionResult = StructuredEvaluation["dimensions"][StructuredDimensionKey];

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

function gateConclusion(status: StructuredResumeGateStatus): string {
  if (status === "failed") {
    return "硬性门槛未通过";
  }
  if (status === "needs_verification") {
    return "硬性门槛存在待核实项";
  }
  return "硬性门槛通过";
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
  comment: string;
  contribution: number;
  deductionTotal: number;
  key: StructuredDimensionKey;
  label: string;
  score: number;
  weight: number;
}

function describeDeductionPoints(
  deduction: StructuredDimensionResult["appliedDeductions"][number] | undefined,
): string {
  if (!deduction) {
    return "";
  }
  if (deduction.appliedPoints > 0) {
    return `，扣 ${deduction.appliedPoints} 分`;
  }
  return "，本维度直接记 0 分";
}

function trimCommentPunctuation(value: string): string {
  return value.trim().replaceAll(/[。；，、！？!?;,:：]+$/gu, "");
}

function buildDimensionFallback(score: number): string {
  if (score >= 90) {
    return "该维度整体表现优秀。";
  }
  if (score >= 75) {
    return "该维度整体表现较好。";
  }
  if (score >= 60) {
    return "该维度存在一定不足。";
  }
  return "该维度与岗位要求存在明显差距。";
}

function buildDeductionComment(dimension: StructuredDimensionResult): string {
  if (dimension.appliedDeductions.length === 0) {
    return "";
  }
  const deductions = dimension.appliedDeductions.map(
    (deduction) =>
      `${trimCommentPunctuation(deduction.reason)}${describeDeductionPoints(deduction)}`,
  );
  return `扣分说明：${deductions.join("；")}。`;
}

function StructuredRecommendationPanels({
  narrative,
}: {
  narrative: StructuredEvaluation["narrative"];
}) {
  if (!(narrative.levelRecommendation || narrative.teamPositioning)) {
    return null;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {narrative.levelRecommendation ? (
        <Frame>
          <FrameHeader>
            <FrameTitle>职级建议</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-2">
            <p className="font-medium text-base leading-6">{narrative.levelRecommendation.level}</p>
            <p className="text-muted-foreground text-sm leading-6">
              {narrative.levelRecommendation.rationale}
            </p>
          </FramePanel>
        </Frame>
      ) : null}
      {narrative.teamPositioning ? (
        <Frame>
          <FrameHeader>
            <FrameTitle>团队定位</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-2">
            <p className="font-medium text-base leading-6">
              {narrative.teamPositioning.suggestion}
            </p>
            <p className="text-muted-foreground text-sm leading-6">
              {narrative.teamPositioning.rationale}
            </p>
          </FramePanel>
        </Frame>
      ) : null}
    </div>
  );
}

function StructuredDimensionScore({ dimension }: { dimension: StructuredDimensionDisplay }) {
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
      <div className="mt-3 space-y-2">
        <p className="text-muted-foreground text-sm leading-6">{dimension.comment}</p>
        <div className="text-muted-foreground text-xs">
          {dimension.deductionTotal > 0
            ? `本维度合计扣 ${dimension.deductionTotal} 分`
            : "本维度无扣分"}
        </div>
      </div>
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

function EmptyHardGateState({ hasGates }: { hasGates: boolean }) {
  if (hasGates) {
    return null;
  }
  return <p className="p-4 text-muted-foreground text-sm">岗位未配置硬性门槛</p>;
}

export function StructuredResumeEvaluationPanel({
  canEdit,
  detail,
  onUpdated,
  slug,
  summaryAction,
}: {
  canEdit: boolean;
  detail: ResumeLibraryDetail;
  onUpdated?: () => void;
  slug?: string;
  summaryAction?: ReactNode;
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
    const generatedComment = evaluation.narrative.dimensionComments?.[key];
    const overallComment = generatedComment?.trim() || buildDimensionFallback(result.rawScore);
    const deductionComment = buildDeductionComment(result);
    return {
      comment: [overallComment, deductionComment].filter(Boolean).join(" "),
      contribution: Math.round(result.weightedContributionHundredths / 100),
      deductionTotal: result.deductionTotal,
      key,
      label: DIMENSION_LABELS[key],
      score: result.rawScore,
      weight: result.weight,
    };
  });
  const evaluationRunId = evaluation.runId;
  const dimensionByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const radarDimensions = RADAR_DIMENSION_ORDER.map((key) => dimensionByKey.get(key)).filter(
    (dimension): dimension is (typeof dimensions)[number] => dimension !== undefined,
  );
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
        <FrameHeader className="justify-between gap-3">
          <FrameTitle>综合评价</FrameTitle>
          {summaryAction}
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
                  综合评分 {evaluation.calculations.compositeScore} 分，处于“
                  {GRADE_LABELS[evaluation.grade]}”区间；
                  {gateConclusion(evaluation.gates.effectiveStatus)}。
                </h3>
                {evaluation.narrative.overallComment ? (
                  <p className="text-muted-foreground text-sm leading-6">
                    <span className="font-medium text-foreground">整体评语：</span>
                    {evaluation.narrative.overallComment}
                  </p>
                ) : null}
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
            <DimensionRadarChart
              ariaLabel="结构化维度评分雷达图"
              dimensions={radarDimensions}
              tooltipBody={(point) => {
                const weight = typeof point.weight === "number" ? point.weight : "—";
                const contribution =
                  typeof point.contribution === "number" ? point.contribution : "—";
                return (
                  <div className="font-medium text-foreground text-xs">
                    {point.label} {String(point.score ?? "—")} 分 · 权重 {weight}% · 贡献{" "}
                    {contribution} 分
                  </div>
                );
              }}
            />
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
          <EmptyHardGateState hasGates={evaluation.gates.judgments.length > 0} />
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
                {uniqueEvidence(judgment.evidence).map((evidence) => (
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

      <StructuredRecommendationPanels narrative={evaluation.narrative} />

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
                {uniqueEvidence(match.evidence).map((evidence) => (
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
