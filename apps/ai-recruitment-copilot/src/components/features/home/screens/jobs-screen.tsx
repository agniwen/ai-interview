import { IconChevronDown, IconFileText, IconPlus, IconSearch } from "@tabler/icons-react";
// 用途：landing 用「Studio › 岗位设置」简化版 UI。对齐真实 JobDescriptionManagementPage：
// PageHeader (text-2xl + text-sm muted) + JobDescriptionCharts (3 张 Card) +
// Toolbar (search + departmentId/interviewerId multi-select) + AlignUI DataGrid table + 新建岗位按钮
// Purpose: simplified Studio job-descriptions management mock, 1:1 with real components.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "岗位设置" }];

// ─────────────── Card primitives ───────────────
// 真实 ui/card.tsx 是 py-6 gap-6，在 landing 缩放画布里偏高；这里整体收一档
// (py-4 gap-3) 让 3 张统计卡更紧凑、横纵比更协调。
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

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </header>
  );
}

// ─────────────── 三张统计图 ───────────────
function DeptDistributionCard() {
  const segments = [
    {
      color: "color-mix(in oklch, var(--chart-1) 44%, var(--background))",
      count: 4,
      label: "研发",
    },
    {
      color: "color-mix(in oklch, var(--chart-2) 42%, var(--background))",
      count: 3,
      label: "产品",
    },
    {
      color: "color-mix(in oklch, var(--chart-3) 40%, var(--background))",
      count: 2,
      label: "设计",
    },
    {
      color: "color-mix(in oklch, var(--chart-4) 46%, var(--background))",
      count: 2,
      label: "数据",
    },
    {
      color: "color-mix(in oklch, var(--chart-5) 38%, var(--background))",
      count: 1,
      label: "运营",
    },
  ];
  const total = segments.reduce((acc, s) => acc + s.count, 0);
  return (
    <Card>
      <CardHeader description={`覆盖 ${segments.length} 个部门`} title="部门分布" />
      <CardContent className="flex flex-col gap-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
          {segments.map((s, i) => {
            let rad = "";
            if (i === 0) {
              rad = "rounded-l-full";
            } else if (i === segments.length - 1) {
              rad = "rounded-r-full";
            }
            return (
              <span
                className={rad}
                key={s.label}
                style={{
                  backgroundColor: s.color,
                  width: `${(s.count / total) * 100}%`,
                }}
              />
            );
          })}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {segments.map((s) => (
            <li className="flex items-center gap-1.5" key={s.label}>
              <span
                aria-hidden="true"
                className="size-2 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="tabular-nums">{s.count}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ActiveJobsCard() {
  // 用柱状图表示每个岗位的简历数
  const bars = [
    { count: 12, label: "前端" },
    { count: 8, label: "后端" },
    { count: 5, label: "产品" },
    { count: 7, label: "设计" },
    { count: 4, label: "数据" },
    { count: 3, label: "运营" },
  ];
  const max = Math.max(...bars.map((b) => b.count));
  return (
    <Card>
      <CardHeader description="按岗位维度统计当前候选人数" title="岗位简历分布" />
      <CardContent>
        <div className="flex h-20 items-end gap-2 px-0.5">
          {bars.map((b) => (
            <div className="flex flex-1 flex-col items-center gap-1" key={b.label}>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-chart-1/45"
                  style={{ height: `${(b.count / max) * 100}%` }}
                />
              </div>
              <div className="truncate text-[9px] text-muted-foreground">{b.label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InterviewerLoadCard() {
  // 8 位面试官，按近 30 天接的面试数排序
  const items = [
    { count: 14, name: "郭靖" },
    { count: 11, name: "李四" },
    { count: 9, name: "王五" },
    { count: 7, name: "赵六" },
    { count: 5, name: "孙七" },
  ];
  const max = Math.max(...items.map((i) => i.count));
  return (
    <Card>
      <CardHeader description="近 30 天承接面试场次 Top 5" title="面试官负载" />
      <CardContent>
        <ul className="flex flex-col gap-1">
          {items.map((i) => (
            <li className="flex items-center gap-2 text-[11px]" key={i.name}>
              <span className="size-4 rounded-full bg-gradient-to-br from-primary/15 to-primary/30" />
              <span className="w-8 truncate">{i.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full bg-primary/40"
                  style={{ width: `${(i.count / max) * 100}%` }}
                />
              </div>
              <span className="tabular-nums text-muted-foreground">{i.count}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ChartsRow() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <DeptDistributionCard />
      <ActiveJobsCard />
      <InterviewerLoadCard />
    </div>
  );
}

// ─────────────── Toolbar (search + 2 multi-select + 新建) ───────────────
function MultiSelectChip({ label }: { label: string }) {
  // 对齐 SearchableMultiSelect: h-9 bg-transparent border-input rounded-md flex items-center gap-2 px-3
  return (
    <span className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <IconChevronDown className="size-4 opacity-50" />
    </span>
  );
}

function JobsToolbar() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-[15rem]">
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent pl-9 pr-3 text-muted-foreground text-sm">
            搜索岗位名称
          </div>
        </div>
        <MultiSelectChip label="选择部门" />
        <MultiSelectChip label="选择面试官" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          className="flex h-9 items-center gap-1.5 rounded-md bg-primary/80 px-3 font-medium text-primary-foreground text-sm"
          type="button"
        >
          <IconPlus className="size-4" />
          新建在招岗位
        </button>
      </div>
    </div>
  );
}

// ─────────────── Table ───────────────
interface JobRow {
  name: string;
  department: string;
  interviewers: string[];
  formCount: number;
  questionCount: number;
  createdAt: string;
}

const JOBS: JobRow[] = [
  {
    createdAt: "2025-05-12 14:32",
    department: "研发部",
    formCount: 2,
    interviewers: ["郭靖", "李四"],
    name: "资深前端工程师",
    questionCount: 14,
  },
  {
    createdAt: "2025-05-08 10:18",
    department: "研发部",
    formCount: 1,
    interviewers: ["李四"],
    name: "后端架构师",
    questionCount: 18,
  },
  {
    createdAt: "2025-05-05 16:45",
    department: "产品部",
    formCount: 2,
    interviewers: ["王五", "钱六"],
    name: "增长产品经理",
    questionCount: 12,
  },
  {
    createdAt: "2025-05-02 11:24",
    department: "设计部",
    formCount: 1,
    interviewers: ["赵六"],
    name: "UI 设计师",
    questionCount: 10,
  },
  {
    createdAt: "2025-04-28 09:18",
    department: "数据部",
    formCount: 2,
    interviewers: ["孙七", "周八"],
    name: "数据分析师",
    questionCount: 15,
  },
  {
    createdAt: "2025-04-25 13:05",
    department: "运营部",
    formCount: 1,
    interviewers: ["周八"],
    name: "运营专员",
    questionCount: 9,
  },
];

function JobsTable() {
  return (
    <Table variant="card">
      <TableHeader>
        <TableRow>
          <TableHead>岗位名</TableHead>
          <TableHead>部门</TableHead>
          <TableHead>面试官</TableHead>
          <TableHead>面试表单</TableHead>
          <TableHead>面试题</TableHead>
          <TableHead>创建时间</TableHead>
          <TableHead aria-label="操作" className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {JOBS.map((j) => (
          <TableRow key={j.name}>
            <TableCell aria-label={`岗位：${j.name}`}>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-7 place-items-center rounded-md bg-foreground/[0.05] text-foreground/70"
                >
                  <IconFileText className="size-3.5" />
                </span>
                <span className="truncate font-medium">{j.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-foreground/80">{j.department}</TableCell>
            <TableCell aria-label={`面试官：${j.interviewers.join("、")}`}>
              <div className="flex items-center gap-2">
                <div className="flex">
                  {j.interviewers.slice(0, 3).map((name, idx) => (
                    <span
                      aria-hidden="true"
                      className="-ml-1.5 size-6 rounded-full bg-gradient-to-br from-primary/15 to-primary/30 ring-2 ring-background first:ml-0"
                      key={`${j.name}-${name}-${idx}`}
                    />
                  ))}
                </div>
                <span className="truncate text-foreground/80">{j.interviewers.join("、")}</span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{j.formCount}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{j.questionCount}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{j.createdAt}</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-0.5">
                <span
                  aria-label="编辑岗位"
                  className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs hover:bg-accent"
                >
                  编辑
                </span>
                <span
                  aria-label="删除岗位"
                  className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs hover:bg-accent"
                >
                  删除
                </span>
                <span
                  aria-label="更多岗位操作"
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

function JobsContent() {
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        description="维护岗位 JD、面试官与题库，所有简历筛选和面试评估共用同一份岗位语境。"
        title="岗位设置"
      />
      <ChartsRow />
      <div className="space-y-4">
        <JobsToolbar />
        <JobsTable />
      </div>
    </div>
  );
}

export function JobsScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <AppShell breadcrumb={BREADCRUMB} sidebar={<StudioNav activeLabel="岗位设置" />} tab="studio">
        <JobsContent />
      </AppShell>
    </ScreenFrame>
  );
}
