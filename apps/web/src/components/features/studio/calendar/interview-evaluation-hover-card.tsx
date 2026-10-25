"use client";

import type {
  StudioCalendarCandidate,
  StudioCalendarEvaluationConclusion,
  StudioCalendarEvaluator,
  StudioCalendarEvent,
} from "@app/shared/studio-calendar";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { RecruitmentCopilotMark } from "@/components/layout/app-sidebar/recruitment-copilot-brand";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { fetchStudioCalendarRoundEvaluation } from "@/lib/client/api/endpoints/studio-calendar";
import { studioCalendarKeys } from "@/lib/client/api/query-keys";

// 未通过红色、待定橙色，便于在列表里一眼区分需要关注的轮次。
// / Red for fail and orange for inconclusive so rounds needing attention stand out in the list.
const CONCLUSION_META = {
  fail: { label: "未通过", tone: "danger" },
  inconclusive: { label: "待定", tone: "orange" },
  none: { label: "未评价", tone: "default" },
  pass: { label: "通过", tone: "success" },
} as const satisfies Record<
  StudioCalendarEvaluationConclusion,
  { label: string; tone: "danger" | "default" | "orange" | "success" }
>;

function conclusionMeta(conclusion: StudioCalendarEvaluationConclusion) {
  return CONCLUSION_META[conclusion];
}

export function EvaluationConclusionBadge({
  className,
  conclusion,
}: {
  className?: string;
  conclusion: StudioCalendarEvaluationConclusion;
}) {
  const meta = conclusionMeta(conclusion);
  return (
    <Badge className={className} variant={meta.tone}>
      {meta.label}
    </Badge>
  );
}

function EvaluationSkeleton() {
  return (
    <output
      aria-label="正在加载面试评价"
      className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </output>
  );
}

/** 18px 评价者头像；AI 使用图标而非人像。/ An 18px evaluator avatar; the AI gets an icon. */
export function PersonAvatar({
  avatarUrl,
  kind = "human",
  seed,
}: {
  avatarUrl: string | null;
  kind?: "ai" | "human";
  seed: string;
}) {
  if (kind === "ai") {
    // AI 面试官统一使用应用图标。The AI interviewer always shows the app icon.
    return <RecruitmentCopilotMark className="size-4.5" />;
  }
  return (
    <Avatar aria-hidden className="size-4.5" seed={seed}>
      {avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
    </Avatar>
  );
}

function EvaluatorAvatar({ evaluator }: { evaluator: StudioCalendarEvaluator }) {
  return <PersonAvatar avatarUrl={evaluator.avatarUrl} kind={evaluator.kind} seed={evaluator.id} />;
}

function EvaluationSection({ label, text }: { label: string; text: string | null }) {
  if (!text) {
    return null;
  }
  return (
    <section>
      <h4 className="mb-0.5 font-medium text-muted-foreground text-xs">{label}</h4>
      <p className="line-clamp-4 whitespace-pre-line text-sm leading-5">{text}</p>
    </section>
  );
}

function EvaluatorPanel({ evaluator }: { evaluator: StudioCalendarEvaluator }) {
  const hasContent = Boolean(evaluator.overallEvaluation || evaluator.strengths || evaluator.risks);
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        {evaluator.outcome ? <EvaluationConclusionBadge conclusion={evaluator.outcome} /> : null}
        {evaluator.rating ? <span>评级 {evaluator.rating}</span> : null}
        {evaluator.submittedAt ? (
          <span>{format(new Date(evaluator.submittedAt), "M月d日 HH:mm")}</span>
        ) : null}
      </div>
      {hasContent ? (
        <>
          <EvaluationSection
            label={evaluator.kind === "ai" && !evaluator.strengths ? "面试总结" : "综合评价"}
            text={evaluator.overallEvaluation}
          />
          <EvaluationSection label="优势" text={evaluator.strengths} />
          <EvaluationSection label="风险" text={evaluator.risks} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{evaluator.statusText ?? "暂无评价内容"}</p>
      )}
    </div>
  );
}

function RoundEvaluationContent({
  candidateName,
  kind,
  roundId,
  slug,
}: {
  candidateName: string;
  kind: StudioCalendarEvent["kind"];
  roundId: string;
  slug: string;
}) {
  const evaluationQuery = useQuery({
    queryFn: () => fetchStudioCalendarRoundEvaluation(slug, kind, roundId),
    queryKey: studioCalendarKeys.roundEvaluation(slug, kind, roundId),
    staleTime: 30_000,
  });
  const evaluation = evaluationQuery.data;

  if (evaluationQuery.isError || evaluation === null) {
    return <p className="w-72 text-muted-foreground text-sm">面试评价加载失败，请稍后重试。</p>;
  }

  return (
    <SkeletonReveal loading={evaluationQuery.isPending} skeleton={<EvaluationSkeleton />}>
      {evaluation ? (
        <div className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h3 className="truncate font-medium text-sm">{candidateName}</h3>
            <EvaluationConclusionBadge className="shrink-0" conclusion={evaluation.conclusion} />
          </div>
          <Tabs defaultValue={evaluation.evaluators[0]?.id}>
            <TabsList className="max-w-full overflow-x-auto" variant="underline">
              {evaluation.evaluators.map((evaluator) => (
                <TabsTab className="grow-0" key={evaluator.id} value={evaluator.id}>
                  <EvaluatorAvatar evaluator={evaluator} />
                  <span className="max-w-28 truncate">{evaluator.name}</span>
                </TabsTab>
              ))}
            </TabsList>
            {evaluation.evaluators.map((evaluator) => (
              <TabsPanel className="min-h-28" key={evaluator.id} value={evaluator.id}>
                <EvaluatorPanel evaluator={evaluator} />
              </TabsPanel>
            ))}
          </Tabs>
        </div>
      ) : null}
    </SkeletonReveal>
  );
}

function stopRowActivation(pointerEvent: { stopPropagation: () => void }) {
  pointerEvent.stopPropagation();
}

/**
 * 评价徽标即触发点：hover 或聚焦时打开并加载详情。一旦在卡片里点击（例如切换 tab），卡片被
 * 钉住，只有点击外部或按 Esc 才关闭，避免内容高度变化导致卡片移位后因鼠标离开而消失。
 * / The conclusion badge is the trigger. Interacting inside the card pins it, so a tab switch
 * that resizes and repositions the card cannot dismiss it by leaving the pointer behind.
 */
export function InterviewEvaluationHoverCard({
  candidate,
  kind,
  slug,
}: {
  candidate: StudioCalendarCandidate;
  kind: StudioCalendarEvent["kind"];
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  return (
    <HoverCard
      onOpenChange={(next, details) => {
        const hoverClose = details.reason === "trigger-hover" || details.reason === "trigger-focus";
        if (!next && pinned && hoverClose) {
          return;
        }
        setOpen(next);
        if (!next) {
          setPinned(false);
        }
      }}
      open={open}
    >
      <HoverCardTrigger
        closeDelay={200}
        data-calendar-evaluation-trigger=""
        delay={250}
        onClick={(clickEvent) => {
          // 点击徽标只钉住卡片，不触发整行跳转。/ Clicking the badge pins the card, not the row.
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          setOpen(true);
          setPinned(true);
        }}
        onPointerDown={stopRowActivation}
        render={<span />}
      >
        <EvaluationConclusionBadge
          className="w-15 justify-center"
          conclusion={candidate.evaluationConclusion}
        />
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="w-auto p-4"
        onClick={stopRowActivation}
        onPointerDown={(pointerEvent) => {
          pointerEvent.stopPropagation();
          setPinned(true);
        }}
        side="top"
        sideOffset={8}
      >
        {open ? (
          <RoundEvaluationContent
            candidateName={candidate.candidateName}
            kind={kind}
            roundId={candidate.roundId}
            slug={slug}
          />
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
