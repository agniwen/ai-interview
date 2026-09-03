import { IconFileText, IconSearch, IconX } from "@tabler/icons-react";
// 用途：process step 4 简化版 UI——「候选人详情」Modal (mode="interview", size="full") 叠在
// AI 面试列表页之上；当前选中 tab：面试报告，对齐真实 EvaluationResults 的卡片结构。
// Purpose: simplified UI of StudioPersonDetailDialog (mode="interview", size="full")
// laid over the AI 面试 list page. Active tab "面试报告" mirrors EvaluationResults.

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
    candidate: "真嗣",
    createdAt: "2025-05-12 14:32",
    creator: "葛城美里",
    email: "shinji@example.com",
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
    candidate: "明日香",
    createdAt: "2025-05-12 09:18",
    creator: "赤木律子",
    email: "asuka@example.com",
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
    candidate: "绫波丽",
    createdAt: "2025-05-11 16:05",
    creator: "碇源堂",
    email: "rei.ayanami@example.com",
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
    candidate: "渚薰",
    createdAt: "2025-05-10 11:24",
    creator: "葛城美里",
    email: "kaworu@example.com",
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
    candidate: "真希波",
    createdAt: "2025-05-09 09:18",
    creator: "赤木律子",
    email: "mari@example.com",
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
        <div className="rounded-xl border border-border bg-background p-4" key={item.label}>
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
        description="查看每位候选人的 AI 面试安排、进展和报告，方便随时跟进。"
        title="AI 面试"
      />
      <SummaryStats />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-[15rem]">
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent pr-3 pl-9 text-muted-foreground text-sm">
            搜索候选人、岗位、轮次或简历名
          </div>
        </div>
        <span className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-muted-foreground text-sm">
          全部状态
        </span>
      </div>
      <Table className="table-fixed" variant="card">
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
          {INTERVIEWS.map((r) => (
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
              <TableCell className="text-muted-foreground tabular-nums">{r.scheduledAt}</TableCell>
              <TableCell aria-label={`状态：${r.status.label}`}>
                <Badge variant={r.status.tone}>{r.status.label}</Badge>
              </TableCell>
              <TableCell>
                {r.report ? (
                  <Badge variant="success">已生成</Badge>
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
    { active: true, label: "结果" },
    { active: false, label: "经历" },
    { active: false, label: "Agent 提示词" },
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
        <IconFileText className="size-4" />
        预览简历
      </span>
    </div>
  );
}

function EvaluationContent() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex h-9 w-fit items-center rounded-md border border-input px-3 text-sm">
        第一轮 · 2025-05-13 10:30
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="relative flex flex-col rounded-2xl bg-muted/72 p-1">
          <div className="flex h-8 items-center justify-between px-4">
            <span className="font-semibold text-sm">面试结果</span>
            <Badge variant="success">已生成</Badge>
          </div>
          <div className="relative flex-1 rounded-xl border border-muted bg-background px-4 py-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">开始时间</p>
                <p className="mt-1">2025-05-13 10:30</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">结束时间</p>
                <p className="mt-1">2025-05-13 11:08</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-6 border-border/50 border-t pt-5 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">评分</p>
                <p className="mt-1 font-medium">86 / 100</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">建议</p>
                <Badge className="mt-1" variant="success">
                  推荐进入下一轮
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">对话</p>
                <p className="mt-1">12 次候选人回复</p>
              </div>
            </div>
            <p className="mt-5 border-border/50 border-t pt-5 text-muted-foreground text-sm leading-6">
              候选人具备完整的微前端架构落地经验，技术深度与工程素养扎实；跨团队推动案例建议在下一轮继续确认。
            </p>
          </div>
        </div>
        <div className="relative flex flex-col rounded-2xl bg-muted/72 p-1">
          <div className="flex h-8 items-center px-4 font-semibold text-sm">候选人信息</div>
          <div className="relative flex-1 rounded-xl border border-muted bg-background px-4 py-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">姓名</p>
                <p className="mt-1">真嗣</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">目标岗位</p>
                <p className="mt-1">资深前端工程师</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">邮箱</p>
                <p className="mt-1">shinji@example.com</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">简历</p>
                <p className="mt-1">简历_真嗣.pdf</p>
              </div>
            </div>
          </div>
        </div>
        {[
          ["表单题", "共 3 题", "候选人已完成基本信息与工作偏好填写。"],
          ["沟通题", "共 8 题", "完整记录岗位核心能力与项目证据。"],
        ].map(([title, count, copy]) => (
          <div className="relative flex flex-col rounded-2xl bg-muted/72 p-1" key={title}>
            <div className="flex h-8 items-center gap-2 px-4">
              <span className="font-semibold text-sm">{title}</span>
              <Badge variant="outline">{count}</Badge>
            </div>
            <div className="relative rounded-xl border border-muted bg-background px-4 py-5 text-muted-foreground text-sm">
              {copy}
            </div>
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
  // - Inner card: modal surface with its real whisper shadow; no extra screen-frame shadow.
  // - Header (stack): border-b px-6 pt-5 pb-4 + gap-1.5 + title text-lg font-semibold + description text-sm muted + headerExtra
  // - Close X: absolute right-4 top-4 rounded-xs opacity-70
  // - Body: min-h-0 flex-1 overflow-y-auto px-6 py-5
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-50 w-[min(96%,1440px)]">
      <div className="relative flex max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[0_4px_24px_rgb(0_0_0/0.05)] dark:shadow-[0_4px_24px_rgb(0_0_0/0.2)]">
        {/* Close button */}
        <span className="absolute top-4 right-4 grid size-7 place-items-center rounded-xs text-foreground/70 opacity-70">
          <IconX className="size-4" />
        </span>

        {/* Header (stack layout) */}
        <div className="flex shrink-0 flex-col gap-1.5 border-b px-5 pt-4 pb-3 text-left">
          <div className="flex flex-wrap items-center gap-3 font-semibold text-foreground text-lg leading-none">
            <span>真嗣</span>
            {/* Completed evaluation badge */}
            <Badge variant="success">已结束</Badge>
          </div>
          <p className="text-muted-foreground text-sm">资深前端工程师 · 简历_真嗣.pdf</p>
          <ModalTabs />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-background px-5 py-4">
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
