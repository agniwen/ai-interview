"use client";

// 首页首屏专用的简历评价展示：视觉对齐 Studio 的六维评价面板，文案全部来自演示文案。
// Homepage-only resume evaluation views mirroring the Studio panel, fully localized.
import { IconAlertTriangle, IconSparkles, IconThumbUp } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { getDemoScreenCopy } from "../demo-screen-copy";
import type { DemoRecommendationLevel } from "../demo-workflow-data";
import { DEMO_DIMENSIONS } from "../demo-workflow-data";

const LEVEL_META = {
  highly_recommended: {
    className: "text-purple-700 dark:text-purple-300",
    icon: IconSparkles,
    radial: 4,
  },
  recommended: { className: "text-green-700 dark:text-green-300", icon: IconThumbUp, radial: 3 },
} as const;

const POINT_GRID_CLASS =
  "grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-x-4";

export function DemoRecommendation({
  className,
  level,
}: {
  className?: string;
  level: DemoRecommendationLevel;
}) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium text-xs leading-none",
        meta.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {getDemoScreenCopy().evaluationUi.levels[level]}
    </span>
  );
}

interface DemoEvaluationPoint {
  content: string;
  jobRequirement: string;
  point: string;
  resumeEvidence: string | null;
}

export function DemoEvaluationPoints({
  className,
  items,
  kind,
}: {
  className?: string;
  items: readonly DemoEvaluationPoint[];
  kind: "matching" | "risk";
}) {
  const ui = getDemoScreenCopy().evaluationUi;
  const Icon = kind === "matching" ? IconThumbUp : IconAlertTriangle;
  return (
    <ul className={cn("flex min-w-0 flex-col gap-4", className)}>
      {items.map((item) => (
        <li className={POINT_GRID_CLASS} key={item.point}>
          <Badge
            className="max-w-full justify-self-start"
            title={item.point}
            variant={kind === "matching" ? "success" : "warning"}
          >
            <Icon aria-hidden="true" />
            <span className="truncate">{item.point}</span>
          </Badge>
          <div className="min-w-0 wrap-break-word">
            <p className="text-foreground">{item.content}</p>
            <dl className="mt-1.5 grid gap-0.5 text-muted-foreground text-xs leading-5">
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground/70">{ui.jobRequirement}</dt>
                <dd className="min-w-0">{item.jobRequirement}</dd>
              </div>
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground/70">{ui.resumeEvidence}</dt>
                <dd className="min-w-0">{item.resumeEvidence ?? ui.notMentioned}</dd>
              </div>
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DemoDimensionRadar({ compact = false }: { compact?: boolean }) {
  const copy = getDemoScreenCopy();
  const ui = copy.evaluationUi;
  const dimensions = DEMO_DIMENSIONS.map(({ key, level }) => ({
    key,
    label: ui.dimensionLabels[key],
    rationale: copy.evaluation.dimensions[key],
    score: LEVEL_META[level].radial,
  }));
  return (
    <DimensionRadarChart
      ariaLabel={ui.radarLabel}
      compact={compact}
      config={{
        score: {
          label: ui.radarLabel,
          theme: { dark: "#7699ef", light: "var(--chart-primary)" },
        },
      }}
      dimensions={dimensions}
      maxScore={4}
      tooltipBody={(point) => {
        const dimension = DEMO_DIMENSIONS.find((entry) => entry.key === point.key);
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="font-medium text-foreground">
              {point.label} · {dimension ? ui.levels[dimension.level] : null}
            </div>
            <p className="line-clamp-3 text-xs leading-5">{point.rationale}</p>
          </div>
        );
      }}
    />
  );
}

/** Judgment, matching evidence and risks: reused by the detail page and the meeting materials. */
export function DemoEvaluationSummary({ className }: { className?: string }) {
  const { evaluation, evaluationUi: ui } = getDemoScreenCopy();
  return (
    <div className={cn("flex flex-col gap-5 text-sm leading-6", className)}>
      <section>
        <h3 className="mb-1 font-medium">{ui.judgment}</h3>
        <MarkdownView content={evaluation.judgment} />
      </section>
      <section>
        <h3 className="mb-3 font-medium">{ui.matchingEvidence}</h3>
        <DemoEvaluationPoints items={evaluation.matchingEvidence} kind="matching" />
      </section>
      <section>
        <h3 className="mb-3 font-medium">{ui.risks}</h3>
        <DemoEvaluationPoints items={evaluation.risks} kind="risk" />
      </section>
    </div>
  );
}

const DIMENSION_GROUP_CORNERS = [
  "rounded-[2px] rounded-tr-xl",
  "rounded-[2px] rounded-bl-xl",
  "rounded-[2px] rounded-br-xl",
] as const;

export function DemoEvaluationDetails({ summaryAction }: { summaryAction?: ReactNode }) {
  const { evaluation, evaluationUi: ui } = getDemoScreenCopy();
  const groups = [
    DEMO_DIMENSIONS.slice(0, 2),
    DEMO_DIMENSIONS.slice(2, 4),
    DEMO_DIMENSIONS.slice(4),
  ];
  return (
    <div className="flex flex-col gap-6">
      <Frame>
        <FrameHeader className="justify-between gap-3">
          <FrameTitle>{ui.overallTitle}</FrameTitle>
          {summaryAction}
        </FrameHeader>
        <FramePanel className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">{ui.recommendation}</span>
            <DemoRecommendation level="highly_recommended" />
          </div>
          <h3 className="font-semibold text-base leading-7">{evaluation.conciseOverall}</h3>
          <DemoEvaluationSummary />
        </FramePanel>
      </Frame>
      <Frame>
        <FrameHeader>
          <FrameTitle>{ui.dimensionsTitle}</FrameTitle>
        </FrameHeader>
        <div className="grid grid-cols-2 gap-1">
          <FramePanel className="flex min-w-0 items-center justify-center rounded-[2px] rounded-tl-xl">
            <DemoDimensionRadar />
          </FramePanel>
          {groups.map((entries, index) => (
            <FramePanel
              className={cn("flex flex-col gap-4", DIMENSION_GROUP_CORNERS[index])}
              key={entries.map(({ key }) => key).join("-")}
            >
              {entries.map(({ basis, key, level }, entryIndex) => (
                <div className={cn(entryIndex > 0 && "border-border/50 border-t pt-4")} key={key}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-sm">{ui.dimensionLabels[key]}</div>
                    <DemoRecommendation className="shrink-0" level={level} />
                  </div>
                  <p className="mt-3 text-sm leading-6">{evaluation.dimensions[key]}</p>
                  <p className="mt-2 text-muted-foreground text-xs leading-5">{ui.basis[basis]}</p>
                </div>
              ))}
            </FramePanel>
          ))}
        </div>
      </Frame>
      <div className="grid grid-cols-2 gap-4">
        {[
          {
            body: evaluation.seniorityRationale,
            title: ui.seniority,
            value: evaluation.seniorityLevel,
          },
          { body: evaluation.teamRationale, title: ui.team, value: evaluation.teamSuggestion },
        ].map((card) => (
          <Frame key={card.title}>
            <FrameHeader>
              <FrameTitle>{card.title}</FrameTitle>
            </FrameHeader>
            <FramePanel className="flex flex-1 flex-col gap-2 text-sm leading-6">
              <p className="font-medium">{card.value}</p>
              <p>{card.body}</p>
            </FramePanel>
          </Frame>
        ))}
      </div>
    </div>
  );
}
