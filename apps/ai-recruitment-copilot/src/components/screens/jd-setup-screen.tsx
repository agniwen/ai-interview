// 用途：process step 1 简化版 UI——「新建在招岗位」Dialog 叠在 JD 管理页之上。
// 对齐 JobDescriptionFormDialog 的字段：岗位名称 / 部门 / 面试官（multi） / 简要描述 / 岗位 Prompt。
// Purpose: simplified UI of the "新建在招岗位" dialog overlaying the JD list page.
// Mirrors JobDescriptionFormDialog fields: name / department / interviewers / description / prompt.
import { ChevronDownIcon, FileTextIcon, XIcon } from "lucide-react";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [
  { label: "Studio" },
  { current: true, label: "在招岗位管理" },
];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="font-medium text-[12px]">
      {children}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </span>
  );
}

function TextInput({ placeholder, value }: { placeholder?: string; value?: string }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-border/60 bg-background px-3 text-[13px]">
      {value ? (
        <span>{value}</span>
      ) : (
        <span className="text-muted-foreground/70">{placeholder}</span>
      )}
    </div>
  );
}

function Select({ placeholder, value }: { placeholder?: string; value?: string }) {
  return (
    <div className="flex h-9 items-center justify-between rounded-md border border-border/60 bg-background px-3 text-[13px]">
      {value ? (
        <span>{value}</span>
      ) : (
        <span className="text-muted-foreground/70">{placeholder}</span>
      )}
      <ChevronDownIcon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
    </div>
  );
}

function MultiSelectInterviewers() {
  const picked = ["张三", "李四"];
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5 text-[12px]">
      {picked.map((p) => (
        <span
          className="flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2 py-0.5"
          key={p}
        >
          <span className="size-3.5 rounded-full bg-gradient-to-br from-sky-400/70 to-indigo-500/70" />
          {p}
          <XIcon className="size-3 text-muted-foreground" strokeWidth={1.75} />
        </span>
      ))}
      <span className="ml-auto pr-1 text-muted-foreground/70">选择面试官…</span>
      <ChevronDownIcon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
    </div>
  );
}

function Textarea({
  placeholder,
  value,
  rows = 3,
}: {
  placeholder?: string;
  value?: string;
  rows?: number;
}) {
  return (
    <div
      className="rounded-md border border-border/60 bg-background p-3 text-[12.5px] leading-relaxed"
      style={{ minHeight: rows * 22 + 24 }}
    >
      {value ? (
        <span className="whitespace-pre-line text-foreground/90">{value}</span>
      ) : (
        <span className="text-muted-foreground/70">{placeholder}</span>
      )}
    </div>
  );
}

const PROMPT_TEXT = `## 候选人要求
- 5 年以上前端开发经验，熟练掌握 React 生态
- 具备大型项目主导经验，能独立负责架构演进
- 对性能优化、可观测性有系统化方法论

## 考察重点
- 微前端拆分思路与状态隔离策略
- 性能优化案例与可量化收益
- 跨团队协作与技术决策表达`;

function JdFormDialog() {
  return (
    <div
      className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 flex w-[720px] flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl"
      style={{ maxHeight: 720 }}
    >
      <div className="flex items-start justify-between gap-4 border-border/60 border-b px-6 pt-5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
              <FileTextIcon className="size-4" strokeWidth={1.75} />
            </span>
            <h2 className="font-semibold text-[16px]">新建在招岗位</h2>
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            为在招岗位指定部门和面试官，prompt 在面试时会传给语音 agent。
          </p>
        </div>
        <span className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
          <XIcon className="size-4" strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex flex-col gap-4 overflow-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel required>岗位名称</FieldLabel>
            <TextInput value="资深前端工程师" />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel required>部门</FieldLabel>
            <Select value="研发部" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>面试官</FieldLabel>
          <MultiSelectInterviewers />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>简要描述</FieldLabel>
          <Textarea rows={2} value="主导前端架构演进，推动微前端落地与性能优化体系建设。" />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel required>岗位 Prompt</FieldLabel>
          <Textarea rows={9} value={PROMPT_TEXT} />
          <p className="text-[10px] text-muted-foreground">
            面试时会作为 system prompt 注入语音 agent，建议覆盖职责、技术栈和考察维度。
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-border/60 border-t px-6 py-3">
        <span className="rounded-md border border-border/60 px-3 py-1.5 text-[12px]">取消</span>
        <span className="rounded-md bg-primary px-3 py-1.5 font-medium text-[12px] text-primary-foreground">
          保存
        </span>
      </div>
    </div>
  );
}

function DimmedJobsBackground() {
  // Dialog 背后透出的 JD 管理页背景：表头 + 几行表格虚化，不需要复用 JobsScreen
  // Backdrop hint of the JD management page — just a header bar + a few faded rows
  return (
    <div className="flex flex-col gap-6 px-6 py-6 opacity-50">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[22px] leading-tight">在招岗位管理</h1>
        <p className="text-[12px] text-muted-foreground">
          维护岗位 JD、面试官与题库，所有评估共用同一份岗位语境。
        </p>
      </header>
      <div className="rounded-xl border border-border/60 bg-background/60">
        <div className="grid grid-cols-[2fr_1fr_1.4fr_1fr] items-center gap-3 border-border/60 border-b bg-muted/30 px-4 py-2.5 font-medium text-[11px] text-muted-foreground">
          <span>岗位名</span>
          <span>部门</span>
          <span>面试官</span>
          <span>创建时间</span>
        </div>
        {["后端架构师", "增长产品经理", "UI 设计师", "数据分析师"].map((name) => (
          <div
            className="grid grid-cols-[2fr_1fr_1.4fr_1fr] items-center gap-3 border-border/40 border-b px-4 py-3 text-[12px] last:border-b-0"
            key={name}
          >
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground">研发部</span>
            <span className="text-muted-foreground">李四 / 王五</span>
            <span className="text-muted-foreground tabular-nums">2025-05-08</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JdSetupContent() {
  return (
    <div className="relative h-full">
      <DimmedJobsBackground />
      <div className="absolute inset-0 bg-foreground/30 dark:bg-foreground/5 backdrop-blur-[1px]" />
      <JdFormDialog />
    </div>
  );
}

export function JdSetupScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <AppShell
        bodyClassName="bg-background"
        breadcrumb={BREADCRUMB}
        sidebar={<StudioNav activeLabel="在招岗位管理" />}
        tab="studio"
      >
        <JdSetupContent />
      </AppShell>
    </ScreenFrame>
  );
}
