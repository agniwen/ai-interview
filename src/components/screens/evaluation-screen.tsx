// 用途：process step 4 简化版 UI——面试结束后的结构化评估视图。
// 对齐真实 EvaluationResults：标题 / 总评 / 推荐 / 逐题打分 / 文字评估。
// Purpose: simplified UI of the post-interview evaluation surface inside Studio.
// Mirrors EvaluationResults: overall score + recommendation + per-question scoring + assessment.
import { BotIcon, CheckIcon, PlayIcon, SparklesIcon, TrendingUpIcon } from "lucide-react";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [
  { label: "Studio" },
  { label: "AI 面试" },
  { current: true, label: "李铭 · 一面" },
];

function CandidateHeader() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-background p-4">
      <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-sky-400/70 to-indigo-500/70 font-medium text-[16px] text-white">
        李铭
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-[16px]">李铭</h2>
          <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 font-medium text-[10px] text-emerald-700 dark:text-emerald-300">
            已完成
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>资深前端工程师</span>
          <span>·</span>
          <span>一面</span>
          <span>·</span>
          <span>耗时 24:18</span>
          <span>·</span>
          <span>面试官 张三</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-3 text-[12px]">
          <PlayIcon className="size-3" strokeWidth={1.75} />
          播放录音
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-[12px] text-primary-foreground">
          推进至下一轮
        </span>
      </div>
    </div>
  );
}

function OverallSummary() {
  return (
    <div className="grid grid-cols-[1.2fr_1fr] gap-3 rounded-xl border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
            <SparklesIcon className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="font-medium text-[13px]">综合评估</span>
        </div>
        <p className="text-[12.5px] text-foreground/85 leading-relaxed">
          候选人具备完整的微前端架构落地经验，技术深度与工程素养扎实，能用数据讲清楚优化收益。沟通节奏清晰、能主动展开追问。
          团队协作部分案例描述偏简略，建议在下一轮补充跨团队推动决策的具体例子。
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
            推荐进入下一轮
          </span>
          <span className="text-muted-foreground">置信度 高</span>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 px-4 py-3">
        <span className="font-medium text-[11px] text-muted-foreground">总评</span>
        <span className="font-semibold text-[44px] leading-none tabular-nums">8.6</span>
        <span className="text-[11px] text-muted-foreground">/ 10 · 4 维度均值</span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-600">
          <TrendingUpIcon className="size-3" strokeWidth={2} />
          高于岗位均值 1.4
        </span>
      </div>
    </div>
  );
}

interface QuestionEval {
  order: number;
  question: string;
  score: number;
  maxScore: number;
  assessment: string;
  tone: "positive" | "neutral" | "warn";
}

const QUESTIONS: QuestionEval[] = [
  {
    assessment: "完整讲清楚商家后台从 monolith → 微前端的演进路径，覆盖 8 个团队的拆分节奏。",
    maxScore: 10,
    order: 1,
    question: "请聊聊你最近主导的一个大型前端项目。",
    score: 9.2,
    tone: "positive",
  },
  {
    assessment: "样式隔离与状态共享的取舍讲得清，shadow DOM + 共享 store 折中方案有具体落地。",
    maxScore: 10,
    order: 2,
    question: "拆分过程中最具挑战的技术决策是什么？",
    score: 8.8,
    tone: "positive",
  },
  {
    assessment: "首屏 2.4s → 1.1s、包体压缩 38%、迭代周期 2 周 → 5 天，数据完整可追溯。",
    maxScore: 10,
    order: 3,
    question: "性能指标变化怎样？给出具体收益。",
    score: 9,
    tone: "positive",
  },
  {
    assessment: "讲到了周会同步与 RFC 流程，但跨团队推动决策的具体例子偏少。",
    maxScore: 10,
    order: 4,
    question: "在多团队协作中，你如何推动技术决策落地？",
    score: 7.6,
    tone: "warn",
  },
];

const TONE_BAR: Record<QuestionEval["tone"], string> = {
  neutral: "bg-sky-500",
  positive: "bg-emerald-500",
  warn: "bg-amber-500",
};

function QuestionRow({ q }: { q: QuestionEval }) {
  const barColor = TONE_BAR[q.tone];
  return (
    <div className="flex flex-col gap-2 border-border/40 border-b px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground/[0.04] font-mono font-medium text-[11px] tabular-nums">
          {String(q.order).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[13px]">{q.question}</div>
          <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">{q.assessment}</p>
        </div>
        <div className="ml-2 flex flex-col items-end gap-1">
          <span className="font-semibold text-[16px] tabular-nums">{q.score.toFixed(1)}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">/ {q.maxScore}</span>
        </div>
      </div>
      <div className="ml-9 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className={`h-full ${barColor}`}
          style={{ width: `${(q.score / q.maxScore) * 100}%` }}
        />
      </div>
    </div>
  );
}

function QuestionList() {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
      <div className="flex items-center justify-between border-border/60 border-b bg-muted/30 px-4 py-2.5">
        <span className="font-medium text-[13px]">逐题评估</span>
        <span className="text-[11px] text-muted-foreground">
          共 4 题 · 均分 {((9.2 + 8.8 + 9 + 7.6) / 4).toFixed(1)}
        </span>
      </div>
      {QUESTIONS.map((q) => (
        <QuestionRow key={q.order} q={q} />
      ))}
    </div>
  );
}

const TRANSCRIPT_PREVIEW = [
  { speaker: "AI", t: "00:42", text: "请聊聊你最近主导的一个大型前端项目。" },
  {
    highlight: true,
    speaker: "候选人",
    t: "00:55",
    text: "我在公司主导了商家后台从 monolith 拆分为微前端的演进，覆盖 8 个业务团队…",
  },
  { followup: true, speaker: "AI", t: "09:08", text: "性能指标变化怎样？" },
  {
    highlight: true,
    speaker: "候选人",
    t: "09:25",
    text: "首屏从 2.4s 降到 1.1s，包体压缩 38%，团队迭代周期从 2 周缩短到 5 天。",
  },
];

function TranscriptPreview() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-foreground/[0.04] text-foreground/80">
            <BotIcon className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="font-medium text-[13px]">对话时间线</span>
          <span className="text-[11px] text-muted-foreground">点击片段跳转录音</span>
        </div>
        <span className="text-[11px] text-muted-foreground underline-offset-4 hover:underline">
          查看全部
        </span>
      </div>
      <ol className="flex flex-col">
        {TRANSCRIPT_PREVIEW.map((m) => (
          <li className="flex gap-3 py-1.5" key={`${m.speaker}-${m.t}`}>
            <span className="w-10 shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {m.t}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-[10.5px]">
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    m.speaker === "AI"
                      ? "bg-primary/10 text-primary"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {m.speaker}
                </span>
                {m.followup ? (
                  <span className="text-[9.5px] text-amber-600 dark:text-amber-400">追问</span>
                ) : null}
              </div>
              <p
                className={`text-[12px] leading-relaxed ${
                  m.highlight ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {m.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const HIGHLIGHTS = [
  "主导微前端拆分，具备完整架构演进经验",
  "性能优化用数据说话：首屏 2.4s → 1.1s",
  "工程化思路系统，能讲清取舍",
];

const WATCHOUTS = ["跨团队协作案例描述偏简略", "缺少远程协作 / 跨地域沟通的具体例子"];

function HighlightsPanel() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-[11px] text-muted-foreground tracking-wide">亮点</span>
        <ul className="flex flex-col gap-1.5">
          {HIGHLIGHTS.map((t) => (
            <li className="flex items-start gap-2 text-[12px] leading-relaxed" key={t}>
              <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" strokeWidth={2} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-[11px] text-muted-foreground tracking-wide">待观察</span>
        <ul className="flex flex-col gap-1.5">
          {WATCHOUTS.map((t) => (
            <li className="flex items-start gap-2 text-[12px] leading-relaxed" key={t}>
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EvaluationContent() {
  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <CandidateHeader />
      <OverallSummary />
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <QuestionList />
        <div className="flex flex-col gap-4">
          <HighlightsPanel />
          <TranscriptPreview />
        </div>
      </div>
    </div>
  );
}

export function EvaluationScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <AppShell breadcrumb={BREADCRUMB} sidebar={<StudioNav activeLabel="AI 面试" />} tab="studio">
        <EvaluationContent />
      </AppShell>
    </ScreenFrame>
  );
}
