"use client";

import {
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  RESUME_REVIEW_DIMENSIONS,
} from "@arc/shared/resume-review";
import type { ResumeReviewLoose } from "@arc/shared/resume-review";
import type { StructuredResumeReview } from "@arc/shared/recruiting-copilot";
import type {
  QualitativeRecommendationLevel,
  QualitativeResumeEvaluation,
  QualitativeResumeEvaluationV2,
} from "@arc/db-schema/qualitative-resume-evaluation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardFooter, CardHeader, CardPanel } from "@/components/ui/card";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import {
  structuredGateVariant,
  STRUCTURED_GATE_LABELS,
  STRUCTURED_GRADE_LABELS,
} from "@/components/features/studio/resumes/resume-review-display";
import { RecruitingChatCard } from "./recruiting-chat-card";
import { useRecruitingCopilotContext } from "./recruiting-copilot-context";
import type { ResumeRecordDetailResult } from "./recruiting-copilot-context";

interface RecruitingResumeReviewDimension {
  key: string;
  label: string;
  score: number | null;
}

interface RecruitingResumeReviewCardModel {
  baseScore: number | null;
  conclusion: string | null;
  dimensions: RecruitingResumeReviewDimension[];
  gateStatus: StructuredResumeReview["gateStatus"] | null;
  grade: StructuredResumeReview["grade"] | null;
}

const QUALITATIVE_DIMENSIONS = [
  ["skillMatch", "技能匹配"],
  ["experienceRelevance", "经验相关性"],
  ["projectMatch", "项目匹配"],
  ["educationBackground", "教育与背景"],
  ["potential", "潜力"],
  ["stability", "稳定性"],
] as const;

const QUALITATIVE_LEVEL_LABEL = {
  highly_recommended: "非常推荐",
  not_recommended: "不推荐",
  recommended: "推荐",
  undecided: "待定",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

const QUALITATIVE_RADAR_POSITION = {
  highly_recommended: 4,
  not_recommended: 1,
  recommended: 3,
  undecided: 2,
} as const satisfies Record<QualitativeRecommendationLevel, number>;

export function buildRecruitingResumeReviewCardModel(
  review: ResumeReviewLoose | null | undefined,
  structuredReview?: StructuredResumeReview | null,
): RecruitingResumeReviewCardModel {
  if (structuredReview) {
    return {
      baseScore: structuredReview.compositeScore,
      conclusion: structuredReview.overallComment ?? structuredReview.summary,
      dimensions: RESUME_REVIEW_DIMENSIONS.map((definition) => ({
        key: definition.key,
        label: definition.label,
        score: structuredReview.dimensions[definition.key].score,
      })),
      gateStatus: structuredReview.gateStatus,
      grade: structuredReview.grade,
    };
  }
  return {
    baseScore: review ? getResumeReviewBaseScore(review) : null,
    conclusion: review?.overall.conclusion ?? null,
    dimensions: RESUME_REVIEW_DIMENSIONS.map((definition) => {
      const dimension = review ? getResumeReviewDimension(review, definition.key) : null;
      return {
        key: definition.key,
        label: definition.label,
        score: dimension?.score ?? null,
      };
    }),
    gateStatus: null,
    grade: null,
  };
}

function ReviewDimensionRadar({ dimensions }: { dimensions: RecruitingResumeReviewDimension[] }) {
  const hasScores = dimensions.some((dimension) => dimension.score !== null);

  if (!hasScores) {
    return (
      <div className="flex min-h-48 items-center justify-center text-muted-foreground text-sm">
        暂无维度评分
      </div>
    );
  }

  return (
    <DimensionRadarChart
      ariaLabel="简历评分雷达图"
      className="min-h-48 max-w-52"
      compact
      dimensions={dimensions}
      tooltipBody={(dimension) => (
        <div className="font-medium text-foreground">
          {dimension.label}：{String(dimension.score ?? "—")}
        </div>
      )}
    />
  );
}

function isQualitativeV2(
  evaluation: QualitativeResumeEvaluation,
): evaluation is QualitativeResumeEvaluationV2 {
  return evaluation.schemaVersion === 2;
}

function QualitativeReviewDimensionRadar({
  evaluation,
}: {
  evaluation: QualitativeResumeEvaluation;
}) {
  if (!isQualitativeV2(evaluation)) {
    return (
      <p className="flex min-h-48 items-center justify-center text-center text-muted-foreground text-sm leading-6">
        此结果生成于六维评级引入前，重新评价后可查看六维图表。
      </p>
    );
  }
  const dimensions = QUALITATIVE_DIMENSIONS.map(([key, label]) => ({
    key,
    label,
    score: QUALITATIVE_RADAR_POSITION[evaluation.dimensions[key].level],
  }));
  return (
    <DimensionRadarChart
      ariaLabel="简历六维定性评价雷达图"
      className="min-h-48 max-w-52"
      compact
      dimensions={dimensions}
      maxScore={4}
      tooltipBody={(dimension) => {
        const key = QUALITATIVE_DIMENSIONS.find(
          ([candidateKey]) => candidateKey === dimension.key,
        )?.[0];
        return key ? (
          <div className="font-medium text-foreground">
            {dimension.label}：{QUALITATIVE_LEVEL_LABEL[evaluation.dimensions[key].level]}
          </div>
        ) : null;
      }}
    />
  );
}

function ReviewDimensionList({ dimensions }: { dimensions: RecruitingResumeReviewDimension[] }) {
  return (
    <dl className="mt-3 grid gap-x-4 sm:grid-cols-2">
      {dimensions.map((dimension) => (
        <div
          className="flex min-w-0 items-baseline justify-between gap-2 border-b py-2"
          key={dimension.key}
        >
          <dt className="truncate text-muted-foreground text-xs">{dimension.label}</dt>
          <dd className="shrink-0 font-medium text-xs tabular-nums">{dimension.score ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function QualitativeDimensionList({ evaluation }: { evaluation: QualitativeResumeEvaluation }) {
  return (
    <dl className="mt-3 grid gap-x-4 sm:grid-cols-2">
      {QUALITATIVE_DIMENSIONS.map(([key, label]) => (
        <div className="flex min-w-0 items-baseline justify-between gap-2 border-b py-2" key={key}>
          <dt className="truncate text-muted-foreground text-xs">{label}</dt>
          <dd className="shrink-0 font-medium text-xs">
            {isQualitativeV2(evaluation)
              ? QUALITATIVE_LEVEL_LABEL[evaluation.dimensions[key].level]
              : "未评级"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RecruitingResumeReviewCard({
  record,
}: {
  record: NonNullable<ResumeRecordDetailResult["resumeRecord"]>;
}) {
  const { openResumeDetail } = useRecruitingCopilotContext();
  const qualitativeEvaluation =
    record.resumeEvaluationArtifactMode === "qualitative"
      ? record.qualitativeResumeEvaluation
      : null;
  const model = buildRecruitingResumeReviewCardModel(
    record.resumeReview,
    record.resumeEvaluationArtifactMode === "structured" ? record.structuredResumeReview : null,
  );

  return (
    <RecruitingChatCard
      aria-label={`${record.candidateName} 的数据库 AI${qualitativeEvaluation ? "评价" : "评分"}`}
      className="aui-resume-review-card"
      render={<section />}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-4 pt-4 pb-0">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-sm">{record.candidateName}</h3>
          <p className="mt-1 truncate text-muted-foreground text-xs">
            关联岗位：{record.jobDescriptionName ?? "已绑定岗位"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {qualitativeEvaluation ? (
            <>
              <div className="font-semibold text-base leading-none">
                {QUALITATIVE_LEVEL_LABEL[qualitativeEvaluation.recommendationLevel]}
              </div>
              <div className="mt-1 text-muted-foreground text-[11px]">推荐建议</div>
            </>
          ) : (
            <>
              <div className="font-semibold text-2xl tabular-nums leading-none">
                {model.baseScore ?? "—"}
              </div>
              <div className="mt-1 text-muted-foreground text-[11px]">综合评分</div>
            </>
          )}
        </div>
      </CardHeader>

      <CardPanel className="grid gap-4 px-4 py-3.5 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)] sm:items-center">
        {qualitativeEvaluation ? (
          <QualitativeReviewDimensionRadar evaluation={qualitativeEvaluation} />
        ) : (
          <ReviewDimensionRadar dimensions={model.dimensions} />
        )}
        <div className="min-w-0">
          <p className="text-sm leading-6">
            {qualitativeEvaluation?.conciseOverall ??
              model.conclusion ??
              "该候选人尚未生成 AI评分，六维评分暂无数据。"}
          </p>
          {model.grade && model.gateStatus ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline">{STRUCTURED_GRADE_LABELS[model.grade]}</Badge>
              <Badge variant={structuredGateVariant(model.gateStatus)}>
                {STRUCTURED_GATE_LABELS[model.gateStatus]}
              </Badge>
            </div>
          ) : null}
          {qualitativeEvaluation ? (
            <QualitativeDimensionList evaluation={qualitativeEvaluation} />
          ) : (
            <ReviewDimensionList dimensions={model.dimensions} />
          )}
        </div>
      </CardPanel>

      <CardFooter className="justify-end px-4 pt-0 pb-4">
        <Button
          className="h-8 px-2.5 text-xs"
          onClick={() => openResumeDetail(record.id, "ai-analysis")}
          size="sm"
          type="button"
          variant="secondary"
        >
          查看{qualitativeEvaluation ? "评价" : "评分"}详情
        </Button>
      </CardFooter>
    </RecruitingChatCard>
  );
}
