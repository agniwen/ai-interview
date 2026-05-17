// 用途：landing 用「Studio › 在招岗位管理」简化版 UI。展示 page header + 表格 + toolbar。
// Purpose: simplified UI of the Studio 在招岗位管理 (job descriptions) management page.
import {
  Building2Icon,
  ChevronDownIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UserCircleIcon,
} from "lucide-react";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [
  { label: "Studio" },
  { current: true, label: "在招岗位管理" },
];

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
    interviewers: ["张三", "李四"],
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

function MetricCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-foreground/[0.04] text-foreground/80">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-semibold text-[24px] leading-none tabular-nums">{value}</span>
        <span className="text-[11px] text-emerald-600">{trend}</span>
      </div>
    </div>
  );
}

function MetricsRow() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard
        icon={<FileTextIcon className="size-3.5" strokeWidth={1.75} />}
        label="在招岗位"
        trend="+2 本周"
        value="12"
      />
      <MetricCard
        icon={<Building2Icon className="size-3.5" strokeWidth={1.75} />}
        label="覆盖部门"
        trend="活跃 5"
        value="5"
      />
      <MetricCard
        icon={<UserCircleIcon className="size-3.5" strokeWidth={1.75} />}
        label="参与面试官"
        trend="活跃 7"
        value="8"
      />
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-[12px]">
      <span>{label}</span>
      <ChevronDownIcon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
    </span>
  );
}

function JobsToolbar() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-[240px] items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-[12px] text-muted-foreground">
          <SearchIcon className="size-3.5" strokeWidth={1.75} />
          <span>搜索岗位名称</span>
        </div>
        <FilterChip label="部门：全部" />
        <FilterChip label="面试官：全部" />
      </div>
      <button
        className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-[12px] text-primary-foreground"
        type="button"
      >
        <PlusIcon className="size-3.5" strokeWidth={2} />
        新建在招岗位
      </button>
    </div>
  );
}

function JobsTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
      <div className="grid grid-cols-[2fr_1fr_1.4fr_0.8fr_0.8fr_1.2fr_60px] items-center gap-3 border-border/60 border-b bg-muted/40 px-4 py-2.5 font-medium text-[11px] text-muted-foreground">
        <span>岗位名</span>
        <span>部门</span>
        <span>面试官</span>
        <span>面试表单</span>
        <span>面试题</span>
        <span>创建时间</span>
        <span />
      </div>
      <div className="divide-y divide-border/40">
        {JOBS.map((j) => (
          <div
            className="grid grid-cols-[2fr_1fr_1.4fr_0.8fr_0.8fr_1.2fr_60px] items-center gap-3 px-4 py-3 text-[12.5px]"
            key={j.name}
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-md bg-foreground/[0.04] text-foreground/70">
                <FileTextIcon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="truncate font-medium">{j.name}</span>
            </div>
            <span className="text-foreground/80">{j.department}</span>
            <div className="flex items-center gap-1.5">
              {j.interviewers.slice(0, 3).map((i, idx) => (
                <span
                  className="-ml-1.5 size-5 rounded-full bg-gradient-to-br from-sky-400/70 to-indigo-500/70 ring-2 ring-background first:ml-0"
                  key={`${j.name}-${i}-${idx}`}
                  title={i}
                />
              ))}
              <span className="ml-1 truncate text-muted-foreground">
                {j.interviewers.join("、")}
              </span>
            </div>
            <span className="text-muted-foreground tabular-nums">{j.formCount}</span>
            <span className="text-muted-foreground tabular-nums">{j.questionCount}</span>
            <span className="text-muted-foreground tabular-nums">{j.createdAt}</span>
            <div className="flex items-center justify-end gap-0.5">
              <span className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
                <PencilIcon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
                <Trash2Icon className="size-3.5" strokeWidth={1.75} />
              </span>
              <span className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
                <MoreHorizontalIcon className="size-3.5" strokeWidth={1.75} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobsContent() {
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[22px] leading-tight">在招岗位管理</h1>
        <p className="text-[12px] text-muted-foreground">
          维护岗位 JD、面试官与题库，所有简历筛选和面试评估共用同一份岗位语境。
        </p>
      </header>
      <MetricsRow />
      <JobsToolbar />
      <JobsTable />
    </div>
  );
}

export function JobsScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <AppShell
        breadcrumb={BREADCRUMB}
        sidebar={<StudioNav activeLabel="在招岗位管理" />}
        tab="studio"
      >
        <JobsContent />
      </AppShell>
    </ScreenFrame>
  );
}
