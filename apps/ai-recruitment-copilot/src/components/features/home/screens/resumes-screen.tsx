import {
  IconChevronDown,
  IconChevronRight,
  IconCloudUpload,
  IconFilterX,
  IconPlus,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
// 用途：landing 用「Studio › 招聘台」简化版 UI。对齐真实组件：
// - PageHeader: <h1 class="text-2xl"> + <p class="text-muted-foreground text-sm">
// - ResumeLibraryCharts: 3 张 shadcn chart card，顶部含指标分栏
// - DataGrid: AlignUI table primitives，Toolbar 在外面 (filters 左 + button 右)
// Purpose: simplified Studio resume library mock, mirroring the real components 1:1.

import { PdfFileIcon } from "@/components/features/pdf/pdf-file-icon";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@arc/shared/utils";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "招聘台" }];

// ─────────────────── shared mini Card ───────────────────
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col gap-0 overflow-hidden rounded-xl border border-border bg-background py-0 shadow-xs ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

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
  description: string;
  metrics: [MetricItem, MetricItem];
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="grid border-b sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(5.75rem,7rem))]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="truncate font-semibold text-base leading-none">{title}</div>
          <div className="mt-1 truncate text-muted-foreground text-xs">{description}</div>
        </div>
        {metrics.map((metric) => (
          <div className="border-l px-5 py-3" key={metric.label}>
            <div className="truncate text-muted-foreground text-xs">{metric.label}</div>
            <div className="mt-1 font-mono font-semibold text-2xl leading-none tabular-nums">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4">{children}</div>
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
const PIPELINE_LABEL: Record<(typeof PIPELINE_ORDER)[number], string> = {
  ai_interview: "AI 面试",
  closed_hired: "已录用",
  closed_rejected: "已淘汰 / 撤回",
  human_interview: "真人复面",
  offer: "Offer",
  screening: "简历筛选",
};
const PIPELINE_COUNT: Record<(typeof PIPELINE_ORDER)[number], number> = {
  ai_interview: 18,
  closed_hired: 4,
  closed_rejected: 19,
  human_interview: 10,
  offer: 5,
  screening: 28,
};
const PIPELINE_COLOR: Record<(typeof PIPELINE_ORDER)[number], string> = {
  ai_interview: "color-mix(in oklch, var(--chart-2) 40%, var(--background))",
  closed_hired: "oklch(0.76 0.08 150)",
  closed_rejected: "oklch(0.74 0.11 345)",
  human_interview: "color-mix(in oklch, var(--chart-3) 42%, var(--background))",
  offer: "color-mix(in oklch, var(--chart-4) 52%, var(--background))",
  screening: "color-mix(in oklch, var(--chart-1) 42%, var(--background))",
};

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

// ─────────────────── 近 30 天每日新增 (area chart) ───────────────────
const DAILY_POINTS = [
  2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 6, 5, 4, 7, 8, 6, 5, 7, 9, 8, 6, 7, 10, 9, 8, 11, 12, 10, 9, 12,
];
const DAILY_GREEN = "oklch(0.74 0.08 150)";

function DailyAddedCard() {
  const total = DAILY_POINTS.reduce((acc, v) => acc + v, 0);
  const max = Math.max(...DAILY_POINTS);
  const w = 280;
  const h = 96;
  const step = w / (DAILY_POINTS.length - 1);
  const points = DAILY_POINTS.map((v, i) => [i * step, h - (v / max) * (h - 8) - 4] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <ChartCardShell
      description="展示近 30 天新增趋势"
      metrics={[
        { label: "30 天新增", value: String(total) },
        { label: "单日峰值", value: String(max) },
      ]}
      title="近 30 天每日新增"
    >
      <svg
        aria-hidden="true"
        className="h-32 w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${w} ${h}`}
      >
        <defs>
          <linearGradient id="resume-daily-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={DAILY_GREEN} stopOpacity={0.22} />
            <stop offset="100%" stopColor={DAILY_GREEN} stopOpacity={0.035} />
          </linearGradient>
        </defs>
        {/* CartesianGrid 横线 */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            stroke="currentColor"
            strokeDasharray="2 3"
            strokeWidth="0.5"
            x1="0"
            x2={w}
            y1={h * p}
            y2={h * p}
            className="text-border"
          />
        ))}
        <path d={area} fill="url(#resume-daily-fill)" />
        <path d={line} fill="none" stroke={DAILY_GREEN} strokeLinecap="round" strokeWidth={1.75} />
      </svg>
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
function PageHeader({ title, description }: { title: string; description: string }) {
  // 对齐 components/features/studio/page-header.tsx: <h1 class="text-2xl"> + <p class="text-muted-foreground text-sm">
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </header>
  );
}

// ─────────────────── Pipeline stage tabs ───────────────────
const PIPELINE_TABS = [
  { active: true, helper: "全部候选人", label: "全部" },
  { active: false, helper: "简历筛选中", label: "简历筛选" },
  { active: false, helper: "AI 面试阶段", label: "AI 面试" },
  { active: false, helper: "等候真人复面", label: "真人复面" },
  { active: false, helper: "Offer 协商中", label: "Offer" },
  { active: false, helper: "已结案候选人", label: "已结案" },
];

function PipelineStageTabs() {
  return (
    <div className="inline-flex h-auto w-fit flex-wrap items-stretch rounded-lg bg-muted p-[3px] text-muted-foreground">
      {PIPELINE_TABS.map((tab) => (
        <span
          className={`relative inline-flex h-auto min-w-[8.5rem] flex-col items-start justify-center gap-0.5 rounded-md border border-transparent px-8 py-1.5 font-medium transition-all ${
            tab.active ? "bg-background text-foreground shadow-sm" : "text-foreground/60"
          }`}
          key={tab.label}
        >
          <span className="text-sm leading-tight">{tab.label}</span>
          <span className="text-[11px] font-normal leading-tight text-muted-foreground">
            {tab.helper}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─────────────────── DataGrid Toolbar (search filter + 上传简历 button) ───────────────────
function FilterSelectChip({ label }: { label: string }) {
  return (
    <span className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs sm:w-auto sm:min-w-45">
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
    <span
      aria-label={label}
      aria-disabled={disabled}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground shadow-xs ${
        disabled ? "opacity-45" : ""
      }`}
    >
      {children}
    </span>
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
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-background pr-9 pl-9 text-muted-foreground text-sm shadow-xs">
            搜索候选人、邮箱、电话、简历名或目标岗位
          </div>
        </div>
        <FilterSelectChip label="按技能筛选（需同时具备）" />
        <FilterSelectChip label="按关联岗位筛选" />
      </div>
      <div className="flex min-w-fit shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <ToolbarIconButton label="刷新">
          <IconRefresh className="size-4" />
        </ToolbarIconButton>
        <ToolbarIconButton disabled label="重置筛选">
          <IconFilterX className="size-4" />
        </ToolbarIconButton>
        <div className="flex flex-wrap gap-2">
          <button
            className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 font-medium text-sm shadow-xs"
            type="button"
          >
            <IconCloudUpload className="size-4" />
            批量上传
          </button>
          <button
            className="flex h-9 items-center gap-1.5 rounded-md bg-primary/80 px-3 font-medium text-primary-foreground text-sm shadow-xs"
            type="button"
          >
            <IconPlus className="size-4" />
            新建简历记录
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────── DataGrid Table inside Card ───────────────────
interface ResumeRow {
  createdAt: string;
  creator: string;
  email: string;
  hasPdf: boolean;
  jobDepartment: string;
  jobLink: string;
  lastInterviewAt: string;
  lifecycleDetail: string;
  lifecycleStage: string;
  lifecycleTone: "info" | "outline" | "success" | "warning";
  name: string;
}

const RESUMES: ResumeRow[] = [
  {
    createdAt: "2025-05-12 14:32",
    creator: "张三",
    email: "li.ming@example.com",
    hasPdf: true,
    jobDepartment: "研发部",
    jobLink: "资深前端工程师",
    lastInterviewAt: "2025-05-13 10:30",
    lifecycleDetail: "1/2 待下轮",
    lifecycleStage: "AI 面试",
    lifecycleTone: "info",
    name: "李铭",
  },
  {
    createdAt: "2025-05-11 09:18",
    creator: "李四",
    email: "wang.xin@example.com",
    hasPdf: true,
    jobDepartment: "产品部",
    jobLink: "增长产品经理",
    lastInterviewAt: "2025-05-12 15:00",
    lifecycleDetail: "1/2 已安排",
    lifecycleStage: "真人复面",
    lifecycleTone: "info",
    name: "王欣",
  },
  {
    createdAt: "2025-05-10 16:05",
    creator: "王五",
    email: "zhao.an@example.com",
    hasPdf: false,
    jobDepartment: "研发部",
    jobLink: "后端架构师",
    lastInterviewAt: "—",
    lifecycleDetail: "待处理",
    lifecycleStage: "简历筛选",
    lifecycleTone: "outline",
    name: "赵安",
  },
  {
    createdAt: "2025-05-10 11:24",
    creator: "张三",
    email: "chen.jia@example.com",
    hasPdf: true,
    jobDepartment: "数据部",
    jobLink: "数据分析师",
    lastInterviewAt: "2025-05-11 11:20",
    lifecycleDetail: "草稿",
    lifecycleStage: "Offer",
    lifecycleTone: "outline",
    name: "陈佳",
  },
  {
    createdAt: "2025-05-09 17:42",
    creator: "孙七",
    email: "liu.yi@example.com",
    hasPdf: true,
    jobDepartment: "设计部",
    jobLink: "UI 设计师",
    lastInterviewAt: "—",
    lifecycleDetail: "待处理",
    lifecycleStage: "简历筛选",
    lifecycleTone: "outline",
    name: "刘一",
  },
  {
    createdAt: "2025-05-09 10:08",
    creator: "李四",
    email: "zhou.bin@example.com",
    hasPdf: true,
    jobDepartment: "运营部",
    jobLink: "社群运营专员",
    lastInterviewAt: "2025-05-10 09:30",
    lifecycleDetail: "已淘汰",
    lifecycleStage: "已结案",
    lifecycleTone: "outline",
    name: "周斌",
  },
];

const LIFECYCLE_RING_CLASS: Record<ResumeRow["lifecycleTone"], string> = {
  info: "hover:ring-sky-500/10",
  outline: "hover:ring-muted/70 dark:hover:ring-muted/50",
  success: "hover:ring-emerald-500/10",
  warning: "hover:ring-amber-500/10",
};

function LifecycleBadge({ row }: { row: ResumeRow }) {
  return (
    <Badge
      className={cn(
        "group/lifecycle w-44 max-w-full justify-start text-left transition-shadow duration-200 hover:ring-2",
        LIFECYCLE_RING_CLASS[row.lifecycleTone],
      )}
      render={
        <button
          aria-label={`${row.lifecycleStage}，${row.lifecycleDetail}`}
          title={`${row.lifecycleStage} · ${row.lifecycleDetail}`}
          type="button"
        >
          <span className="shrink-0">{row.lifecycleStage}</span>
          <span aria-hidden="true" className="shrink-0 opacity-45">
            ·
          </span>
          <span className="min-w-0 truncate opacity-75">{row.lifecycleDetail}</span>
          <span
            aria-hidden="true"
            className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border border-current/25 bg-current/10 opacity-70 transition-[transform,background-color,opacity] duration-200 group-hover/lifecycle:scale-110 group-hover/lifecycle:bg-current/15 group-hover/lifecycle:opacity-100"
          >
            <IconChevronRight className="size-3 transition-transform duration-200 group-hover/lifecycle:scale-110" />
          </span>
        </button>
      }
      variant={row.lifecycleTone}
    />
  );
}

function ResumeTable() {
  return (
    <Table className="table-fixed" variant="card">
      <TableHeader>
        <TableRow>
          <TableHead aria-label="选择" className="w-12">
            <span
              aria-hidden="true"
              className="size-4 rounded-[3px] border border-foreground/30 inline-block"
            />
          </TableHead>
          <TableHead className="w-[260px]">候选人</TableHead>
          <TableHead className="w-[230px]">关联岗位</TableHead>
          <TableHead className="w-[220px]">当前环节</TableHead>
          <TableHead className="w-[150px]">创建人</TableHead>
          <TableHead className="w-[170px]">创建时间</TableHead>
          <TableHead className="w-[170px]">最近面试时间</TableHead>
          <TableHead aria-label="操作" className="w-[170px] text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {RESUMES.map((r) => (
          <TableRow key={r.name}>
            <TableCell aria-label="选择简历">
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-[3px] border border-foreground/30"
              />
            </TableCell>
            <TableCell aria-label={`候选人：${r.name}`}>
              <div className="flex min-w-0 items-start gap-2">
                {r.hasPdf ? (
                  <span
                    aria-label="查看简历 PDF"
                    className="group/pdf mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                  >
                    <PdfFileIcon className="size-8 opacity-80 transition-transform duration-200 group-hover/pdf:scale-105" />
                  </span>
                ) : (
                  <span
                    aria-disabled="true"
                    aria-label="暂无简历 PDF"
                    className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
                  >
                    <PdfFileIcon className="size-8" />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60">
                    {r.name}
                  </div>
                  <div className="truncate text-muted-foreground text-xs underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60">
                    {r.email}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span className="block truncate underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60">
                {r.jobDepartment} / {r.jobLink}
              </span>
            </TableCell>
            <TableCell>
              <LifecycleBadge row={r} />
            </TableCell>
            <TableCell aria-label={`创建人：${r.creator}`}>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-5 rounded-full bg-gradient-to-br from-primary/15 to-primary/30"
                />
                <span>{r.creator}</span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{r.createdAt}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {r.lastInterviewAt}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-0.5">
                <span
                  aria-label="查看简历"
                  className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs hover:bg-accent"
                >
                  查看
                </span>
                <span
                  aria-label="编辑简历"
                  className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs hover:bg-accent"
                >
                  编辑
                </span>
                <span
                  aria-label="更多简历操作"
                  className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs hover:bg-accent"
                >
                  更多
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResumesContent() {
  // 真实 layout 内层：flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6
  // 真实 ResumeLibraryPage: <div className="space-y-6"> 包 PageHeader + Charts + DataGrid
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        description="已经进入招聘流程的候选人在这里跟进：看简历、匹配岗位、推进到面试。"
        title="招聘台"
      />
      <ChartsRow />
      <PipelineStageTabs />
      <div className="space-y-4">
        <ResumeToolbar />
        <ResumeTable />
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
