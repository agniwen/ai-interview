// 用途：landing 用「Studio › 简历库」简化版 UI。对齐真实组件：
// - PageHeader: <h1 class="text-2xl"> + <p class="text-muted-foreground text-sm">
// - ResumeLibraryCharts: lg:grid-cols-3, 3 张 Card (CardHeader text-2xl semibold + CardDescription + CardContent)
// - DataGrid: <Card class="overflow-hidden py-0">，Toolbar 在外面 (filters 左 + button 右)
// Purpose: simplified Studio resume library mock, mirroring the real components 1:1.
import { EyeIcon, MoreHorizontalIcon, PencilIcon, SearchIcon, UploadIcon } from "lucide-react";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "简历库" }];

// ─────────────────── shared mini Card ───────────────────
// 真实 ui/card.tsx 是 py-6 gap-6，对应桌面像素；在 landing 的缩放画布里偏高，
// 这里整体收一档 (py-4 gap-3) 让 3 张卡更紧凑、横纵比更协调。
// Real Card uses py-6/gap-6; in our scaled canvas it reads too tall, so we
// tighten to py-4/gap-3 while keeping the same visual structure.
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-border bg-background py-4 shadow-xs ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid auto-rows-min items-start gap-1 px-4">
      <div className="font-semibold text-sm leading-none">{title}</div>
      <div className="text-muted-foreground text-xs">{description}</div>
    </div>
  );
}

function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 ${className ?? ""}`}>{children}</div>;
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
  ai_interview: "var(--chart-2)",
  closed_hired: "oklch(0.65 0.16 150)",
  closed_rejected: "var(--muted-foreground)",
  human_interview: "var(--chart-3)",
  offer: "var(--chart-4)",
  screening: "var(--chart-1)",
};

function StatusCard() {
  const total = PIPELINE_ORDER.reduce((acc, s) => acc + PIPELINE_COUNT[s], 0);
  return (
    <Card>
      <CardHeader description={`共 ${total} 位候选人（不含归档）`} title="面试流程分布" />
      <CardContent className="flex flex-col gap-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
          {PIPELINE_ORDER.map((s, i) => {
            let rad = "";
            if (i === 0) {
              rad = "rounded-l-full";
            } else if (i === PIPELINE_ORDER.length - 1) {
              rad = "rounded-r-full";
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
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {PIPELINE_ORDER.map((s) => (
            <li className="flex items-center gap-1.5" key={s}>
              <span
                aria-hidden="true"
                className="size-2 rounded-sm"
                style={{ backgroundColor: PIPELINE_COLOR[s] }}
              />
              <span className="flex-1 truncate">{PIPELINE_LABEL[s]}</span>
              <span className="tabular-nums">{PIPELINE_COUNT[s]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─────────────────── 近 30 天每日新增 (area chart) ───────────────────
const DAILY_POINTS = [
  2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 6, 5, 4, 7, 8, 6, 5, 7, 9, 8, 6, 7, 10, 9, 8, 11, 12, 10, 9, 12,
];
const DAILY_GREEN = "oklch(0.65 0.16 150)";

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
    <Card>
      <CardHeader description={`合计 ${total} 份`} title="近 30 天每日新增" />
      <CardContent>
        <svg
          aria-hidden="true"
          className="h-20 w-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${w} ${h}`}
        >
          <defs>
            <linearGradient id="resume-daily-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={DAILY_GREEN} stopOpacity={0.4} />
              <stop offset="100%" stopColor={DAILY_GREEN} stopOpacity={0.05} />
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
          <path d={line} fill="none" stroke={DAILY_GREEN} strokeLinecap="round" strokeWidth={2} />
        </svg>
      </CardContent>
    </Card>
  );
}

// ─────────────────── AI 面试转化 (donut) ───────────────────
const CONVERSION_PURPLE = "oklch(0.55 0.18 295)";
const CONVERSION_PURPLE_LIGHT = "oklch(0.82 0.07 295)";

function ConversionCard() {
  const withCount = 38;
  const totalCount = 84;
  const percent = Math.round((withCount / totalCount) * 100);
  const r = 32;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;

  return (
    <Card>
      <CardHeader
        description={`${withCount} / ${totalCount} 已发起（${percent}%）`}
        title="AI 面试转化"
      />
      <CardContent className="flex items-center gap-3">
        <div className="relative grid size-20 shrink-0 place-items-center">
          <svg aria-hidden="true" className="size-20" viewBox="0 0 96 96">
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
          <span className="absolute font-semibold text-foreground text-xs tabular-nums">
            {percent}%
          </span>
        </div>
        <ul className="flex flex-1 flex-col gap-0.5 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-sm"
              style={{ backgroundColor: CONVERSION_PURPLE }}
            />
            <span className="flex-1 truncate">已发起 AI 面试</span>
            <span className="tabular-nums">{withCount}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-sm"
              style={{ backgroundColor: CONVERSION_PURPLE_LIGHT }}
            />
            <span className="flex-1 truncate">仅入库</span>
            <span className="tabular-nums">{totalCount - withCount}</span>
          </li>
        </ul>
      </CardContent>
    </Card>
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
  // 对齐 _components/page-header.tsx: <h1 class="text-2xl"> + <p class="text-muted-foreground text-sm">
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </header>
  );
}

// ─────────────────── DataGrid Toolbar (search filter + 上传简历 button) ───────────────────
function ResumeToolbar() {
  // 真实 Toolbar 布局: flex flex-col gap-3 sm:flex-row sm:items-center
  // Filters 在左（包含 search input），toolbarRight 在右
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-[15rem]">
          <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent pl-9 pr-3 text-muted-foreground text-sm">
            搜索候选人、邮箱、电话、简历名或目标岗位
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm"
          type="button"
        >
          <UploadIcon className="size-4" />
          上传简历
        </button>
      </div>
    </div>
  );
}

// ─────────────────── DataGrid Table inside Card ───────────────────
interface ResumeRow {
  name: string;
  email: string;
  role: string;
  jobLink: string;
  resumeFile: string;
  hasInterview: boolean;
  creator: string;
  createdAt: string;
}

const RESUMES: ResumeRow[] = [
  {
    createdAt: "2025-05-12 14:32",
    creator: "张三",
    email: "li.ming@example.com",
    hasInterview: true,
    jobLink: "资深前端工程师",
    name: "李铭",
    resumeFile: "简历_李铭.pdf",
    role: "资深前端",
  },
  {
    createdAt: "2025-05-11 09:18",
    creator: "李四",
    email: "wang.xin@example.com",
    hasInterview: true,
    jobLink: "增长产品经理",
    name: "王欣",
    resumeFile: "简历_王欣.pdf",
    role: "产品经理",
  },
  {
    createdAt: "2025-05-10 16:05",
    creator: "王五",
    email: "zhao.an@example.com",
    hasInterview: false,
    jobLink: "后端架构师",
    name: "赵安",
    resumeFile: "简历_赵安.pdf",
    role: "后端架构",
  },
  {
    createdAt: "2025-05-10 11:24",
    creator: "张三",
    email: "chen.jia@example.com",
    hasInterview: true,
    jobLink: "数据分析师",
    name: "陈佳",
    resumeFile: "简历_陈佳.pdf",
    role: "数据分析",
  },
  {
    createdAt: "2025-05-09 17:42",
    creator: "孙七",
    email: "liu.yi@example.com",
    hasInterview: false,
    jobLink: "UI 设计师",
    name: "刘一",
    resumeFile: "简历_刘一.pdf",
    role: "UI 设计",
  },
  {
    createdAt: "2025-05-09 10:08",
    creator: "李四",
    email: "zhou.bin@example.com",
    hasInterview: false,
    jobLink: "—",
    name: "周斌",
    resumeFile: "简历_周斌.pdf",
    role: "运营",
  },
];

function ResumeTable() {
  // 真实 DataGrid 外层是 <Card className="overflow-hidden py-0">
  // 真实 Table 使用 shadcn Table 组件，TableHead 用 text-muted-foreground h-10 px-2 text-left text-sm
  // TableCell px-2 py-2 text-sm
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-xs">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border border-b bg-muted/40">
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">
              <span className="size-4 rounded-[3px] border border-foreground/30 inline-block" />
            </th>
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">候选人</th>
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">目标岗位</th>
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">关联岗位</th>
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">简历文件</th>
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">AI 面试</th>
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">创建人</th>
            <th className="h-10 px-3 text-left font-medium text-muted-foreground">创建时间</th>
            <th className="h-10 px-3 text-right font-medium text-muted-foreground" />
          </tr>
        </thead>
        <tbody>
          {RESUMES.map((r) => (
            <tr className="border-border border-b last:border-b-0 hover:bg-muted/30" key={r.name}>
              <td className="px-3 py-2.5">
                <span className="inline-block size-4 rounded-[3px] border border-foreground/30" />
              </td>
              <td className="px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground underline-offset-4 hover:underline">
                    {r.name}
                  </div>
                  <div className="truncate text-muted-foreground text-xs underline-offset-4 hover:underline">
                    {r.email}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">{r.role}</td>
              <td className="px-3 py-2.5 underline-offset-4 hover:underline">{r.jobLink}</td>
              <td className="px-3 py-2.5">
                <span className="truncate underline-offset-4 hover:underline">{r.resumeFile}</span>
              </td>
              <td className="px-3 py-2.5">
                {r.hasInterview ? (
                  // 真实 Badge variant="success": 绿色填充
                  <span className="inline-flex items-center rounded-md border border-transparent bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-700 text-xs dark:text-emerald-300">
                    已发起
                  </span>
                ) : (
                  // 真实 Badge variant="outline": 透明 + 边框
                  <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 font-medium text-foreground text-xs">
                    未发起
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-full bg-gradient-to-br from-sky-400/70 to-indigo-500/70" />
                  <span>{r.creator}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{r.createdAt}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-0.5">
                  <span className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent">
                    <EyeIcon className="size-4" />
                  </span>
                  <span className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent">
                    <PencilIcon className="size-4" />
                  </span>
                  <span className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent">
                    <MoreHorizontalIcon className="size-4" />
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResumesContent() {
  // 真实 layout 内层：flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6
  // 真实 ResumeLibraryPage: <div className="space-y-6"> 包 PageHeader + Charts + DataGrid
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        description="集中管理所有候选人简历。在这里上传 PDF 不会自动生成面试题，需要时再发起 AI 面试。"
        title="简历库"
      />
      <ChartsRow />
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
      <AppShell breadcrumb={BREADCRUMB} sidebar={<StudioNav activeLabel="简历库" />} tab="studio">
        <ResumesContent />
      </AppShell>
    </ScreenFrame>
  );
}
