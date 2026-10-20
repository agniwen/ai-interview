"use client";

import { DemoCandidateDetail } from "./demo-candidate-detail";

/* oxlint-disable max-lines -- Recruitment chart, tabs and card mirror the production desk within a standalone demo. */
import {
  IconBriefcase,
  IconDots,
  IconEdit,
  IconFileText,
  IconFileUpload,
  IconFilterX,
  IconFilterPlus,
  IconRefresh,
  IconSparkles,
  IconThumbUp,
  IconAlertTriangle,
  IconUpload,
} from "@tabler/icons-react";
// 用途：landing 用「Studio › 招聘台」简化版 UI。对齐真实组件：
// - PageHeader: <h1 class="text-2xl">
// - ResumeLibraryCardList: Toolbar + 当前候选人卡片结构
// Purpose: simplified Studio resume library mock, mirroring the real components 1:1.

import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DemoPhase } from "./demo-context";
import { DemoProvider, useDemo } from "./demo-context";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResumeLifecycleBadge } from "@/components/features/studio/resumes/resume-lifecycle-badge";
import * as m from "@/paraglide/messages";
import { matchesDemoPipeline } from "./demo-candidate-stages";
import type { RecruitingBoardStageView } from "@app/shared/recruiting-board";
import { recruitingBoardGroups } from "@app/shared/recruiting-board";
import { getHomeDeskCopy, localizeBoardLabel } from "./recruiting-desk-copy";
import { getDemoScreenCopy } from "./demo-screen-copy";
import type { DemoDateGroup, DemoDeskVerdictLevel } from "./demo-workflow-data";
import {
  DEMO_BOARD_COUNTS,
  DEMO_CANDIDATE_EMAIL,
  DEMO_CANDIDATE_ID,
  DEMO_CREATED_AT,
  DEMO_DESK_RECORDS,
} from "./demo-workflow-data";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const DemoHumanRoom = lazy(() => import("./demo-human-room"));
const DemoLiveInterview = lazy(() => import("./demo-live-interview"));

// ─────────────────── PageHeader ───────────────────
function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 w-full">
        <h1 className="min-w-0 text-2xl tracking-tight">{title}</h1>
      </div>
    </header>
  );
}

// ─────────────────── Pipeline stage tabs ───────────────────
const TAB_COUNT_MAX = 999;

/** 对齐 RecruitingBoardTabs 的右上角数量角标；超过上限显示“999+”。 */
function TabCountBadge({ count }: { count?: number }) {
  if (!count) {
    return null;
  }
  return (
    <span
      aria-label={getDemoScreenCopy().desk.countLabel(count)}
      className="pointer-events-none absolute -top-2.5 -right-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 font-semibold text-[11px] text-white tabular-nums leading-none antialiased"
    >
      {count > TAB_COUNT_MAX ? `${TAB_COUNT_MAX}+` : count}
    </span>
  );
}

function PipelineStageTabs() {
  const demo = useDemo();
  const copy = getHomeDeskCopy();
  const selectedGroup = recruitingBoardGroups.find((group) => group.id === demo.group);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tabs
        value={demo.group}
        onValueChange={(value) => {
          const group = recruitingBoardGroups.find((entry) => entry.id === value);
          if (group) {
            demo.setGroup(group.id);
            demo.setStage(group.tabs[0].value);
          }
        }}
      >
        <TabsList aria-label={copy.stages} className="w-fit overflow-visible">
          {recruitingBoardGroups.map((tab) => (
            <TabsTrigger
              data-demo-group={tab.id}
              className="h-10! px-6 text-sm"
              key={tab.id}
              value={tab.id}
            >
              {localizeBoardLabel(tab.label)}
              <TabCountBadge count={DEMO_BOARD_COUNTS.get(tab.id)} />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ScrollArea
        className="min-w-0"
        scrollbars="leave"
        options={{
          overflow: { x: "scroll", y: "hidden" },
          scrollbars: { autoHide: "leave", autoHideDelay: 600, theme: "os-theme-app" },
        }}
      >
        <Tabs value={demo.stage} onValueChange={(value) => demo.setStage(String(value))}>
          <TabsList
            aria-label={copy.subprocesses}
            className="w-max max-w-none gap-1 px-3"
            variant="underline"
          >
            {selectedGroup?.tabs.map((tab) => (
              <TabsTrigger
                data-demo-stage={tab.value}
                className="h-8! px-3 text-xs!"
                key={tab.value}
                value={tab.value}
              >
                {localizeBoardLabel(tab.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </ScrollArea>
    </div>
  );
}

// ─────────────────── DataGrid Toolbar ───────────────────
// 真实招聘台筛选项较多，Toolbar 进入高级模式：添加筛选 · 清空筛选 · 刷新 · 创建招聘记录。
// The real desk has enough filters for the toolbar's advanced mode, so no inline search/selects.
function ResumeToolbar() {
  const demo = useDemo();
  const { desk } = getDemoScreenCopy();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-slot="data-grid-toolbar">
      <Button type="button" variant="outline" disabled>
        <IconFilterPlus data-icon="inline-start" />
        {getHomeDeskCopy().addFilter}
      </Button>
      <Button type="button" variant="outline" disabled>
        <IconFilterX data-icon="inline-start" />
        {desk.clearFilters}
      </Button>
      <Button type="button" variant="outline" onClick={() => demo.setNotice(desk.refreshed)}>
        <IconRefresh data-icon="inline-start" />
        {m.home_frame_refresh()}
      </Button>
      <Button type="button" disabled>
        <IconFileUpload className="size-4" />
        {m.home_frame_create_record()}
      </Button>
    </div>
  );
}

// ─────────────────── Current card list ───────────────────
const DATE_GROUPS: readonly DemoDateGroup[] = ["today", "yesterday", "earlier"];

interface ResumeCardData {
  pipeline: Exclude<RecruitingBoardStageView, `${string}:all`>;
  createdAt: string;
  creator: string;
  education: readonly ProfileSnapshotLineData[];
  email: string;
  group: DemoDateGroup;
  id: string;
  isScreening: boolean;
  job: string;
  lifecycleDetail: string;
  lifecycleStage: string;
  focus: readonly DemoFocusPoint[];
  level: DemoDeskVerdictLevel;
  name: string;
  summary: string;
  verdict: string;
  work: readonly ProfileSnapshotLineData[];
}

interface DemoFocusPoint {
  content: string;
  kind: "matching" | "risk";
  point: string;
}

interface ProfileSnapshotLineData {
  period: string;
  primary: string;
  secondary: string;
}

function getDemoResume(): Omit<ResumeCardData, "lifecycleDetail" | "lifecycleStage" | "pipeline"> {
  const { desk, evaluation, job, people, resume } = getDemoScreenCopy();
  return {
    createdAt: DEMO_CREATED_AT,
    creator: people.recruiter,
    education: resume.education,
    email: DEMO_CANDIDATE_EMAIL,
    // 与真实 V3 摘录一致：匹配依据在前、风险在后。 Matching evidence first, then risks, as in V3.
    focus: [
      ...evaluation.matchingEvidence.map(({ content, point }) => ({
        content,
        kind: "matching" as const,
        point,
      })),
      ...evaluation.risks.map(({ content, point }) => ({ content, kind: "risk" as const, point })),
    ],
    group: "today",
    id: DEMO_CANDIDATE_ID,
    isScreening: false,
    job: job.label,
    level: "highly_recommended",
    name: people.candidate,
    summary: resume.summary,
    verdict: desk.highlyRecommended,
    work: resume.work,
  };
}

function CandidateAvatar({ record }: { record: ResumeCardData }) {
  const seed = [record.name, record.email].filter(Boolean).join(" ") || record.id;

  return (
    <Avatar
      className="size-10 shrink-0"
      label={m.home_frame_candidate_avatar({ name: record.name })}
      seed={`candidate:${seed}`}
    >
      <AvatarFallback>{record.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

function ResumeCardMetaItem({
  children,
  icon,
  label,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="flex min-h-6 w-auto max-w-full min-w-0 shrink items-center gap-1.5 text-muted-foreground text-xs">
      <span aria-hidden="true" className="inline-flex shrink-0 items-center text-muted-foreground">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{children}</span>
    </span>
  );
}

function ResumeCardCreatorMeta({ name }: { name: string }) {
  return (
    <span className="flex h-6 max-w-36 min-w-0 shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
      <IconUpload aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0">{m.home_frame_uploader()}</span>
      <Avatar
        className="size-4! shrink-0"
        label={m.home_frame_candidate_avatar({ name })}
        seed={`recruiter:${name}`}
        size="sm"
      >
        <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
    </span>
  );
}

// 对齐 StudioListCardAiVerdictBadge：非常推荐用紫色强调，其余沿用语义色。
// Mirrors StudioListCardAiVerdictBadge: violet for highly recommended, semantic colors otherwise.
const VERDICT_BADGE = {
  highly_recommended: {
    className:
      "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-300",
    variant: "default",
  },
  recommended: { className: "", variant: "success" },
  undecided: { className: "", variant: "warning" },
} as const satisfies Record<DemoDeskVerdictLevel, { className: string; variant: string }>;

function ResumeCardVerdictBadge({ record }: { record: ResumeCardData }) {
  const { className, variant } = VERDICT_BADGE[record.level];
  return (
    <Badge className={`shrink-0 ${className}`} title={record.verdict} variant={variant}>
      <IconSparkles aria-hidden="true" />
      {record.verdict}
    </Badge>
  );
}

const FOCUS_POINT_ICON = { matching: IconThumbUp, risk: IconAlertTriangle } as const;
const FOCUS_POINT_VARIANT = { matching: "success", risk: "warning" } as const;

/** 对齐 StudioListCardEvaluationFocus：固定 188px，要点徽标 + 两行结论。 Mirrors the real focus block. */
function ResumeCardEvaluation({ record }: { record: ResumeCardData }) {
  return (
    <div className="mt-3 grid min-w-0 gap-2.5">
      <p className="line-clamp-2 text-[13px] text-foreground leading-[19px] wrap-break-word">
        {record.summary}
      </p>
      <ul className="grid h-[188px] min-w-0 content-start gap-3 overflow-hidden text-[13px] text-foreground leading-[19px]">
        {record.focus.map(({ content, kind, point }) => {
          const Icon = FOCUS_POINT_ICON[kind];
          return (
            <li
              className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-x-4"
              key={point}
            >
              <Badge
                className="max-w-full justify-self-start py-0.5"
                title={point}
                variant={FOCUS_POINT_VARIANT[kind]}
              >
                <Icon aria-hidden="true" />
                <span className="truncate">{point}</span>
              </Badge>
              <p className="line-clamp-2 min-w-0 wrap-break-word">{content}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProfileSnapshotLine({
  emphasized = false,
  line,
}: {
  emphasized?: boolean;
  line: ProfileSnapshotLineData;
}) {
  return (
    <p
      className="flex h-6 min-w-0 items-center gap-2"
      title={`${line.period} · ${line.primary} · ${line.secondary}`}
    >
      <span className="w-[7.25rem] shrink-0 truncate font-mono text-[11px] text-muted-foreground tabular-nums">
        {line.period}
      </span>
      <span
        className={`min-w-0 truncate text-foreground text-sm ${emphasized ? "font-medium" : ""}`}
      >
        {line.primary} · {line.secondary}
      </span>
    </p>
  );
}

/** 对齐 StudioListCardProfileColumn：虚线分隔的右栏，工作在上、教育在下。 Mirrors the real profile column. */
function ResumeCardProfileColumn({ record }: { record: ResumeCardData }) {
  return (
    <div className="col-start-2 row-start-2 min-h-0 min-w-0 overflow-hidden border-border/60 border-l border-dashed pl-8">
      <div className="grid max-w-[30rem] min-w-0 content-start">
        {record.work.map((line, index) => (
          <ProfileSnapshotLine
            emphasized={index === 0}
            key={`${line.period}-${line.primary}`}
            line={line}
          />
        ))}
        <div className="my-1.5 border-border/60 border-t" />
        {record.education.map((line) => (
          <ProfileSnapshotLine key={`${line.period}-${line.primary}`} line={line} />
        ))}
      </div>
    </div>
  );
}

function ResumeCardActions() {
  return (
    <div className="col-start-2 row-start-2 flex min-w-0 items-end justify-end self-end pl-8">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {[
          { icon: IconFileText, label: m.home_frame_resume() },
          { icon: IconEdit, label: m.home_frame_edit() },
          { icon: IconDots, label: m.home_frame_candidate_more() },
        ].map(({ icon: Icon, label }) => (
          <Button className="h-8 gap-1 px-2 text-xs" disabled key={label} size="sm" variant="ghost">
            <Icon className="size-3.5" />
            <span>{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * 对齐真实 ResumeLibraryCard 在 xl 宽度下的槽位布局：标题行横跨两栏；左栏元信息 + 评语 + 要点，
 * 右栏经历，操作贴右下角。演示画布是固定 1440 宽的缩放画布，所以直接写 xl 布局，不用断点。
 * Mirrors the real card's xl slot layout; the demo canvas is a fixed 1440px scaled canvas,
 * so the xl layout is written directly instead of relying on viewport breakpoints.
 */
function ResumeCard({ record }: { record: ResumeCardData }) {
  const demo = useDemo();
  // 只有导览候选人有完整详情页；其他卡片仅用于还原真实列表的密度。
  const openDetail =
    record.id === DEMO_CANDIDATE_ID
      ? () => demo.setCandidate({ id: record.id, pipeline: record.pipeline })
      : undefined;
  return (
    <Card
      className="group/list-card h-full overflow-hidden rounded-lg border-0 bg-transparent shadow-none transition-colors hover:bg-component/60"
      render={<article />}
    >
      <CardPanel className="flex h-full min-h-0 gap-3 p-4">
        <Checkbox
          aria-label={m.home_frame_select_candidate({ name: record.name })}
          className="relative z-20 mt-3"
        />
        <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,46rem)_minmax(18rem,1fr)] grid-rows-[auto_1fr] gap-x-8 gap-y-3">
          <div className="col-span-2 flex min-w-0 items-center gap-3">
            <CandidateAvatar record={record} />
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2 overflow-hidden">
              <button
                className="min-w-16 max-w-full shrink truncate text-left font-semibold text-base leading-5 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground/40"
                data-demo-candidate={record.id}
                onClick={openDetail}
                type="button"
              >
                {record.name}{" "}
                <span className="font-normal text-muted-foreground text-xs">({record.id})</span>
              </button>
              <ResumeCardVerdictBadge record={record} />
              <ResumeLifecycleBadge
                className="shrink-0"
                detailLabel={record.lifecycleDetail}
                fullLabel={`${record.lifecycleStage} · ${record.lifecycleDetail}`}
                onClick={openDetail}
                stageLabel={record.lifecycleStage}
                tone={record.isScreening ? "outline" : "info"}
              />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex h-6 min-w-0 flex-nowrap items-center gap-x-4 overflow-hidden">
              <ResumeCardMetaItem
                icon={<IconBriefcase className="size-3.5" />}
                label={m.home_frame_related_job()}
              >
                {record.job}
              </ResumeCardMetaItem>
              <ResumeCardCreatorMeta name={record.creator} />
              <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap text-muted-foreground text-xs tabular-nums">
                {record.createdAt}
              </span>
            </div>
            <ResumeCardEvaluation record={record} />
          </div>

          <ResumeCardProfileColumn record={record} />
          <ResumeCardActions />
        </div>
      </CardPanel>
    </Card>
  );
}

function ResumeCardList() {
  const demo = useDemo();
  const { desk, stages } = getDemoScreenCopy();
  const scene = {
    "ai-completed": {
      lifecycleDetail: stages.aiCompleted,
      lifecycleStage: stages.aiInterview,
      pipeline: "interview:ai",
    },
    "human-completed": {
      lifecycleDetail: stages.humanPassed,
      lifecycleStage: stages.humanInterview,
      pipeline: "interview:second",
    },
    "human-live": {
      lifecycleDetail: stages.inProgress,
      lifecycleStage: stages.humanInterview,
      pipeline: "interview:second",
    },
    "human-scheduled": {
      lifecycleDetail: stages.scheduled,
      lifecycleStage: stages.humanInterview,
      pipeline: "interview:second",
    },
    invited: {
      lifecycleDetail: stages.invited,
      lifecycleStage: stages.aiInterview,
      pipeline: "interview:ai",
    },
    live: {
      lifecycleDetail: stages.inProgress,
      lifecycleStage: stages.aiInterview,
      pipeline: "interview:ai",
    },
    offer: {
      lifecycleDetail: stages.offerSent,
      lifecycleStage: stages.offer,
      pipeline: "offer:send",
    },
    screening: {
      lifecycleDetail: stages.qualified,
      lifecycleStage: stages.screening,
      pipeline: "screening:pass",
    },
  } satisfies Record<
    DemoPhase,
    { pipeline: ResumeCardData["pipeline"]; lifecycleStage: string; lifecycleDetail: string }
  >;
  const { deskRecords, people } = getDemoScreenCopy();
  const candidates: ResumeCardData[] = [
    {
      ...getDemoResume(),
      ...scene[demo.phase],
    },
    ...DEMO_DESK_RECORDS.map((meta) => {
      const record = deskRecords[meta.id];
      return {
        createdAt: meta.createdAt,
        creator: people.recruiter,
        education: record.education,
        email: `${meta.id}@nerv.example`,
        focus: record.focus,
        group: meta.group,
        id: meta.id,
        isScreening: meta.pipeline.startsWith("screening"),
        job: record.job,
        level: meta.level,
        lifecycleDetail: record.detail,
        lifecycleStage: record.stage,
        name: record.name,
        pipeline: meta.pipeline,
        summary: record.summary,
        verdict: record.verdict,
        work: record.work,
      };
    }),
  ];
  const resumes = candidates.filter((record) => matchesDemoPipeline(record.pipeline, demo.stage));
  const groups = DATE_GROUPS.map((group) => ({
    group,
    records: resumes.filter((record) => record.group === group),
  })).filter(({ records }) => records.length > 0);

  return (
    <div className="flex flex-col gap-1">
      {resumes.length === 0 && (
        <Card>
          <CardPanel className="p-10 text-center text-muted-foreground">{desk.empty}</CardPanel>
        </Card>
      )}
      {groups.map(({ group, records }) => (
        <section aria-labelledby={`demo-date-${group}`} key={group}>
          <h2
            className="flex h-11 items-center gap-2 px-4 font-medium text-sm"
            id={`demo-date-${group}`}
          >
            <span>{desk.dateGroups[group]}</span>
            <span className="font-normal text-muted-foreground text-xs">
              {desk.resumeCount(records.length)}
            </span>
          </h2>
          {/* 对齐真实列表：每行上下 6px，行间一条细分隔线。 Real list rows: 6px padding, hairline dividers. */}
          <div className="grid">
            {records.map((record, index) => (
              <div
                className={
                  index < records.length - 1
                    ? "relative py-1.5 after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border"
                    : "relative py-1.5"
                }
                key={record.id}
              >
                <ResumeCard record={record} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ResumesContent() {
  const demo = useDemo();
  if (demo.phase === "human-live") {
    return (
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <DemoHumanRoom />
      </Suspense>
    );
  }
  if (demo.phase === "live") {
    return (
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <DemoLiveInterview />
      </Suspense>
    );
  }
  if (demo.candidate) {
    return <DemoCandidateDetail key={demo.candidate.id} />;
  }
  // 真实 layout 内层：flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6
  // 真实 ResumeLibraryPage: <div className="space-y-6"> 包 PageHeader + Charts + DataGrid
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader title={m.home_frame_recruitment_desk()} />
      {demo.notice && (
        <output className="flex items-center justify-between rounded-lg bg-muted px-4 py-2 text-sm">
          {demo.notice}
          <Button variant="ghost" size="xs" onClick={() => demo.setNotice("")}>
            {getDemoScreenCopy().desk.close}
          </Button>
        </output>
      )}
      <PipelineStageTabs />
      <div className="flex flex-col gap-4">
        <ResumeToolbar />
        <ResumeCardList />
      </div>
    </div>
  );
}

export function ResumesScreen({ className }: { className?: string }) {
  const breadcrumb: BreadcrumbCrumb[] = [
    { label: "Studio" },
    { current: true, label: m.home_frame_recruitment_desk() },
  ];

  return (
    <DemoProvider>
      <ScreenFrame className={className}>
        <AppShell
          breadcrumb={breadcrumb}
          sidebar={<StudioNav activeLabel={m.home_frame_nav_recruitment()} />}
          tab="studio"
        >
          <ResumesContent />
        </AppShell>
      </ScreenFrame>
    </DemoProvider>
  );
}
