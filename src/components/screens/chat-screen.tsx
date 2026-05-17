// 用途：landing 用「简历筛选 Chat」简化版 UI，对齐真实 ChatWorkspace：
// 顶部 QuickSuggestions pills → 中间 ConversationView (含 PDF 卡) → 底部圆角 Composer。
// Purpose: simplified UI of the chat-style resume screening surface; mirrors
// the real ChatWorkspace: QuickSuggestions pills → conversation → rounded composer.
import { ArrowUpIcon, FileTextIcon, PaperclipIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, ChatNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ current: true, label: "简历筛选助手" }];

const QUICK_SUGGESTIONS = [
  "列出候选人的优点、缺点、风险关键项",
  "这份简历是否建议进入面试？",
  "针对这份简历，生成一组面试追问问题",
  "提炼候选人的核心竞争力和岗位匹配度",
  "对比这几份简历，按综合匹配度排序",
];

function QuickSuggestionsRow() {
  return (
    <section className="mx-auto w-full max-w-5xl px-3 pt-3">
      <p className="mb-2 px-1 font-medium text-[11px] text-muted-foreground">快速提问</p>
      <div className="flex gap-2 overflow-hidden">
        {QUICK_SUGGESTIONS.map((s) => (
          <span
            className="shrink-0 truncate rounded-2xl border border-border/70 bg-card/70 px-3 py-1.5 text-[11px] text-foreground/85"
            key={s}
          >
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

function MessageAuthor({
  align,
  label,
  time,
}: {
  align: "left" | "right";
  label: string;
  time: string;
}) {
  return (
    <p
      className={`mb-1.5 text-[10.5px] text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {label} · {time}
    </p>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-foreground/[0.05] px-4 py-2.5 text-[13px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function AssistantBlock({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[88%] text-[13px] leading-relaxed text-foreground/90">{children}</div>
  );
}

function ResumeAttachmentCard({ filename }: { filename: string }) {
  return (
    <div className="flex w-[260px] flex-col gap-3 rounded-lg border border-border/65 bg-card p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded bg-rose-500/10 text-rose-600">
          <FileTextIcon className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[12px]">{filename}</p>
          <p className="truncate text-[10px] text-muted-foreground">application/pdf</p>
        </div>
      </div>
      <div className="flex gap-1.5 border-border/60 border-t pt-2.5 text-[10px]">
        <span className="flex-1 rounded border border-border/60 px-2 py-1 text-center text-foreground/80">
          预览
        </span>
        <span className="flex-1 rounded border border-border/60 px-2 py-1 text-center text-foreground/80">
          查看结构化
        </span>
        <span className="flex-1 rounded border border-border/60 px-2 py-1 text-center text-foreground/80">
          一键入库
        </span>
      </div>
    </div>
  );
}

function CandidateCard({
  name,
  fit,
  tone,
  highlights,
  risk,
}: {
  name: string;
  fit: number;
  tone: "positive" | "neutral";
  highlights: string[];
  risk: string;
}) {
  const barColor = tone === "positive" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div className="rounded-lg border border-border/65 bg-card p-3">
      <div className="flex items-baseline justify-between">
        <div className="font-medium text-[12px]">{name}</div>
        <div className="flex items-baseline gap-1">
          <span className="font-semibold text-[14px] tabular-nums">{fit}</span>
          <span className="text-[9px] text-muted-foreground">匹配度</span>
        </div>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className={`h-full ${barColor}`} style={{ width: `${fit}%` }} />
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[10px]">
        {highlights.map((h) => (
          <li className="flex items-start gap-1 text-foreground/80" key={h}>
            <span className="mt-1 size-1 shrink-0 rounded-full bg-emerald-500" />
            <span>{h}</span>
          </li>
        ))}
        <li className="flex items-start gap-1 text-muted-foreground">
          <span className="mt-1 size-1 shrink-0 rounded-full bg-amber-500" />
          <span>{risk}</span>
        </li>
      </ul>
    </div>
  );
}

function ConversationView() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <MessageAuthor align="right" label="张三" time="14:32" />
        <div className="flex justify-end">
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <ResumeAttachmentCard filename="简历_李铭.pdf" />
              <ResumeAttachmentCard filename="简历_王欣.pdf" />
            </div>
            <UserBubble>岗位是「资深前端工程师」，帮我对比这两份简历，给出筛选建议。</UserBubble>
          </div>
        </div>
      </div>

      <div>
        <MessageAuthor align="left" label="简历筛选助手" time="14:32" />
        <AssistantBlock>
          <p className="mb-2">
            结合「资深前端工程师」JD，给你一个对比视图。两位候选人都符合 5
            年以上经验门槛，但岗位贴合度有差异：
          </p>
          <div className="my-2 grid grid-cols-2 gap-2">
            <CandidateCard
              fit={92}
              highlights={["微前端架构主导", "性能优化 2.4s→1.1s", "团队 leader 经验"]}
              name="李铭"
              risk="近一年项目偏管理"
              tone="positive"
            />
            <CandidateCard
              fit={74}
              highlights={["React 熟练", "组件库贡献"]}
              name="王欣"
              risk="无大型项目主导经验"
              tone="neutral"
            />
          </div>
          <p>
            综合来看，<span className="font-medium text-foreground">李铭</span>
            与岗位贴合度更高，建议优先安排面试；王欣经验扎实但缺少架构沉淀，可作为备选。
          </p>
        </AssistantBlock>
      </div>
    </div>
  );
}

function Composer() {
  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-3">
      <div className="rounded-[1.3rem] border border-border/65 bg-card/90 px-4 pt-3 pb-2.5 shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)]">
        <div className="min-h-12 text-[13px] leading-relaxed text-muted-foreground">
          张铭在性能优化方面有哪些具体案例？
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
        </div>
        <div className="mt-2 flex items-center justify-between border-border/40 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <span className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.05]">
              <PaperclipIcon className="size-3.5" strokeWidth={1.75} />
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10.5px]">
              <SparklesIcon className="size-3 text-primary" strokeWidth={1.75} />
              <span className="font-medium">岗位：资深前端工程师</span>
              <span className="text-muted-foreground">已应用</span>
            </span>
            <span className="rounded-md border border-border/60 px-2 py-1 text-[10.5px] text-muted-foreground">
              GPT · 思考模式
            </span>
          </div>
          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
            <ArrowUpIcon className="size-3.5" strokeWidth={2.25} />
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatContent() {
  return (
    <div className="flex h-full flex-col">
      <QuickSuggestionsRow />
      <div className="flex-1 overflow-hidden">
        <ConversationView />
      </div>
      <Composer />
    </div>
  );
}

export function ChatScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <AppShell
        bodyClassName="bg-background"
        breadcrumb={BREADCRUMB}
        headerClassName="bg-background/60 backdrop-blur-md"
        sidebar={<ChatNav />}
        tab="chat"
      >
        <ChatContent />
      </AppShell>
    </ScreenFrame>
  );
}
