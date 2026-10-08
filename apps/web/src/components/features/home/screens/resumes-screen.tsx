"use client";

import { ResumeLibraryCharts } from "@/components/features/studio/resumes/resume-library-charts";
import { createDemoMetrics } from "./demo-metrics";
import { DemoCandidateDetail } from "./demo-candidate-detail";

/* oxlint-disable max-lines -- Recruitment chart, tabs and card mirror the production desk within a standalone demo. */
import {
  IconBriefcase,
  IconDots,
  IconEdit,
  IconFileText,
  IconFilterX,
  IconFilterPlus,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconUpload,
} from "@tabler/icons-react";
// 用途：landing 用「Studio › 招聘台」简化版 UI。对齐真实组件：
// - PageHeader: <h1 class="text-2xl"> + view switch / refresh actions
// - ResumeLibraryCharts: 3 张 shadcn chart card，顶部含指标分栏
// - ResumeLibraryCardList: Toolbar + 当前候选人卡片结构
// Purpose: simplified Studio resume library mock, mirroring the real components 1:1.

import type { ResumeProfile } from "@app/db-schema/interview/types";
import { lazy, Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
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
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const DemoHumanRoom = lazy(() => import("./demo-human-room"));
const DemoLiveInterview = lazy(() => import("./demo-live-interview"));

function ChartsRow() {
  const demo = useDemo();
  const [metrics] = useState(() => ({
    personal: createDemoMetrics(true),
    team: createDemoMetrics(false),
  }));
  return (
    <div className="[&>div]:grid-cols-3">
      <ResumeLibraryCharts
        metrics={demo.personal ? metrics.personal : metrics.team}
        onRefresh={() => {
          demo.setNotice("统计数据已刷新");
          return Promise.resolve();
        }}
      />
    </div>
  );
}

// ─────────────────── PageHeader ───────────────────
function PageHeader({ title }: { title: string }) {
  const demo = useDemo();
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 w-full">
        <h1 className="min-w-0 text-2xl tracking-tight">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          className="opacity-80 hover:opacity-100"
          size="xs"
          type="button"
          variant="ghost"
          onClick={() => demo.setPersonal(!demo.personal)}
        >
          {demo.personal ? "切换到团队维度" : m.home_frame_personal_view()}
        </Button>
      </div>
    </header>
  );
}

// ─────────────────── Pipeline stage tabs ───────────────────
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
        <TabsList aria-label={copy.stages} className="w-fit">
          {recruitingBoardGroups.map((tab) => (
            <TabsTrigger
              data-demo-group={tab.id}
              className="h-10! px-7 text-sm"
              key={tab.id}
              value={tab.id}
            >
              {localizeBoardLabel(tab.label)}
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

// ─────────────────── DataGrid Toolbar (search filter + 上传简历 button) ───────────────────
function FilterSelectChip({ label, options }: { label: string; options: string[] }) {
  const demo = useDemo();
  return (
    <select
      aria-label={label}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      value={options.includes(demo.filter) ? demo.filter : ""}
      onChange={(event) => demo.setFilter(event.target.value)}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function ToolbarIconButton({
  children,
  disabled,
  label,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
}) {
  const demo = useDemo();
  return (
    <Button
      onClick={() => {
        if (label === m.home_frame_reset_filters()) {
          demo.setFilter("");
          demo.setQuery("");
        } else {
          demo.setNotice("候选人列表已刷新");
        }
      }}
      aria-label={label}
      className="shrink-0"
      disabled={disabled}
      size="icon"
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  );
}

function ResumeToolbar() {
  const demo = useDemo();
  // 真实 Toolbar 布局: flex flex-col gap-3 sm:flex-row sm:items-center
  // Filters 与 toolbarRight 同一个 flex row 顺序排列，不做左右分栏。
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[15rem]">
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label={m.home_frame_search_placeholder()}
            className="pl-9"
            placeholder={m.home_frame_search_placeholder()}
            value={demo.query}
            onChange={(event) => demo.setQuery(event.target.value)}
          />
        </div>
        <FilterSelectChip
          label={m.home_frame_skill_filter()}
          options={["React", "TypeScript", "Java", "PostgreSQL"]}
        />
        <FilterSelectChip
          label={m.home_frame_job_filter()}
          options={["技术部 / 资深前端工程师", "产品部 / 增长产品经理", "技术部 / 后端架构师"]}
        />
        <Button type="button" variant="outline" disabled>
          <IconFilterPlus data-icon="inline-start" />
          {getHomeDeskCopy().addFilter}
        </Button>
      </div>
      <div className="flex min-w-fit shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <ToolbarIconButton label={m.home_frame_refresh()}>
          <IconRefresh />
        </ToolbarIconButton>
        <ToolbarIconButton
          disabled={!demo.filter && !demo.query}
          label={m.home_frame_reset_filters()}
        >
          <IconFilterX />
        </ToolbarIconButton>
        <Button type="button" disabled>
          <IconPlus />
          {m.home_frame_create_record()}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────── Current card list ───────────────────
interface ResumeCardData {
  pipeline: Exclude<RecruitingBoardStageView, `${string}:all`>;
  progress?: string;
  canLaunchInterview: boolean;
  createdAt: string;
  creator: string;
  education: ProfileSnapshotLineData[];
  email: string;
  id: string;
  isScreening: boolean;
  job: string;
  lifecycleDetail: string;
  lifecycleStage: string;
  name: string;
  score: string;
  scoreTone: "success" | "warning";
  skills: string[];
  summary: string;
  work: ProfileSnapshotLineData[];
}

interface ProfileSnapshotLineData {
  period: string;
  primary: string;
  secondary: string;
}

const RESUMES: ResumeCardData[] = [
  {
    canLaunchInterview: false,
    createdAt: "2025-05-12 14:32",
    creator: "葛城美里",
    education: [{ period: "2013–2017", primary: "浙江大学", secondary: "计算机科学" }],
    email: "shinji@example.com",
    id: "01842",
    isScreening: false,
    job: "技术部 / 资深前端工程师",
    lifecycleDetail: "1/2 待下轮",
    lifecycleStage: "AI 面试",
    name: "真嗣",
    pipeline: "interview:ai",
    score: "推荐 · 86 分",
    scoreTone: "success",
    skills: ["React", "TypeScript", "微前端", "性能优化"],
    summary: "8 年前端经验，主导过中大型架构升级；技术深度与岗位核心要求匹配。",
    work: [
      { period: "2021–至今", primary: "字节跳动", secondary: "高级前端工程师" },
      { period: "2017–2021", primary: "网易", secondary: "前端工程师" },
    ],
  },
];

function getLocalizedResumes(): ResumeCardData[] {
  return RESUMES;
}

function CandidateAvatar({ record }: { record: ResumeCardData }) {
  const seed = [record.name, record.email].filter(Boolean).join(" ") || record.id;

  return (
    <Avatar
      className="mt-0.5 size-12"
      generatedSize={48}
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
    <span className="flex min-h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <span aria-hidden="true" className="inline-flex shrink-0 text-muted-foreground/70">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </span>
  );
}

function ResumeCardCreatorMeta({ name }: { name: string }) {
  return (
    <span className="flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <IconUpload aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="shrink-0">{m.home_frame_uploader()}</span>
      <Avatar
        className="size-4! shrink-0"
        generatedSize={16}
        label={m.home_frame_candidate_avatar({ name })}
        seed={`recruiter:${name}`}
        size="sm"
      >
        <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

function ProfileSnapshotLine({ line }: { line: ProfileSnapshotLineData }) {
  return (
    <p
      className="flex min-w-0 items-baseline gap-2"
      title={`${line.period} · ${line.primary} · ${line.secondary}`}
    >
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{line.period}</span>
      <span className="min-w-0 truncate text-foreground text-sm">
        {line.primary} · {line.secondary}
      </span>
    </p>
  );
}

function ResumeCardProfileSnapshot({ record }: { record: ResumeCardData }) {
  return (
    <div className="block min-w-0 border-border/60 border-l border-dashed pl-8">
      <div className="grid min-w-0 content-start gap-1 text-sm max-w-sm">
        {record.work.map((line) => (
          <ProfileSnapshotLine key={`${line.period}-${line.primary}`} line={line} />
        ))}
        <div className="my-0.5 border-border/60 border-t" />
        {record.education.map((line) => (
          <ProfileSnapshotLine key={`${line.period}-${line.primary}`} line={line} />
        ))}
      </div>
    </div>
  );
}

function getCandidateRecommendation(score: string) {
  if (score.startsWith("非常推荐")) {
    return "非常推荐";
  }
  if (score.startsWith("不推荐")) {
    return "不推荐";
  }
  if (score.startsWith("推荐")) {
    return "推荐";
  }
  return "待定";
}

function candidateFields(record: ResumeCardData) {
  return [
    { label: "姓名", value: record.name },
    { label: "综合评价", value: getCandidateRecommendation(record.score) },
    { label: "关联岗位", value: record.job },
    { label: "招聘阶段", value: `${record.lifecycleStage} · ${record.lifecycleDetail}` },
    { label: "邮箱", value: record.email },
    { label: "技能", value: record.skills.join(" · ") },
    { label: "经历摘要", value: record.summary },
    { label: "最新进展", value: record.progress ?? "招聘团队已完成材料核对，下一步查看面试证据。" },
  ];
}

function candidateProfile(record: ResumeCardData): ResumeProfile {
  return {
    age: null,
    educationExperiences: record.education.map((entry) => ({
      degree: null,
      educationLevel: null,
      graduationYear: null,
      major: entry.secondary,
      period: entry.period,
      school: entry.primary,
      summary: null,
    })),
    email: record.email,
    gender: null,
    name: record.name,
    personalStrengths: [],
    phone: "138 0000 1842",
    projectExperiences: [],
    schools: record.education.map((entry) => entry.primary),
    skills: record.skills,
    targetRoles: [record.job],
    workExperiences: record.work.map((entry) => ({
      company: entry.primary,
      period: entry.period,
      role: entry.secondary,
      summary: record.summary,
    })),
    workYears: 8,
  };
}

function ResumeCardActions() {
  return (
    <div className="flex flex-col items-stretch gap-1.5 self-center">
      {[
        { icon: IconFileText, label: m.home_frame_resume() },
        { icon: IconEdit, label: m.home_frame_edit() },
        { icon: IconDots, label: m.home_frame_candidate_more() },
      ].map(({ icon: Icon, label }) => (
        <Button variant="ghost" size="sm" className="h-8" disabled key={label}>
          <Icon className="size-3.5" />
          {label}
        </Button>
      ))}
    </div>
  );
}

function ResumeCardList() {
  const demo = useDemo();
  const scene = {
    "ai-completed": {
      lifecycleDetail: "已完成 · 86 分",
      lifecycleStage: "AI 面试",
      pipeline: "interview:ai",
    },
    "human-completed": {
      lifecycleDetail: "已完成 · 通过",
      lifecycleStage: "真人面试",
      pipeline: "interview:second",
    },
    "human-live": {
      lifecycleDetail: "进行中",
      lifecycleStage: "真人面试",
      pipeline: "interview:second",
    },
    "human-scheduled": {
      lifecycleDetail: "已安排",
      lifecycleStage: "真人面试",
      pipeline: "interview:second",
    },
    invited: { lifecycleDetail: "已发起", lifecycleStage: "AI 面试", pipeline: "interview:ai" },
    live: { lifecycleDetail: "进行中", lifecycleStage: "AI 面试", pipeline: "interview:ai" },
    offer: { lifecycleDetail: "已发送", lifecycleStage: "Offer 协商", pipeline: "offer:send" },
    screening: {
      lifecycleDetail: "已合格",
      lifecycleStage: "简历筛选",
      pipeline: "screening:pass",
    },
  } satisfies Record<
    DemoPhase,
    { pipeline: ResumeCardData["pipeline"]; lifecycleStage: string; lifecycleDetail: string }
  >;
  const candidates = getLocalizedResumes().map((record) => ({
    ...record,
    ...scene[demo.phase],
    canLaunchInterview: demo.phase === "screening",
    score: demo.phase === "screening" ? "非常推荐" : "推荐 · 86 分",
  }));
  const resumes = candidates.filter((record) => {
    const text = [record.name, record.email, record.job, ...record.skills].join(" ").toLowerCase();
    return (
      matchesDemoPipeline(record.pipeline, demo.stage) &&
      text.includes(demo.query.toLowerCase()) &&
      text.includes(demo.filter.toLowerCase()) &&
      (!demo.personal || record.creator === candidates[0].creator || record.id === "01842")
    );
  });

  return (
    <div className="grid gap-3">
      {resumes.length === 0 && (
        <Card>
          <CardPanel className="p-10 text-center text-muted-foreground">
            当前条件下没有候选人
          </CardPanel>
        </Card>
      )}
      {resumes.map((record) => (
        <Card
          className="h-full overflow-hidden rounded-xl dark:bg-background"
          key={record.id}
          render={<article />}
        >
          <CardPanel className="grid gap-4 p-4 grid-cols-[minmax(0,1fr)_auto] items-start">
            <div className="flex min-w-0 gap-3">
              <Checkbox
                aria-label={m.home_frame_select_candidate({ name: record.name })}
                className="relative z-20 mt-3"
              />
              <CandidateAvatar record={record} />
              <div className="min-w-0 flex-1">
                <div className="grid min-w-0 gap-x-4 gap-y-3 grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] gap-x-8">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 col-span-2">
                    <button
                      data-demo-candidate={record.id}
                      type="button"
                      onClick={() =>
                        demo.setCandidate({
                          fields: candidateFields(record),
                          id: record.id,
                          pipeline: record.pipeline,
                          profile: candidateProfile(record),
                          title: `${record.name} · 候选人详情`,
                        })
                      }
                      className="min-w-0 truncate font-semibold text-base underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline-ring"
                    >
                      {record.name}{" "}
                      <span className="font-normal text-muted-foreground/60 text-xs">
                        ({record.id})
                      </span>
                    </button>
                    <ResumeLifecycleBadge
                      onClick={() =>
                        demo.setCandidate({
                          fields: candidateFields(record),
                          id: record.id,
                          pipeline: record.pipeline,
                          profile: candidateProfile(record),
                          title: `${record.name} · 招聘流程`,
                        })
                      }
                      detailLabel={record.lifecycleDetail}
                      fullLabel={`${record.lifecycleStage} · ${record.lifecycleDetail}`}
                      stageLabel={record.lifecycleStage}
                      tone={record.isScreening ? "outline" : "info"}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                      <ResumeCardMetaItem
                        icon={<IconBriefcase className="size-3.5" />}
                        label={m.home_frame_related_job()}
                      >
                        <span className="text-foreground underline decoration-transparent underline-offset-2">
                          {record.job}
                        </span>
                      </ResumeCardMetaItem>
                      <ResumeCardCreatorMeta name={record.creator} />
                      <span className="inline-flex min-h-6 min-w-0 items-center text-muted-foreground text-xs tabular-nums">
                        {record.createdAt}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-2 text-muted-foreground text-sm leading-6">
                      <IconSparkles
                        aria-hidden="true"
                        className={`mr-1 inline size-3.5 align-[-2px] ${
                          record.scoreTone === "success"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-700 dark:text-amber-300"
                        }`}
                      />
                      <span
                        className={`font-medium ${
                          record.scoreTone === "success"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {record.score}
                      </span>{" "}
                      {record.progress ?? record.summary}
                    </p>
                    <div className="mt-3 flex max-h-14 flex-wrap gap-1.5 overflow-hidden">
                      {record.skills.map((skill) => (
                        <Badge className="max-w-52 truncate" key={skill} variant="outline">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <ResumeCardProfileSnapshot record={record} />
                </div>
              </div>
            </div>
            <ResumeCardActions />
          </CardPanel>
        </Card>
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
            关闭
          </Button>
        </output>
      )}
      <ChartsRow />
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
