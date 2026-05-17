// 用途：landing 用「简历库」简化版 UI（Studio › 简历库），对齐真实 ResumeLibraryPage
// 结构：PageHeader + 3 张统计图 + 含 toolbar 的 DataGrid。
// Purpose: simplified UI of the Studio resume library landing card; mirrors
// the real ResumeLibraryPage: PageHeader + 3 metric charts + DataGrid toolbar.
import { EyeIcon, MoreHorizontalIcon, PencilIcon, SearchIcon, UploadIcon } from "lucide-react";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "简历库" }];

function StatusBar() {
  // 简历状态分布：4 段堆叠 bar
  // Resume status distribution — 4-segment stacked bar
  const segments = [
    { color: "var(--chart-1)", label: "草稿", value: 18 },
    { color: "var(--chart-2)", label: "待开始", value: 22 },
    { color: "var(--chart-3)", label: "进行中", value: 14 },
    { color: "var(--chart-4)", label: "已完成", value: 30 },
  ];
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  return (
    <div className="flex h-full flex-col justify-between gap-3 p-4">
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[13px]">简历状态分布</div>
        <div className="text-[11px] text-muted-foreground">共 {total} 份（不含归档）</div>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
        {segments.map((s, i) => {
          let radius = "";
          if (i === 0) {
            radius = "rounded-l-full";
          } else if (i === segments.length - 1) {
            radius = "rounded-r-full";
          }
          return (
            <span
              className={radius}
              key={s.label}
              style={{
                backgroundColor: s.color,
                width: `${(s.value / total) * 100}%`,
              }}
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {segments.map((s) => (
          <li className="flex items-center gap-1.5" key={s.label}>
            <span
              aria-hidden="true"
              className="size-2 rounded-[3px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="tabular-nums text-foreground/80">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DAILY_POINTS = [
  2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 6, 5, 4, 7, 8, 6, 5, 7, 9, 8, 6, 7, 10, 9, 8, 11, 12, 10, 9, 12,
];

function DailyArea() {
  // 用 SVG path 模拟 30 天 area chart
  // Mock 30-day area chart with a single SVG path
  const max = Math.max(...DAILY_POINTS);
  const w = 240;
  const h = 80;
  const step = w / (DAILY_POINTS.length - 1);
  const points = DAILY_POINTS.map((v, i) => [i * step, h - (v / max) * (h - 6) - 2] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const total = DAILY_POINTS.reduce((acc, v) => acc + v, 0);

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[13px]">近 30 天每日新增</div>
        <div className="text-[11px] text-muted-foreground">合计 {total} 份</div>
      </div>
      <svg
        aria-hidden="true"
        className="h-20 w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${w} ${h}`}
      >
        <defs>
          <linearGradient id="resume-daily-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.65 0.16 150)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="oklch(0.65 0.16 150)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#resume-daily-fill)" />
        <path
          d={line}
          fill="none"
          stroke="oklch(0.65 0.16 150)"
          strokeLinecap="round"
          strokeWidth={1.5}
        />
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground/70 tabular-nums">
        <span>-30d</span>
        <span>-15d</span>
        <span>今日</span>
      </div>
    </div>
  );
}

function ConversionPie() {
  // 转化率：两段甜甜圈 (with / without AI 面试)
  // Conversion donut — withInterview vs withoutInterview
  const withCount = 38;
  const totalCount = 84;
  const percent = Math.round((withCount / totalCount) * 100);
  // r=24
  const c = 2 * Math.PI * 24;
  const dash = (percent / 100) * c;

  return (
    <div className="flex h-full items-center gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[13px]">AI 面试转化</div>
        <div className="text-[11px] text-muted-foreground">
          {withCount} / {totalCount} 已发起（{percent}%）
        </div>
        <ul className="mt-2 flex flex-col gap-1 text-[10px] text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-[3px]"
              style={{ backgroundColor: "oklch(0.55 0.18 295)" }}
            />
            <span className="flex-1">已发起 AI 面试</span>
            <span className="tabular-nums text-foreground/80">{withCount}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-[3px]"
              style={{ backgroundColor: "oklch(0.82 0.07 295)" }}
            />
            <span className="flex-1">仅入库</span>
            <span className="tabular-nums text-foreground/80">{totalCount - withCount}</span>
          </li>
        </ul>
      </div>
      <svg aria-hidden="true" className="ml-auto size-20 shrink-0" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="24" fill="none" stroke="oklch(0.82 0.07 295)" strokeWidth="12" />
        <circle
          cx="32"
          cy="32"
          fill="none"
          r="24"
          stroke="oklch(0.55 0.18 295)"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4}
          strokeWidth="12"
          transform="rotate(-90 32 32)"
        />
        <text
          className="fill-foreground"
          dominantBaseline="middle"
          fontSize="11"
          fontWeight="600"
          textAnchor="middle"
          x="32"
          y="33"
        >
          {percent}%
        </text>
      </svg>
    </div>
  );
}

function ChartsRow() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[StatusBar, DailyArea, ConversionPie].map((Chart, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable
          key={i}
          className="h-[150px] overflow-hidden rounded-xl border border-border/60 bg-background"
        >
          <Chart />
        </div>
      ))}
    </div>
  );
}

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

function ResumeToolbar() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex h-9 w-[280px] items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-[12px] text-muted-foreground">
        <SearchIcon className="size-3.5" strokeWidth={1.75} />
        <span>搜索候选人、邮箱、电话、简历名或目标岗位</span>
      </div>
      <button
        className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-[12px] text-primary-foreground"
        type="button"
      >
        <UploadIcon className="size-3.5" strokeWidth={2} />
        上传简历
      </button>
    </div>
  );
}

function ResumeTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
      <div className="grid grid-cols-[36px_1.6fr_1fr_1.1fr_1.2fr_0.7fr_1fr_1fr_50px] items-center gap-3 border-border/60 border-b bg-muted/40 px-4 py-2.5 font-medium text-[11px] text-muted-foreground">
        <span className="flex items-center justify-center">
          <span className="size-3.5 rounded-sm border border-foreground/40" />
        </span>
        <span>候选人</span>
        <span>目标岗位</span>
        <span>关联岗位</span>
        <span>简历文件</span>
        <span>AI 面试</span>
        <span>创建人</span>
        <span>创建时间</span>
        <span />
      </div>
      <div className="divide-y divide-border/40">
        {RESUMES.map((r) => (
          <div
            className="grid grid-cols-[36px_1.6fr_1fr_1.1fr_1.2fr_0.7fr_1fr_1fr_50px] items-center gap-3 px-4 py-3 text-[12.5px]"
            key={r.name}
          >
            <span className="flex items-center justify-center">
              <span className="size-3.5 rounded-sm border border-foreground/30" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-[13px] underline-offset-4 hover:underline">
                {r.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{r.email}</div>
            </div>
            <span className="truncate text-foreground/80">{r.role}</span>
            <span className="truncate text-foreground/80 underline-offset-4 hover:underline">
              {r.jobLink}
            </span>
            <span className="truncate text-foreground/80 underline-offset-4 hover:underline">
              {r.resumeFile}
            </span>
            <span>
              {r.hasInterview ? (
                <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 font-medium text-[10px] text-emerald-700 dark:text-emerald-300">
                  已发起
                </span>
              ) : (
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                  未发起
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="size-5 rounded-full bg-gradient-to-br from-sky-400/70 to-indigo-500/70" />
              <span className="truncate text-foreground/80">{r.creator}</span>
            </div>
            <span className="truncate text-muted-foreground tabular-nums">{r.createdAt}</span>
            <div className="flex items-center justify-end gap-0.5">
              <span className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
                <EyeIcon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
                <PencilIcon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
                <MoreHorizontalIcon className="size-3.5" strokeWidth={1.75} />
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-border/60 border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span>共 84 条 · 每页 20</span>
        <div className="flex items-center gap-1">
          <span className="grid size-6 place-items-center rounded border border-border/60">‹</span>
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
            1
          </span>
          <span className="rounded px-1.5 py-0.5">2</span>
          <span className="rounded px-1.5 py-0.5">3</span>
          <span className="grid size-6 place-items-center rounded border border-border/60">›</span>
        </div>
      </div>
    </div>
  );
}

function ResumesContent() {
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[22px] leading-tight">简历库</h1>
        <p className="text-[12px] text-muted-foreground">
          集中管理所有候选人简历。在这里上传 PDF 不会自动生成面试题，需要时再发起 AI 面试。
        </p>
      </header>
      <ChartsRow />
      <ResumeToolbar />
      <ResumeTable />
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
