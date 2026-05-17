// 用途：process step 4 简化版 UI——「候选人详情」Modal (mode="interview", size="full") 叠在
// AI 面试列表页之上；当前选中 tab：面试报告，对齐真实 EvaluationResults 的卡片结构。
// Purpose: simplified UI of StudioPersonDetailDialog (mode="interview", size="full")
// laid over the AI 面试 list page. Active tab "面试报告" mirrors EvaluationResults.
import { FileTextIcon, MoreHorizontalIcon, PencilIcon, SearchIcon, XIcon } from "lucide-react";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ label: "Studio" }, { current: true, label: "AI 面试" }];

// ─────────────── PageHeader (matches _components/page-header.tsx) ───────────────
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
  email: string;
  role: string;
  round: string;
  status: { label: string; tone: "success" | "warning" | "info" | "outline" };
  duration: string;
  scheduledAt: string;
}

const INTERVIEWS: InterviewRow[] = [
  {
    candidate: "李铭",
    duration: "24:18",
    email: "li.ming@example.com",
    role: "资深前端工程师",
    round: "一面",
    scheduledAt: "2025-05-12 14:32",
    status: { label: "已结束", tone: "success" },
  },
  {
    candidate: "王欣",
    duration: "—",
    email: "wang.xin@example.com",
    role: "增长产品经理",
    round: "一面",
    scheduledAt: "2025-05-12 10:18",
    status: { label: "进行中", tone: "warning" },
  },
  {
    candidate: "赵安",
    duration: "—",
    email: "zhao.an@example.com",
    role: "后端架构师",
    round: "一面",
    scheduledAt: "2025-05-11 16:00",
    status: { label: "待开始", tone: "info" },
  },
  {
    candidate: "陈佳",
    duration: "32:05",
    email: "chen.jia@example.com",
    role: "数据分析师",
    round: "二面",
    scheduledAt: "2025-05-10 11:24",
    status: { label: "已结束", tone: "success" },
  },
  {
    candidate: "周斌",
    duration: "—",
    email: "zhou.bin@example.com",
    role: "运营专员",
    round: "一面",
    scheduledAt: "2025-05-09 09:18",
    status: { label: "已取消", tone: "outline" },
  },
];

// 对齐 ui/badge.tsx variants:
// success: bg-emerald-500/15 text-emerald-700
// warning: bg-amber-500/15 text-amber-700
// info:    bg-sky-500/15 text-sky-700
// outline: border border-border bg-transparent text-foreground
const TONE_CLASS: Record<InterviewRow["status"]["tone"], string> = {
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  outline: "border border-border bg-transparent text-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

function InterviewListBackground() {
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        description="管理所有候选人的 AI 面试轮次，查看实时状态、对话记录与结构化评估。"
        title="AI 面试"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-[15rem]">
          <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent pr-3 pl-9 text-muted-foreground text-sm">
            搜索候选人
          </div>
        </div>
        <div className="ml-auto">
          <span className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm">
            发起面试
          </span>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-xs">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b bg-muted/40">
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">候选人</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">岗位</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">轮次</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">耗时</th>
              <th className="h-10 px-3 text-left font-medium text-muted-foreground">创建时间</th>
              <th className="h-10 px-3 text-right font-medium text-muted-foreground" />
            </tr>
          </thead>
          <tbody>
            {INTERVIEWS.map((r) => (
              <tr className="border-border border-b last:border-b-0" key={r.candidate}>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="size-7 rounded-full bg-gradient-to-br from-sky-400/70 to-indigo-500/70" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.candidate}</div>
                      <div className="truncate text-muted-foreground text-xs">{r.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">{r.role}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.round}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium text-xs ${TONE_CLASS[r.status.tone]}`}
                  >
                    {r.status.label}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground tabular-nums">{r.duration}</td>
                <td className="px-3 py-3 text-muted-foreground tabular-nums">{r.scheduledAt}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <span className="grid size-7 place-items-center rounded-md text-muted-foreground">
                      <PencilIcon className="size-4" />
                    </span>
                    <span className="grid size-7 place-items-center rounded-md text-muted-foreground">
                      <MoreHorizontalIcon className="size-4" />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────── Modal — header (TabsList + headerExtra) ───────────────
function ModalTabs() {
  // 真实 TabsList (default variant): inline-flex h-9 w-fit (sm:w-auto) items-center justify-center rounded-lg p-[3px] bg-muted
  // TabsTrigger: relative inline-flex h-[calc(100%-1px)] flex-1 sm:min-w-[6em] sm:flex-none items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium
  //   active: data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm
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
  // overallScore 行: flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5
  //   - text-2xl text-primary tabular-nums font-medium
  //   - text-muted-foreground text-sm "/ 100"
  //   - Badge ml-auto (success variant)
  // overallAssessment: text-muted-foreground text-sm leading-normal
  // questions: each rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm
  //   - flex items-start justify-between gap-2: "1. question" + score "92/100"
  //   - assessment: mt-1.5 text-muted-foreground leading-normal
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
        <span className="font-medium text-2xl text-primary tabular-nums">86</span>
        <span className="text-muted-foreground text-sm">/ 100</span>
        <span className="ml-auto inline-flex items-center rounded-md border border-transparent bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-700 text-xs dark:text-emerald-300">
          推荐进入下一轮
        </span>
      </div>
      <p className="text-muted-foreground text-sm leading-normal">
        候选人具备完整的微前端架构落地经验，技术深度与工程素养扎实，能用数据讲清楚优化收益。沟通节奏清晰、能主动展开追问。团队协作部分案例描述偏简略，建议在下一轮补充跨团队推动决策的具体例子。
      </p>
      <div className="space-y-2">
        {QUESTIONS.map((q) => (
          <div
            className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
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
    <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-50 w-[min(96%,1280px)]">
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
            <span className="inline-flex items-center rounded-md border border-transparent bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-700 text-xs dark:text-emerald-300">
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
      <AppShell
        bodyClassName="bg-sidebar dark:bg-background"
        breadcrumb={BREADCRUMB}
        sidebar={<StudioNav activeLabel="AI 面试" />}
        tab="studio"
      >
        <EvaluationCanvas />
      </AppShell>
    </ScreenFrame>
  );
}
