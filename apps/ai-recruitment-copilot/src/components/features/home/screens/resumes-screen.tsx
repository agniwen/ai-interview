import {
  IconBriefcase,
  IconChevronDown,
  IconDots,
  IconEdit,
  IconFileText,
  IconFilterX,
  IconInfoCircle,
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

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResumeLifecycleBadge } from "@/components/features/studio/resumes/resume-lifecycle-badge";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "招聘台" }];

interface MetricItem {
  label: string;
  value: string;
}

function ChartCardShell({
  title,
  description,
  metrics,
  children,
}: {
  title: string;
  description?: string;
  metrics: [MetricItem, MetricItem];
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full gap-0 overflow-hidden rounded-xl py-0">
      <div className="grid border-b sm:h-22 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(5.75rem,7rem))]">
        <CardHeader className="min-w-0 gap-1 p-4 sm:p-5">
          <CardTitle className="truncate text-base">{title}</CardTitle>
          {description ? (
            <CardDescription className="truncate">{description}</CardDescription>
          ) : null}
        </CardHeader>
        {metrics.map((metric) => (
          <div
            className="flex flex-col justify-center border-t px-4 py-3 sm:border-t-0 sm:border-l sm:px-5"
            key={metric.label}
          >
            <div className="truncate text-muted-foreground text-xs">{metric.label}</div>
            <div className="mt-1 font-mono font-semibold text-2xl leading-none tabular-nums">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

// ─────────────────── 面试流程分布 (stacked horizontal bar) ───────────────────
// 对齐生产 ResumeLibraryCharts.StatusCard：6 桶漏斗 = screening / ai_interview /
// human_interview / offer / closed_hired / closed_rejected。颜色 / label 与
// resume-library-charts.tsx 的 BUCKET_LABEL / BUCKET_COLORS 一致。
// Mirrors the production StatusCard: 6-bucket funnel matching the real chart's
// labels and colors verbatim.
const PIPELINE_ORDER = [
  "screening",
  "ai_interview",
  "human_interview",
  "offer",
  "closed_hired",
  "closed_rejected",
] as const;
const PIPELINE_LABEL = {
  ai_interview: "AI 面试",
  closed_hired: "已录用",
  closed_rejected: "已淘汰 / 撤回",
  human_interview: "真人复面",
  offer: "Offer",
  screening: "简历筛选",
} satisfies Record<(typeof PIPELINE_ORDER)[number], string>;
const PIPELINE_COUNT = {
  ai_interview: 18,
  closed_hired: 4,
  closed_rejected: 19,
  human_interview: 10,
  offer: 5,
  screening: 28,
} satisfies Record<(typeof PIPELINE_ORDER)[number], number>;
const PIPELINE_COLOR = {
  ai_interview: "var(--pipeline-ai-interview)",
  closed_hired: "var(--pipeline-closed-hired)",
  closed_rejected: "var(--pipeline-closed-rejected)",
  human_interview: "var(--pipeline-human-interview)",
  offer: "var(--pipeline-offer)",
  screening: "var(--pipeline-screening)",
} satisfies Record<(typeof PIPELINE_ORDER)[number], string>;

function StatusCard() {
  const total = PIPELINE_ORDER.reduce((acc, s) => acc + PIPELINE_COUNT[s], 0);
  const active =
    PIPELINE_COUNT.screening +
    PIPELINE_COUNT.ai_interview +
    PIPELINE_COUNT.human_interview +
    PIPELINE_COUNT.offer;
  return (
    <ChartCardShell
      description="不含归档候选人"
      metrics={[
        { label: "总候选", value: String(total) },
        { label: "推进中", value: String(active) },
      ]}
      title="面试流程分布"
    >
      <div className="flex flex-col gap-3">
        <div className="flex h-16 items-center">
          <div className="flex h-4 w-full overflow-hidden rounded-sm bg-muted/40">
            {PIPELINE_ORDER.map((s, i) => {
              let rad = "";
              if (i === 0) {
                rad = "rounded-l";
              } else if (i === PIPELINE_ORDER.length - 1) {
                rad = "rounded-r";
              }
              return (
                <span
                  className={rad}
                  key={s}
                  style={{
                    backgroundColor: PIPELINE_COLOR[s],
                    width: `${(PIPELINE_COUNT[s] / total) * 100}%`,
                  }}
                />
              );
            })}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground text-xs">
          {PIPELINE_ORDER.map((s) => (
            <li className="flex items-center gap-2" key={s}>
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: PIPELINE_COLOR[s] }}
              />
              <span className="flex-1 truncate">{PIPELINE_LABEL[s]}</span>
              <span className="tabular-nums">{PIPELINE_COUNT[s]}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCardShell>
  );
}

// ─────────────────── 近一年入库日历 (current contribution heatmap) ───────────────────
const CALENDAR_LEVEL_COLORS = [
  "color-mix(in oklab, var(--muted-foreground) 14%, var(--background))",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
] as const;
const CALENDAR_LEVELS = Array.from({ length: 27 * 7 }, (_, index) => {
  if (index % 29 === 0 || index % 41 === 0) {
    return 4;
  }
  if (index % 11 === 0 || index % 17 === 0) {
    return 3;
  }
  if (index % 5 === 0) {
    return 2;
  }
  if (index % 3 === 0) {
    return 1;
  }
  return 0;
});

function DailyAddedCard() {
  return (
    <ChartCardShell
      metrics={[
        { label: "一年新增", value: "188" },
        { label: "单日峰值", value: "12" },
      ]}
      title="入库日历"
    >
      <div className="flex h-36 flex-col gap-2 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <div
            className="grid w-max gap-0.5"
            style={{
              gridAutoColumns: 12,
              gridAutoFlow: "column",
              gridTemplateRows: "repeat(7, 12px)",
            }}
          >
            {CALENDAR_LEVELS.map((level, index) => (
              <span
                aria-hidden="true"
                className="size-3 rounded-[2px]"
                // The contribution cells are a stable, decorative time series.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                style={{ backgroundColor: CALENDAR_LEVEL_COLORS[level] }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between px-1 text-muted-foreground text-[10px]">
            <span>3月</span>
            <span>4月</span>
            <span>5月</span>
            <span>6月</span>
            <span>7月</span>
            <span>8月</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 text-muted-foreground text-[10px]">
          <span>少</span>
          {CALENDAR_LEVEL_COLORS.map((color) => (
            <span
              aria-hidden="true"
              className="size-3 rounded-[2px]"
              key={color}
              style={{ backgroundColor: color }}
            />
          ))}
          <span>多</span>
        </div>
      </div>
    </ChartCardShell>
  );
}

// ─────────────────── AI 面试转化 (donut) ───────────────────
const CONVERSION_PURPLE = "oklch(0.68 0.09 295)";
const CONVERSION_PURPLE_LIGHT = "oklch(0.9 0.035 295)";

function ConversionCard() {
  const withCount = 38;
  const totalCount = 84;
  const percent = Math.round((withCount / totalCount) * 100);
  const r = 32;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;

  return (
    <ChartCardShell
      description="已发起 AI 面试 / 入库候选人"
      metrics={[
        { label: "转化率", value: `${percent}%` },
        { label: "已发起", value: String(withCount) },
      ]}
      title="AI 面试转化"
    >
      <div className="grid min-h-36 grid-cols-[minmax(7.5rem,9rem)_9rem] items-center justify-center gap-3">
        <ul className="flex flex-1 flex-col gap-2 text-muted-foreground text-xs">
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: CONVERSION_PURPLE }}
            />
            <span className="flex-1 truncate">已发起 AI 面试</span>
            <span className="tabular-nums">{withCount}</span>
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: CONVERSION_PURPLE_LIGHT }}
            />
            <span className="flex-1 truncate">仅入库</span>
            <span className="tabular-nums">{totalCount - withCount}</span>
          </li>
        </ul>
        <div className="relative grid size-36 shrink-0 place-items-center">
          <svg aria-hidden="true" className="size-36" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              fill="none"
              r={r}
              stroke={CONVERSION_PURPLE_LIGHT}
              strokeWidth="14"
            />
            <circle
              cx="48"
              cy="48"
              fill="none"
              r={r}
              stroke={CONVERSION_PURPLE}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={c / 4}
              strokeWidth="14"
              transform="rotate(-90 48 48)"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className="font-mono font-semibold text-2xl tabular-nums">{percent}%</span>
            <span className="text-muted-foreground text-[10px]">转化率</span>
          </div>
        </div>
      </div>
    </ChartCardShell>
  );
}

function ChartsRow() {
  // 对齐 ResumeLibraryCharts: grid gap-4 lg:grid-cols-3
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatusCard />
      <DailyAddedCard />
      <ConversionCard />
    </div>
  );
}

// ─────────────────── PageHeader ───────────────────
function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 w-full">
        <h1 className="min-w-0 text-2xl tracking-tight">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button className="opacity-80" size="xs" type="button" variant="ghost">
          切换个人维度
        </Button>
        <Button aria-label="刷新招聘指标" size="icon-xs" type="button" variant="ghost">
          <IconRefresh />
        </Button>
      </div>
    </header>
  );
}

// ─────────────────── Pipeline stage tabs ───────────────────
const PIPELINE_TABS = [
  { label: "全部", value: "all" },
  { label: "简历筛选", value: "screening" },
  { label: "AI 面试", value: "ai_interview" },
  { label: "真人复面", value: "human_interview" },
  { label: "Offer", value: "offer" },
  { label: "已结案", value: "closed" },
] as const;

function PipelineStageTabs() {
  return (
    <Tabs value="all">
      <TabsList className="grid h-auto w-full grid-cols-2 items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-nowrap">
        {PIPELINE_TABS.map((tab) => (
          <TabsTrigger
            className="h-10! w-full px-3 sm:w-auto sm:px-8"
            key={tab.value}
            value={tab.value}
          >
            <span className="text-sm leading-tight">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// ─────────────────── DataGrid Toolbar (search filter + 上传简历 button) ───────────────────
function FilterSelectChip({ label }: { label: string }) {
  return (
    <span className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm sm:w-auto sm:min-w-45">
      <span className="truncate text-muted-foreground">{label}</span>
      <IconChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
    </span>
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
  return (
    <Button
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
  // 真实 Toolbar 布局: flex flex-col gap-3 sm:flex-row sm:items-center
  // Filters 与 toolbarRight 同一个 flex row 顺序排列，不做左右分栏。
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[15rem]">
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-background pr-9 pl-9 text-muted-foreground text-sm">
            搜索候选人、邮箱、电话、简历名或目标岗位
          </div>
        </div>
        <FilterSelectChip label="按技能筛选（需同时具备）" />
        <FilterSelectChip label="按关联岗位筛选" />
      </div>
      <div className="flex min-w-fit shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <ToolbarIconButton label="刷新">
          <IconRefresh />
        </ToolbarIconButton>
        <ToolbarIconButton disabled label="重置筛选">
          <IconFilterX />
        </ToolbarIconButton>
        <Button type="button">
          <IconPlus />
          创建招聘记录
        </Button>
      </div>
    </div>
  );
}

// ─────────────────── Current card list ───────────────────
interface ResumeCardData {
  canLaunchInterview: boolean;
  createdAt: string;
  creator: string;
  education: ProfileSnapshotLineData[];
  email: string;
  id: string;
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
    creator: "张三",
    education: [{ period: "2013–2017", primary: "浙江大学", secondary: "计算机科学" }],
    email: "li.ming@example.com",
    id: "01842",
    job: "技术部 / 资深前端工程师",
    lifecycleDetail: "1/2 待下轮",
    lifecycleStage: "AI 面试",
    name: "李铭",
    score: "推荐 · 86 分",
    scoreTone: "success",
    skills: ["React", "TypeScript", "微前端", "性能优化"],
    summary: "8 年前端经验，主导过中大型架构升级；技术深度与岗位核心要求匹配。",
    work: [
      { period: "2021–至今", primary: "字节跳动", secondary: "高级前端工程师" },
      { period: "2017–2021", primary: "网易", secondary: "前端工程师" },
    ],
  },
  {
    canLaunchInterview: false,
    createdAt: "2025-05-11 09:18",
    creator: "李四",
    education: [{ period: "2012–2016", primary: "武汉大学", secondary: "工商管理" }],
    email: "wang.xin@example.com",
    id: "01831",
    job: "产品部 / 增长产品经理",
    lifecycleDetail: "1/2 已安排",
    lifecycleStage: "真人复面",
    name: "王欣",
    score: "推荐 · 81 分",
    scoreTone: "success",
    skills: ["增长实验", "商业化", "数据分析"],
    summary: "具备完整增长闭环经验，实验设计能力突出；需要进一步确认团队管理范围。",
    work: [
      { period: "2020–至今", primary: "小红书", secondary: "增长产品负责人" },
      { period: "2016–2020", primary: "美团", secondary: "产品经理" },
    ],
  },
  {
    canLaunchInterview: true,
    createdAt: "2025-05-10 16:05",
    creator: "王五",
    education: [{ period: "2009–2013", primary: "华中科技大学", secondary: "软件工程" }],
    email: "zhao.an@example.com",
    id: "01819",
    job: "技术部 / 后端架构师",
    lifecycleDetail: "待处理",
    lifecycleStage: "简历筛选",
    name: "赵安",
    score: "匹配 · 72 分",
    scoreTone: "warning",
    skills: ["Java", "分布式系统", "PostgreSQL"],
    summary: "基础架构经验扎实，但简历中缺少大型团队协作与关键稳定性指标。",
    work: [
      { period: "2019–至今", primary: "携程", secondary: "后端架构师" },
      { period: "2013–2019", primary: "阿里云", secondary: "高级开发工程师" },
    ],
  },
];

function CandidateAvatar({ record }: { record: ResumeCardData }) {
  const seed = [record.name, record.email].filter(Boolean).join(" ") || record.id;

  return (
    <Avatar
      className="mt-0.5 size-12"
      generatedSize={48}
      label={`${record.name}的头像`}
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
      <span className="shrink-0">上传人</span>
      <Avatar
        className="size-4! shrink-0"
        generatedSize={16}
        label={`${name}的头像`}
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
    <div className="hidden min-w-0 border-border/60 border-l border-dashed pl-8 2xl:block">
      <div className="grid min-w-0 content-start gap-1 text-sm 2xl:max-w-sm">
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

const CARD_ACTIONS = [
  { icon: IconFileText, label: "简历" },
  { icon: IconEdit, label: "编辑" },
  { icon: IconDots, label: "更多" },
] as const;

function ResumeCardActions({ record }: { record: ResumeCardData }) {
  const actions = record.canLaunchInterview
    ? [CARD_ACTIONS[0], CARD_ACTIONS[1], { icon: IconSparkles, label: "AI面" }, CARD_ACTIONS[2]]
    : CARD_ACTIONS;

  return (
    <div className="flex justify-end self-center">
      <div className="flex items-center justify-end gap-1.5 xl:flex-col xl:items-stretch">
        {actions.map(({ icon: Icon, label }) => (
          <span
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs"
            key={label}
          >
            <Icon className="size-3.5" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResumeCardList() {
  return (
    <div className="grid gap-3">
      {RESUMES.map((record) => (
        <Card
          className="h-full overflow-hidden rounded-xl dark:bg-background"
          key={record.id}
          render={<article />}
        >
          <CardPanel className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="flex min-w-0 gap-3">
              <Checkbox aria-label={`选择 ${record.name}`} className="relative z-20 mt-3" />
              <CandidateAvatar record={record} />
              <div className="min-w-0 flex-1">
                <div className="grid min-w-0 gap-x-4 gap-y-3 2xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] 2xl:gap-x-8">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 xl:col-span-2">
                    <span className="min-w-0 truncate font-semibold text-base underline decoration-transparent underline-offset-4">
                      {record.name}{" "}
                      <span className="font-normal text-muted-foreground/60 text-xs">
                        ({record.id})
                      </span>
                    </span>
                    <ResumeLifecycleBadge
                      detailLabel={record.lifecycleDetail}
                      fullLabel={`${record.lifecycleStage} · ${record.lifecycleDetail}`}
                      stageLabel={record.lifecycleStage}
                      tone={record.lifecycleStage === "简历筛选" ? "outline" : "info"}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                      <ResumeCardMetaItem
                        icon={<IconBriefcase className="size-3.5" />}
                        label="关联岗位"
                      >
                        <span className="text-foreground underline decoration-transparent underline-offset-2">
                          {record.job}
                        </span>
                      </ResumeCardMetaItem>
                      <ResumeCardCreatorMeta name={record.creator} />
                      <span className="inline-flex min-h-6 min-w-0 items-center text-muted-foreground text-xs tabular-nums">
                        {record.createdAt}
                      </span>
                      <span className="inline-flex min-h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs 2xl:hidden">
                        <IconInfoCircle
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground/70"
                        />
                        更多
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
                      {record.summary}
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
            <ResumeCardActions record={record} />
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function ResumesContent() {
  // 真实 layout 内层：flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6
  // 真实 ResumeLibraryPage: <div className="space-y-6"> 包 PageHeader + Charts + DataGrid
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader title="招聘台" />
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
  return (
    <ScreenFrame className={className}>
      <AppShell breadcrumb={BREADCRUMB} sidebar={<StudioNav activeLabel="招聘" />} tab="studio">
        <ResumesContent />
      </AppShell>
    </ScreenFrame>
  );
}
