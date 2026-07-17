"use client";

/* oxlint-disable complexity, max-lines -- overview panel hosts review summary + identity edit form. */

// 招聘台的「概览」面板：简历评价 + 结构化简历经历。
// 详情弹窗 resume 模式与「发起 AI 面试」弹窗共用，避免布局漂移。
//
// Resume-library overview panel — notes + structured resume experience. Shared
// between the resume-mode detail dialog and the launch-interview dialog so the
// same data renders the same way in both places.

import { canEditResumeRecord, describeResumeEvaluationStatus } from "@arc/shared/studio-resumes";
import type { ResumeIdentityUpdateInput, ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import {
  countResumeReviewBiasCategories,
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  RESUME_REVIEW_DIMENSIONS,
  resumeReviewActionLabel,
  resumeReviewBiasCategoryLabel,
} from "@arc/shared/resume-review";
import type {
  ResumeReview,
  ResumeReviewAction,
  ResumeReviewLoose,
} from "@arc/shared/resume-review";
import { IconCheck, IconPencil, IconX } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { EmptyValue } from "@/components/features/display/empty-value";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { JobDescriptionSelectField } from "@/components/features/studio/interviews/job-description-select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateStudioResumeIdentity } from "@/lib/client/api";
import { cn } from "@arc/shared/utils";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";

const DIMENSION_LABELS = RESUME_REVIEW_DIMENSIONS;

function actionVariant(action: ResumeReviewAction) {
  if (action === "interview") {
    return "success";
  }
  if (action === "hold") {
    return "warning";
  }
  return "danger";
}

interface ReviewDimensionDisplay {
  key: string;
  label: string;
  rationale: string;
  score: number;
  weight: number;
}

function getReviewDimensionDisplays(review: ResumeReviewLoose): ReviewDimensionDisplay[] {
  return DIMENSION_LABELS.flatMap(({ key, label, weight }) => {
    const dim = getResumeReviewDimension(review, key);
    if (!dim) {
      return [];
    }
    return [
      {
        key,
        label,
        rationale: dim.rationale,
        score: dim.score,
        weight: Math.round(weight * 100),
      },
    ];
  });
}

function DimensionRadarChart({
  compact = false,
  dimensions,
}: {
  compact?: boolean;
  dimensions: ReviewDimensionDisplay[];
}) {
  if (dimensions.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-muted/60 bg-muted/20 text-muted-foreground text-sm",
          compact ? "min-h-48" : "min-h-64",
        )}
      >
        未评估
      </div>
    );
  }

  return (
    <ChartContainer
      className={cn(
        "mx-auto aspect-square w-full",
        compact ? "min-h-[12rem] max-w-[14rem]" : "min-h-[16rem] max-w-[19rem] lg:min-h-[17rem]",
      )}
      config={{
        score: {
          color: "var(--primary)",
          label: "评分",
        },
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
          tick={{ fill: "var(--muted-foreground)", fontSize: compact ? 10 : 12 }}
        />
        <PolarRadiusAxis angle={90} axisLine={false} domain={[0, 100]} tick={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const payload = item.payload as ReviewDimensionDisplay | undefined;
                return (
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium text-foreground">
                      {payload?.label ?? "维度"}：{String(value)}
                    </div>
                    {payload ? (
                      <div className="text-muted-foreground text-xs leading-5">
                        权重 {payload.weight}% · {payload.rationale}
                      </div>
                    ) : null}
                  </div>
                );
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
          name="评分"
          stroke="var(--color-score)"
          strokeWidth={2}
        />
      </RadarChart>
    </ChartContainer>
  );
}

function ResumeOverviewAiScoreSection({
  detail,
  onViewAiScore,
}: {
  detail: ResumeLibraryDetail;
  onViewAiScore?: () => void;
}) {
  const review = detail.resumeReview;
  const baseScore = review ? getResumeReviewBaseScore(review) : null;
  const dimensionScores = review ? getReviewDimensionDisplays(review) : [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm">AI评分</h3>
          {review ? (
            <Badge variant={actionVariant(review.nextStep.action)}>
              建议{resumeReviewActionLabel[review.nextStep.action]}
            </Badge>
          ) : (
            <Badge variant="outline">未生成</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="min-w-0">
          <DimensionRadarChart compact dimensions={dimensionScores} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="text-muted-foreground text-xs">综合评分</div>
              <div className="font-semibold text-4xl tabular-nums leading-none tracking-tight">
                {baseScore ?? <EmptyValue />}
              </div>
            </div>
            {/* {review ? <Badge variant="outline">{review.levelRecommendation.level}</Badge> : null} */}
          </div>
          <div className="space-y-1.5">
            <h4 className="font-semibold text-sm leading-6">
              {review?.overall.conclusion ?? "暂无 AI评分结果"}
            </h4>
            <p className="text-muted-foreground text-sm leading-6">
              {review?.overall.scoreRationale ??
                "系统完成 AI评分后，这里会展示候选人的综合评价、分数和维度分布。"}
            </p>
          </div>
          {onViewAiScore ? (
            <Button
              className="h-auto px-0 text-xs"
              onClick={onViewAiScore}
              type="button"
              variant="link"
            >
              查看详情
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReviewSectionHeader({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3 h-10 ">
      <FrameTitle>{title}</FrameTitle>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </FrameHeader>
  );
}

function DimensionScoreItem({ dimension }: { dimension: ReviewDimensionDisplay }) {
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm leading-6">{dimension.label}</div>
          <div className="mt-0.5 text-muted-foreground text-xs">权重 {dimension.weight}%</div>
        </div>
        <div className="font-semibold text-xl tabular-nums leading-none">{dimension.score}</div>
      </div>
      <p className="mt-3 text-muted-foreground text-sm leading-6">{dimension.rationale}</p>
    </div>
  );
}

function DimensionScoreGroup({
  className,
  dimensions,
}: {
  className?: string;
  dimensions: ReviewDimensionDisplay[];
}) {
  return (
    <FramePanel className={cn("space-y-4", className)}>
      {dimensions.map((dimension, index) => (
        <div className={cn(index > 0 ? "border-t border-border/50 pt-4" : "")} key={dimension.key}>
          <DimensionScoreItem dimension={dimension} />
        </div>
      ))}
    </FramePanel>
  );
}

function ReviewPointList({
  emptyLabel = "未评估",
  items,
  tone,
}: {
  emptyLabel?: string;
  items: ResumeReview["strengths"] | undefined;
  tone: "positive" | "negative";
}) {
  const markerClass =
    tone === "positive" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

  if (!items?.length) {
    return (
      <p className="flex h-[24rem] items-center justify-center text-muted-foreground text-sm leading-6">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/50">
      {items.map((item, index) => (
        <li
          className="grid gap-3 py-4 text-sm leading-6 sm:grid-cols-[1.75rem_minmax(0,1fr)]"
          key={`${item.point}-${index}`}
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full font-medium text-xs tabular-nums",
              markerClass,
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="font-medium">{item.point}</p>
            <p className="text-muted-foreground">{item.evidence?.trim() || "待核实"}</p>
            <p className="text-muted-foreground">影响：{item.impact}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BiasScanSection({
  biasCounts,
  review,
}: {
  biasCounts: ReturnType<typeof countResumeReviewBiasCategories>;
  review: ResumeReviewLoose | null | undefined;
}) {
  const items = review?.biasScan.items ?? [];
  let body: ReactNode;
  if (!review) {
    body = (
      <p className="flex h-[24rem] items-center justify-center text-muted-foreground text-sm leading-6">
        未评估
      </p>
    );
  } else if (items.length === 0) {
    body = <p className="py-5 text-muted-foreground text-sm">未发现关键偏差</p>;
  } else {
    body = (
      <ul className="divide-y divide-border/50">
        {items.map((item, index) => (
          <li className="py-4 text-sm leading-6" key={`${item.category}-${index}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{resumeReviewBiasCategoryLabel[item.category]}</Badge>
              <span className="font-medium">{item.description}</span>
            </div>
            <p className="text-muted-foreground">{item.impact}</p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Frame className="h-full">
      <ReviewSectionHeader
        action={
          review ? (
            <>
              <Badge variant="outline">硬缺口 {biasCounts.hardGap}</Badge>
              <Badge variant="outline">软错位 {biasCounts.softMismatch}</Badge>
              <Badge variant="outline">真实性存疑 {biasCounts.credibilityRisk}</Badge>
              <Badge variant="outline">稳定性信号 {biasCounts.stabilitySignal}</Badge>
            </>
          ) : (
            <Badge variant="outline">未评估</Badge>
          )
        }
        title="偏差扫描"
      />
      <FramePanel className="flex-1">
        <ScrollArea className="h-[24rem]" scrollFade>
          {body}
        </ScrollArea>
      </FramePanel>
    </Frame>
  );
}

function ReviewSummaryHero({
  baseScore,
  review,
  summaryAction,
}: {
  baseScore: number | null;
  review: ResumeReviewLoose | null | undefined;
  summaryAction?: ReactNode;
}) {
  return (
    <Frame>
      <ReviewSectionHeader action={summaryAction} title="综合评价" />
      <FramePanel>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-start">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">推荐建议</span>
              {review ? (
                <>
                  <Badge variant={actionVariant(review.nextStep.action)}>
                    {resumeReviewActionLabel[review.nextStep.action]}
                  </Badge>
                  <Badge variant="outline">{review.levelRecommendation.level}</Badge>
                </>
              ) : (
                <Badge variant="outline">未评估</Badge>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base leading-7">
                {review?.overall.conclusion ?? "未评估"}
              </h3>
              <p className="text-muted-foreground text-sm leading-6">
                {review?.overall.scoreRationale ?? "绑定岗位并完成 AI 评估后，这里会展示综合评价。"}
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <div className="text-muted-foreground text-xs">下一步行动</div>
                <p className="text-sm leading-6">{review?.nextStep.rationale ?? "未评估"}</p>
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-muted-foreground text-xs">团队定位</div>
                <p className="text-sm leading-6">
                  {review?.teamPositioning.suggestion ?? "未评估"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-5 lg:items-end lg:text-right">
            <div className="font-semibold text-7xl tabular-nums leading-none tracking-tighter">
              {baseScore ?? <EmptyValue />}
            </div>
            <div className="-mt-3 text-muted-foreground text-xs">综合评分 / 100</div>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

export function ResumeReviewStructuredView({
  review,
  screeningResultSlot,
  summaryAction,
}: {
  review: ResumeReviewLoose | null | undefined;
  screeningResultSlot?: ReactNode;
  summaryAction?: ReactNode;
}) {
  const biasCounts = countResumeReviewBiasCategories(review?.biasScan.items ?? []);
  const baseScore = review ? getResumeReviewBaseScore(review) : null;
  const dimensionScores = review ? getReviewDimensionDisplays(review) : [];
  const dimensionScoreGroups = [
    dimensionScores.slice(0, 2),
    dimensionScores.slice(2, 4),
    dimensionScores.slice(4, 6),
  ].filter((group) => group.length > 0);

  return (
    <div className="w-full space-y-6">
      <ReviewSummaryHero baseScore={baseScore} review={review} summaryAction={summaryAction} />

      <Frame>
        <ReviewSectionHeader
          action={<span className="text-muted-foreground text-xs">0-100</span>}
          title="维度评分"
        />
        <div className="grid gap-1 lg:grid-cols-2">
          <FramePanel className="flex min-w-0 items-center justify-center lg:rounded-tr-[2px] lg:rounded-br-[2px] lg:rounded-bl-[2px] lg:before:rounded-tr-[1px] lg:before:rounded-br-[1px] lg:before:rounded-bl-[1px]">
            <DimensionRadarChart dimensions={dimensionScores} />
          </FramePanel>
          {review ? (
            dimensionScoreGroups.map((group, index) => (
              <DimensionScoreGroup
                className={cn(
                  index === 0 &&
                    "lg:rounded-tl-[2px] lg:rounded-br-[2px] lg:rounded-bl-[2px] lg:before:rounded-tl-[1px] lg:before:rounded-br-[1px] lg:before:rounded-bl-[1px]",
                  index === 1 &&
                    "lg:rounded-tl-[2px] lg:rounded-tr-[2px] lg:rounded-br-[2px] lg:before:rounded-tl-[1px] lg:before:rounded-tr-[1px] lg:before:rounded-br-[1px]",
                  index === 2 &&
                    "lg:rounded-tl-[2px] lg:rounded-tr-[2px] lg:rounded-bl-[2px] lg:before:rounded-tl-[1px] lg:before:rounded-tr-[1px] lg:before:rounded-bl-[1px]",
                )}
                dimensions={group}
                key={group.map((dimension) => dimension.key).join("-")}
              />
            ))
          ) : (
            <FramePanel className="flex min-h-64 items-center justify-center lg:rounded-tl-[2px] lg:rounded-br-[2px] lg:rounded-bl-[2px] lg:before:rounded-tl-[1px] lg:before:rounded-br-[1px] lg:before:rounded-bl-[1px]">
              <p className="text-muted-foreground text-sm leading-6">未评估</p>
            </FramePanel>
          )}
        </div>
      </Frame>

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame className="h-full">
          <ReviewSectionHeader title="优点" />
          <FramePanel className="flex-1">
            <ScrollArea className="h-[24rem]" scrollFade>
              <ReviewPointList items={review?.strengths} tone="positive" />
            </ScrollArea>
          </FramePanel>
        </Frame>

        <Frame className="h-full">
          <ReviewSectionHeader title="缺点" />
          <FramePanel className="flex-1">
            <ScrollArea className="h-[24rem]" scrollFade>
              <ReviewPointList items={review?.weaknesses} tone="negative" />
            </ScrollArea>
          </FramePanel>
        </Frame>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BiasScanSection biasCounts={biasCounts} review={review} />
        {screeningResultSlot ? (
          <div className="h-full min-w-0 [&>[data-slot=frame]]:h-full">{screeningResultSlot}</div>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Frame className="h-full">
          <ReviewSectionHeader title="团队定位建议" />
          <FramePanel className="flex-1">
            <div className="space-y-2 text-sm leading-6">
              <p className="font-medium">{review?.teamPositioning.suggestion ?? "未评估"}</p>
              <p className="text-muted-foreground">
                {review?.teamPositioning.rationale ?? "未评估"}
              </p>
            </div>
          </FramePanel>
        </Frame>

        <Frame className="h-full">
          <ReviewSectionHeader title="职级建议" />
          <FramePanel className="flex-1">
            <div className="space-y-2 text-sm leading-6">
              {review ? (
                <Badge variant="outline">{review.levelRecommendation.level}</Badge>
              ) : (
                <Badge variant="outline">未评估</Badge>
              )}
              <p className="text-muted-foreground">
                {review?.levelRecommendation.rationale ?? "未评估"}
              </p>
            </div>
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}

interface OverviewIdentityDraft {
  age: string;
  candidateEmail: string;
  candidateName: string;
  candidatePhone: string;
  gender: string;
  jobDescriptionId: string;
  resumeEvaluationStatus: "fail" | "pass" | "unreviewed";
  workYears: string;
}

function toOverviewIdentityDraft(detail: ResumeLibraryDetail): OverviewIdentityDraft {
  const profile = detail.resumeProfile;
  return {
    age: profile?.age === null || profile?.age === undefined ? "" : String(profile.age),
    // Prefer table columns; fall back to structured profile JSON.
    candidateEmail: detail.candidateEmail ?? profile?.email ?? "",
    candidateName: detail.candidateName || profile?.name || "",
    candidatePhone: detail.candidatePhone ?? profile?.phone ?? "",
    gender: profile?.gender ?? "",
    jobDescriptionId: detail.jobDescriptionId ?? "",
    resumeEvaluationStatus: detail.resumeEvaluationStatus ?? "unreviewed",
    workYears:
      profile?.workYears === null || profile?.workYears === undefined
        ? ""
        : String(profile.workYears),
  };
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function ResumeOverviewCandidateInfoSection({
  canEdit = false,
  detail,
  onUpdated,
  slug,
}: {
  canEdit?: boolean;
  detail: ResumeLibraryDetail;
  onUpdated?: () => void;
  slug?: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OverviewIdentityDraft>(() => toOverviewIdentityDraft(detail));
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);

  // Match 招聘台列表 card 编辑按钮：resumeLibrary:update（via canEdit）+ 解析 ready。
  const showEdit = Boolean(canEdit && slug && canEditResumeRecord(detail.resumeParseStatus));
  const resumeEvaluation = describeResumeEvaluationStatus(detail.resumeEvaluationStatus);
  const displayName = detail.candidateName || detail.resumeProfile?.name || null;
  const displayEmail = detail.candidateEmail ?? detail.resumeProfile?.email ?? null;
  const displayPhone = detail.candidatePhone ?? detail.resumeProfile?.phone ?? null;

  useEffect(() => {
    if (!editing) {
      setDraft(toOverviewIdentityDraft(detail));
      setNameError(null);
      setJdError(null);
    }
  }, [detail, editing]);

  // Drop edit mode if permission / parse status no longer allows it.
  useEffect(() => {
    if (!showEdit && editing) {
      setEditing(false);
      setDraft(toOverviewIdentityDraft(detail));
      setNameError(null);
      setJdError(null);
    }
  }, [detail, editing, showEdit]);

  function handleCancel() {
    setDraft(toOverviewIdentityDraft(detail));
    setNameError(null);
    setJdError(null);
    setEditing(false);
  }

  async function handleSave() {
    if (!slug || !showEdit) {
      return;
    }
    const name = draft.candidateName.trim();
    if (!name) {
      setNameError("请填写候选人姓名");
      return;
    }
    if (!draft.jobDescriptionId.trim()) {
      setJdError("请选择关联在招岗位");
      return;
    }
    const email = draft.candidateEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("请输入有效邮箱");
      return;
    }
    const age = parseOptionalNumber(draft.age);
    const workYears = parseOptionalNumber(draft.workYears);
    if (draft.age.trim() && age === null) {
      toast.error("年龄请输入有效数字");
      return;
    }
    if (draft.workYears.trim() && workYears === null) {
      toast.error("工作年限请输入有效数字");
      return;
    }

    setNameError(null);
    setJdError(null);
    setSaving(true);
    try {
      const payload: ResumeIdentityUpdateInput = {
        age,
        candidateEmail: email,
        candidateName: name,
        candidatePhone: draft.candidatePhone.trim(),
        gender: draft.gender.trim(),
        jobDescriptionId: draft.jobDescriptionId.trim(),
        resumeEvaluationStatus: draft.resumeEvaluationStatus,
        // Keep existing target role (not shown in this section).
        targetRole: detail.targetRole ?? "",
        workYears,
      };
      await updateStudioResumeIdentity(slug, detail.id, payload);
      toast.success("候选人信息已保存");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const actions = showEdit ? (
    <div className="flex items-center gap-0.5">
      {editing ? (
        <>
          <Button
            aria-label="取消编辑"
            className="size-7"
            disabled={saving}
            onClick={handleCancel}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <IconX className="size-3.5" />
          </Button>
          <Button
            aria-label="保存"
            className="size-7"
            disabled={saving}
            onClick={() => void handleSave()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <IconCheck className="size-3.5" />
          </Button>
        </>
      ) : (
        <Button
          aria-label="编辑候选人信息"
          className="size-7"
          onClick={() => setEditing(true)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <IconPencil className="size-3.5" />
        </Button>
      )}
    </div>
  ) : null;

  return (
    <section className="border-border/50 border-t pt-6">
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="font-medium text-sm">候选人信息</h3>
        {actions}
      </div>

      {editing ? (
        <DataFields columns={3} density="compact">
          <Field>
            <FieldLabel htmlFor="overview-candidate-name">
              姓名 <span className="text-destructive">*</span>
            </FieldLabel>
            <FieldContent className="gap-1">
              <Input
                className="h-8"
                id="overview-candidate-name"
                disabled={saving}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, candidateName: event.target.value }))
                }
                value={draft.candidateName}
              />
              {nameError ? <FieldError errors={[{ message: nameError }]} /> : null}
            </FieldContent>
          </Field>
          <div>
            <JobDescriptionSelectField
              disabled={saving}
              error={jdError ?? undefined}
              onChange={(next) => {
                setDraft((current) => ({ ...current, jobDescriptionId: next }));
                setJdError(null);
              }}
              showDescription={false}
              size="sm"
              value={draft.jobDescriptionId}
            />
          </div>
          <Field>
            <FieldLabel htmlFor="overview-resume-evaluation">简历评估</FieldLabel>
            <Select
              disabled={saving}
              onValueChange={(next) =>
                setDraft((current) => ({
                  ...current,
                  resumeEvaluationStatus: next as OverviewIdentityDraft["resumeEvaluationStatus"],
                }))
              }
              value={draft.resumeEvaluationStatus}
            >
              <SelectTrigger className="w-full" id="overview-resume-evaluation" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unreviewed">未评估</SelectItem>
                <SelectItem value="pass">通过</SelectItem>
                <SelectItem value="fail">不通过</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-gender">性别</FieldLabel>
            <Input
              className="h-8"
              id="overview-gender"
              disabled={saving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, gender: event.target.value }))
              }
              value={draft.gender}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-age">年龄</FieldLabel>
            <Input
              className="h-8"
              id="overview-age"
              disabled={saving}
              inputMode="numeric"
              onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))}
              value={draft.age}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-work-years">工作年限</FieldLabel>
            <Input
              className="h-8"
              id="overview-work-years"
              disabled={saving}
              inputMode="decimal"
              onChange={(event) =>
                setDraft((current) => ({ ...current, workYears: event.target.value }))
              }
              value={draft.workYears}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-email">邮箱</FieldLabel>
            <Input
              className="h-8"
              id="overview-email"
              disabled={saving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, candidateEmail: event.target.value }))
              }
              type="email"
              value={draft.candidateEmail}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-phone">电话</FieldLabel>
            <Input
              className="h-8"
              id="overview-phone"
              disabled={saving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, candidatePhone: event.target.value }))
              }
              type="tel"
              value={draft.candidatePhone}
            />
          </Field>
        </DataFields>
      ) : (
        <DataFields columns={3} density="compact">
          <DataField label="姓名" value={displayName} />
          <DataField
            label="关联岗位"
            value={
              <JobDescriptionHoverCard
                jobDescriptionId={detail.jobDescriptionId}
                name={detail.jobDescriptionName}
              />
            }
            valueClassName="font-medium"
          />
          <DataField label="简历评估" value={resumeEvaluation.label} valueClassName="font-medium" />
          <DataField label="性别" value={detail.resumeProfile?.gender} />
          <DataField kind="number" label="年龄" value={detail.resumeProfile?.age} />
          <DataField kind="number" label="工作年限" value={detail.resumeProfile?.workYears} />
          <DataField kind="email" label="邮箱" value={displayEmail} />
          <DataField kind="phone" label="电话" value={displayPhone} />
        </DataFields>
      )}
    </section>
  );
}

export function ResumeOverviewPanel({
  canEdit = false,
  detail,
  onUpdated,
  onViewAiScore,
  slug,
}: {
  canEdit?: boolean;
  detail: ResumeLibraryDetail;
  onUpdated?: () => void;
  onViewAiScore?: () => void;
  slug?: string;
}) {
  return (
    <div className="space-y-8">
      <ResumeOverviewAiScoreSection detail={detail} onViewAiScore={onViewAiScore} />

      <ResumeOverviewCandidateInfoSection
        canEdit={canEdit}
        detail={detail}
        onUpdated={onUpdated}
        slug={slug}
      />

      <section className="border-t border-border/50 pt-6">
        <ResumeProfileView profile={detail.resumeProfile ?? null} showBasicInfo={false} />
      </section>
    </div>
  );
}
