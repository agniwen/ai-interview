import { IconChevronDown, IconSparkles, IconX } from "@tabler/icons-react";
// 用途：process step 1 简化版 UI——「新建在招岗位」Dialog 叠在 JD 管理页之上。
// 对齐 JobDescriptionFormDialog 的字段：岗位名称 / 部门 / 面试官（multi） / 简要描述 / 岗位 Prompt。
// Purpose: simplified UI of the "新建在招岗位" dialog overlaying the JD list page.
// Mirrors JobDescriptionFormDialog fields: name / department / interviewers / description / prompt.

import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "岗位设置" }];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="font-medium text-[12px]">
      {children}
      {required ? <span className="ml-0.5 text-destructive/75">*</span> : null}
    </span>
  );
}

function TextInput({ placeholder, value }: { placeholder?: string; value?: string }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-border bg-background px-3 text-[13px]">
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
    <div className="flex h-9 items-center justify-between rounded-md border border-border bg-background px-3 text-[13px]">
      {value ? (
        <span>{value}</span>
      ) : (
        <span className="text-muted-foreground/70">{placeholder}</span>
      )}
      <IconChevronDown className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
    </div>
  );
}

function MultiSelectInterviewers() {
  const picked = ["葛城美里", "赤木律子"];
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[12px]">
      {picked.map((p) => (
        <span
          className="flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2 py-0.5"
          key={p}
        >
          <span className="size-3.5 rounded-full bg-gradient-to-br from-primary/15 to-primary/30" />
          {p}
          <IconX className="size-3 text-muted-foreground" strokeWidth={1.75} />
        </span>
      ))}
      <span className="ml-auto pr-1 text-muted-foreground/70">选择面试官…</span>
      <IconChevronDown className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
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
      className="rounded-md border border-border bg-background p-3 text-[12.5px] leading-relaxed"
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
      className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 flex w-[1200px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_4px_24px_rgb(0_0_0/0.05)] dark:shadow-[0_4px_24px_rgb(0_0_0/0.2)]"
      style={{ maxHeight: 800 }}
    >
      <div className="flex items-start justify-between gap-4 border-b px-5 pt-4 pb-3">
        <div>
          <h2 className="font-semibold text-[16px]">创建在招岗位</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            岗位 JD 同时用于简历评估和 AI 面试，请确认要求清晰、分层且可量化。
          </p>
        </div>
        <span className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]">
          <IconX className="size-4" strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex flex-col gap-3 overflow-auto px-5 py-3">
        <div className="grid grid-cols-[1fr_320px] items-center gap-6 rounded-lg bg-muted/35 px-4 py-3">
          <div>
            <FieldLabel required>岗位名称</FieldLabel>
            <p className="mt-1 text-[11px] text-muted-foreground">候选人和面试都会引用这个名称。</p>
          </div>
          <TextInput value="资深前端工程师" />
        </div>
        <div className="grid grid-cols-[1fr_320px] items-center gap-6 rounded-lg bg-muted/35 px-4 py-3">
          <div>
            <FieldLabel>岗位编码</FieldLabel>
            <p className="mt-1 text-[11px] text-muted-foreground">
              用于内部识别；保存时可自动生成。
            </p>
          </div>
          <TextInput value="FE-SENIOR-01" />
        </div>
        <div className="grid grid-cols-[1fr_320px] items-center gap-6 rounded-lg bg-muted/35 px-4 py-3">
          <div>
            <FieldLabel required>所属部门</FieldLabel>
            <p className="mt-1 text-[11px] text-muted-foreground">决定默认可选择的面试官范围。</p>
          </div>
          <Select value="研发部" />
        </div>
        <div className="grid grid-cols-[1fr_320px] items-center gap-6 rounded-lg bg-muted/35 px-4 py-3">
          <div>
            <FieldLabel>允许匹配跨部门面试官</FieldLabel>
            <p className="mt-1 text-[11px] text-muted-foreground">关闭时仅可选择所属部门面试官。</p>
          </div>
          <div className="flex justify-end">
            <span className="flex h-6 w-11 items-center rounded-full bg-muted px-0.5">
              <span className="size-5 rounded-full bg-background" />
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_320px] items-center gap-6 rounded-lg bg-muted/35 px-4 py-3">
          <div>
            <FieldLabel required>面试官</FieldLabel>
            <p className="mt-1 text-[11px] text-muted-foreground">
              选择负责该岗位的一位或多位面试官。
            </p>
          </div>
          <MultiSelectInterviewers />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex flex-col gap-1.5 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <FieldLabel required>岗位 JD</FieldLabel>
              <span className="flex items-center gap-1 text-primary text-xs">
                <IconSparkles className="size-3.5" />
                AI 补充
              </span>
            </div>
            <Textarea rows={9} value={PROMPT_TEXT} />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div>
              <FieldLabel>评分规则</FieldLabel>
              <p className="mt-1 text-[11px] text-muted-foreground">
                从岗位要求生成可解释的评估维度与扣分项。
              </p>
            </div>
            {["技术能力 · 40%", "项目影响 · 30%", "协作与表达 · 20%", "风险项 · 10%"].map(
              (rule) => (
                <div
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-[12px]"
                  key={rule}
                >
                  <span>{rule}</span>
                  <span className="text-muted-foreground">待生成</span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t bg-background px-5 py-3">
        <span className="rounded-md border border-border px-3 py-1.5 text-[12px]">取消</span>
        <span className="rounded-md bg-primary/80 px-3 py-1.5 font-medium text-[12px] text-primary-foreground">
          生成评分规则并继续
        </span>
        <span className="rounded-md bg-primary/80 px-3 py-1.5 font-medium text-[12px] text-primary-foreground">
          创建草稿
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
        <h1 className="text-[22px] leading-tight">岗位设置</h1>
        <p className="text-[12px] text-muted-foreground">
          维护岗位 JD、面试官与题库，所有评估共用同一份岗位语境。
        </p>
      </header>
      <div className="rounded-xl border border-border bg-background/60">
        <div className="grid grid-cols-[2fr_1fr_1.4fr_1fr] items-center gap-3 border-border border-b bg-muted/30 px-4 py-2.5 font-medium text-[11px] text-muted-foreground">
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
            <span className="text-muted-foreground">赤木律子 / 碇源堂</span>
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
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xs" />
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
        sidebar={<StudioNav activeLabel="岗位设置" />}
        tab="studio"
      >
        <JdSetupContent />
      </AppShell>
    </ScreenFrame>
  );
}
