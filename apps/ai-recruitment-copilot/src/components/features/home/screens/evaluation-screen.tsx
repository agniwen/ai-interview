// 用途：process step 4 简化版 UI——「候选人详情」Modal (mode="interview", size="full") 叠在
// AI 面试列表页之上；当前选中 tab：面试报告，对齐真实 EvaluationResults 的卡片结构。
// Purpose: simplified UI of StudioPersonDetailDialog (mode="interview", size="full")
// laid over the AI 面试 list page. Active tab "面试报告" mirrors EvaluationResults.
import { FileTextIcon, SearchIcon, XIcon } from "@/components/icons/hugeicons";
import { Fragment } from "react";
import { PdfFileIcon } from "@/components/features/pdf/pdf-file-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowDivider,
} from "@/components/ui/table";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "AI 面试" }];

// ─────────────── PageHeader (matches components/features/studio/page-header.tsx) ───────────────
function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
    </header>
  );
}

// ─────────────── Background: AI 面试 list page ───────────────
interface InterviewRow {
  candidate: string;
  createdAt: string;
  creator: string;
  email: string;
  hasPdf: boolean;
  jobDepartment: string;
  jobName: string;
  lastInterviewAt: string;
  report: boolean;
  round: string;
  status: { label: string; tone: "success" | "warning" | "info" | "outline" };
  scheduledAt: string;
}

const INTERVIEWS: InterviewRow[] = [
  {
    candidate: "李铭",
    createdAt: "2025-05-12 14:32",
    creator: "郭靖",
    email: "li.ming@example.com",
    hasPdf: true,
    jobDepartment: "研发部",
    jobName: "资深前端工程师",
    lastInterviewAt: "2025-05-13 10:30",
    report: true,
    round: "一面",
    scheduledAt: "2025-05-12 14:32",
    status: { label: "已完成", tone: "success" },
  },
  {
    candidate: "王欣",
    createdAt: "2025-05-12 09:18",
    creator: "李四",
    email: "wang.xin@example.com",
    hasPdf: true,
    jobDepartment: "产品部",
    jobName: "增长产品经理",
    lastInterviewAt: "2025-05-12 10:22",
    report: false,
    round: "一面",
    scheduledAt: "2025-05-12 10:18",
    status: { label: "进行中", tone: "warning" },
  },
  {
    candidate: "赵安",
    createdAt: "2025-05-11 16:05",
    creator: "王五",
    email: "zhao.an@example.com",
    hasPdf: false,
    jobDepartment: "研发部",
    jobName: "后端架构师",
    lastInterviewAt: "—",
    report: false,
    round: "一面",
    scheduledAt: "2025-05-11 16:00",
    status: { label: "待开始", tone: "info" },
  },
  {
    candidate: "陈佳",
    createdAt: "2025-05-10 11:24",
    creator: "郭靖",
    email: "chen.jia@example.com",
    hasPdf: true,
    jobDepartment: "数据部",
    jobName: "数据分析师",
    lastInterviewAt: "2025-05-10 11:58",
    report: true,
    round: "二面",
    scheduledAt: "2025-05-10 11:24",
    status: { label: "已完成", tone: "success" },
  },
  {
    candidate: "周斌",
    createdAt: "2025-05-09 09:18",
    creator: "李四",
    email: "zhou.bin@example.com",
    hasPdf: true,
    jobDepartment: "运营部",
    jobName: "社群运营专员",
    lastInterviewAt: "2025-05-09 09:40",
    report: false,
    round: "一面",
    scheduledAt: "2025-05-09 09:18",
    status: { label: "已中断", tone: "outline" },
  },
];

// 对齐 ui/badge.tsx variants:
// success: bg-emerald-500/15 text-emerald-700
// warning: bg-amber-500/15 text-amber-700
// info:    bg-sky-500/15 text-sky-700
// outline: border border-border bg-transparent text-foreground
const TONE_CLASS: Record<InterviewRow["status"]["tone"], string> = {
  info: "bg-sky-500/5 text-sky-700/80 dark:text-sky-300/80",
  outline: "border border-border bg-transparent text-foreground",
  success: "bg-emerald-500/5 text-emerald-700/80 dark:text-emerald-300/80",
  warning: "bg-amber-500/5 text-amber-700/80 dark:text-amber-300/80",
};

const SUMMARY_STATS = [
  { hint: "该组织下所有面试轮次总数", label: "总轮数", value: "42" },
  { hint: "尚未开始的轮次", label: "待开始", value: "13" },
  { hint: "正在进行或短暂中断的轮次", label: "进行中", value: "7" },
  { hint: "全部完成的轮次", label: "已完成", value: "22" },
];

function SummaryStats() {
  return (
    <section className="grid grid-cols-4 gap-4">
      {SUMMARY_STATS.map((item) => (
        <div
          className="rounded-xl border border-border bg-background p-4 shadow-xs"
          key={item.label}
        >
          <p className="text-muted-foreground text-xs">{item.label}</p>
          <p className="mt-1 font-semibold text-3xl leading-none tabular-nums">{item.value}</p>
          <p className="mt-3 truncate text-muted-foreground text-xs">{item.hint}</p>
        </div>
      ))}
    </section>
  );
}

function InterviewListBackground() {
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        description="查看每一轮语音面试的排期、最近进展、简历和报告，让候选人状态一眼可追。"
        title="AI 面试"
      />
      <SummaryStats />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-[15rem]">
          <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent pr-3 pl-9 text-muted-foreground text-sm">
            搜索候选人、岗位、轮次或简历名
          </div>
        </div>
        <span className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-muted-foreground text-sm">
          全部状态
        </span>
      </div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[260px]">候选人</TableHead>
            <TableHead className="w-[240px]">在招岗位</TableHead>
            <TableHead className="w-[90px]">轮次</TableHead>
            <TableHead className="w-[150px]">排期</TableHead>
            <TableHead className="w-[110px]">状态</TableHead>
            <TableHead className="w-[100px]">报告</TableHead>
            <TableHead className="w-[140px]">创建人</TableHead>
            <TableHead className="w-[160px]">创建时间</TableHead>
            <TableHead className="w-[170px]">最近面试时间</TableHead>
            <TableHead aria-label="操作" className="w-[140px] text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {INTERVIEWS.map((r, index) => (
            <Fragment key={r.candidate}>
              <TableRow key={r.candidate}>
                <TableCell aria-label={`候选人：${r.candidate}`}>
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
                      <div className="truncate font-medium">{r.candidate}</div>
                      <div className="truncate text-muted-foreground text-xs">{r.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell aria-label={`在招岗位：${r.jobDepartment} / ${r.jobName}`}>
                  <span className="block truncate underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60">
                    {r.jobDepartment} / {r.jobName}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.round}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {r.scheduledAt}
                </TableCell>
                <TableCell aria-label={`状态：${r.status.label}`}>
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium text-xs ${TONE_CLASS[r.status.tone]}`}
                  >
                    {r.status.label}
                  </span>
                </TableCell>
                <TableCell>
                  {r.report ? (
                    <span className="inline-flex items-center rounded-md border border-transparent bg-emerald-500/5 px-1.5 py-0.5 font-medium text-emerald-700/80 text-xs dark:text-emerald-300/80">
                      已生成
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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
                      aria-label="查看面试记录"
                      className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs"
                    >
                      查看
                    </span>
                    <span
                      aria-label="编辑面试记录"
                      className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs"
                    >
                      编辑
                    </span>
                    <span
                      aria-label="更多面试记录操作"
                      className="inline-flex h-7 items-center rounded-md px-2 text-muted-foreground text-xs"
                    >
                      更多
                    </span>
                  </div>
                </TableCell>
              </TableRow>
              {index < INTERVIEWS.length - 1 ? <TableRowDivider /> : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─────────────── Modal — header (TabsList + headerExtra) ───────────────
function ModalTabs() {
  // 真实 TabsList (default variant): inline-flex h-9 w-fit (sm:w-auto) items-center justify-center rounded-lg p-[3px] bg-muted
  // TabsTrigger: relative inline-flex h-[calc(100%-1px)] flex-1 sm:min-w-[6em] sm:flex-none items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium
  //   active: data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm
  //   inactive: text-foreground/60 (hover:text-foreground)
  const tabs = [
    { active: false, label: "概览" },
    { active: true, label: "面试报告" },
    { active: false, label: "AI 题目" },
    { active: false, label: "经历" },
    { active: false, label: "Agent 提示词" },
    { active: false, label: "表单答复" },
  ];
  return (
    <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
        {tabs.map((t) => (
          <span
            className={`relative inline-flex h-[calc(100%-1px)] min-w-[6em] items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-medium text-sm ${
              t.active ? "bg-background text-foreground shadow-sm" : "text-foreground/60"
            }`}
            key={t.label}
          >
            {t.label}
          </span>
        ))}
      </div>
      <span className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-transparent px-3 font-medium text-sm">
        <FileTextIcon className="size-4" />
        预览简历
      </span>
    </div>
  );
}

// ─────────────── 面试报告 tab content (mirrors EvaluationResults) ───────────────
interface QuestionEval {
  order: number;
  question: string;
  score: number;
  maxScore: number;
  assessment: string;
}

const QUESTIONS: QuestionEval[] = [
  {
    assessment: "完整讲清楚商家后台从 monolith → 微前端的演进路径，覆盖 8 个团队的拆分节奏。",
    maxScore: 100,
    order: 1,
    question: "请聊聊你最近主导的一个大型前端项目。",
    score: 92,
  },
  {
    assessment: "样式隔离与状态共享的取舍讲得清，shadow DOM + 共享 store 折中方案有具体落地。",
    maxScore: 100,
    order: 2,
    question: "拆分过程中最具挑战的技术决策是什么？",
    score: 88,
  },
  {
    assessment: "首屏 2.4s → 1.1s、包体压缩 38%、迭代周期 2 周 → 5 天，数据完整可追溯。",
    maxScore: 100,
    order: 3,
    question: "性能指标变化怎样？给出具体收益。",
    score: 90,
  },
  {
    assessment: "讲到了周会同步与 RFC 流程，但跨团队推动决策的具体例子偏少，下一轮可深入。",
    maxScore: 100,
    order: 4,
    question: "在多团队协作中，你如何推动技术决策落地？",
    score: 76,
  },
];

function EvaluationContent() {
  // 真实 EvaluationResults: <div className="space-y-3">
  // overallScore 行: flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5
  //   - text-2xl text-primary/75 tabular-nums font-medium
  //   - text-muted-foreground text-sm "/ 100"
  //   - Badge ml-auto (success variant)
  // overallAssessment: text-muted-foreground text-sm leading-normal
  // questions: each rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm
  //   - flex items-start justify-between gap-2: "1. question" + score "92/100"
  //   - assessment: mt-1.5 text-muted-foreground leading-normal
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
        <span className="font-medium text-2xl text-primary/75 tabular-nums">86</span>
        <span className="text-muted-foreground text-sm">/ 100</span>
        <span className="ml-auto inline-flex items-center rounded-md border border-transparent bg-emerald-500/5 px-1.5 py-0.5 font-medium text-emerald-700/80 text-xs dark:text-emerald-300/80">
          推荐进入下一轮
        </span>
      </div>
      <p className="text-muted-foreground text-sm leading-normal">
        候选人具备完整的微前端架构落地经验，技术深度与工程素养扎实，能用数据讲清楚优化收益。沟通节奏清晰、能主动展开追问。团队协作部分案例描述偏简略，建议在下一轮补充跨团队推动决策的具体例子。
      </p>
      <div className="space-y-2">
        {QUESTIONS.map((q) => (
          <div
            className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm"
            key={q.order}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-medium leading-normal">
                {q.order}. {q.question}
              </p>
              <span className="shrink-0 font-semibold tabular-nums">
                {q.score}
                <span className="font-normal text-muted-foreground">/{q.maxScore}</span>
              </span>
            </div>
            <p className="mt-1.5 text-muted-foreground leading-normal">{q.assessment}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── Modal ───────────────
function DetailDialog() {
  // 真实 Modal (DialogModal):
  // - Overlay: fixed inset-0 z-50 backdrop-blur-xs bg-background/60 (我们在父层做)
  // - Content outer: -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 fixed w-full max-w-[calc(100%-2rem)]
  //                  + size=full: sm:w-[min(96vw,1440px)] sm:max-w-none
  // - Inner card: relative flex max-h-[90vh] flex-col overflow-hidden rounded-3xl border bg-background shadow-lg
  // - Header (stack): border-b px-6 pt-5 pb-4 + gap-1.5 + title text-lg font-semibold + description text-sm muted + headerExtra
  // - Close X: absolute right-4 top-4 rounded-xs opacity-70
  // - Body: min-h-0 flex-1 overflow-y-auto px-6 py-5
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-50 w-[min(96%,1440px)]">
      <div className="relative flex max-h-[88vh] flex-col overflow-hidden rounded-3xl border bg-background shadow-lg">
        {/* Close button */}
        <span className="absolute top-4 right-4 grid size-7 place-items-center rounded-xs text-foreground/70 opacity-70">
          <XIcon className="size-4" />
        </span>

        {/* Header (stack layout) */}
        <div className="flex shrink-0 flex-col gap-1.5 border-b px-6 pt-5 pb-4 text-left">
          <div className="flex flex-wrap items-center gap-3 font-semibold text-foreground text-lg leading-none">
            <span>李铭</span>
            {/* StudioInterviewStatusBadge — completed = success */}
            <span className="inline-flex items-center rounded-md border border-transparent bg-emerald-500/5 px-1.5 py-0.5 font-medium text-emerald-700/80 text-xs dark:text-emerald-300/80">
              已结束
            </span>
          </div>
          <p className="text-muted-foreground text-sm">资深前端工程师 · 简历_李铭.pdf</p>
          <ModalTabs />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-background px-6 py-5">
          <EvaluationContent />
        </div>
      </div>
    </div>
  );
}

function EvaluationCanvas() {
  return (
    <div className="relative h-full">
      {/* 背景: AI 面试列表页 */}
      <InterviewListBackground />
      {/* Modal overlay: fixed inset-0 z-50 backdrop-blur-xs bg-background/60 */}
      <div aria-hidden="true" className="absolute inset-0 z-40 bg-background/60 backdrop-blur-xs" />
      <DetailDialog />
    </div>
  );
}

export function EvaluationScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <AppShell breadcrumb={BREADCRUMB} sidebar={<StudioNav activeLabel="AI 面试" />} tab="studio">
        <EvaluationCanvas />
      </AppShell>
    </ScreenFrame>
  );
}
