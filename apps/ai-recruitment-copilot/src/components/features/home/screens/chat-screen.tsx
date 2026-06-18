// 用途：landing 用「简历筛选 Chat」简化版 UI，1:1 对齐真实组件：
// - ChatHeader: SidebarInsetHeader 面包屑 "简历筛选助手" + bg-background/60 backdrop-blur-md
// - QuickSuggestions: max-w-5xl px-3 + "快速提问" 标签 + 圆角 pill (rounded-2xl border-border/70 bg-card/70)
// - Message: user 气泡 (bg-white border rounded-2xl px-3 py-2 max-w-[88%]) / assistant 无气泡铺满
// - PDF 卡: rounded-lg border bg-card p-3 + filename + (预览/查看结构化/一键入库) 三按钮行 border-t pt-3
// - Composer: PromptInput rounded-[1.3rem] + footer tools (+/settings/download/model) + submit
import {
  ArrowUpIcon,
  DownloadIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "@/components/icons/hugeicons";
import type { ReactNode } from "react";
import { AppShell, ChatNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

const BREADCRUMB: BreadcrumbCrumb[] = [{ current: true, label: "简历筛选助手" }];

const QUICK_SUGGESTIONS = [
  "列出候选人的优点、缺点、风险关键项，团队定位、职级定级。",
  "这份简历是否建议进入面试？请给出理由和建议的面试重点。",
  "针对这份简历，生成一组面试追问问题，侧重验证项目真实性。",
  "帮我提炼候选人的核心竞争力和岗位匹配度分析。",
  "对比这几份简历，按综合匹配度排序并说明推荐理由。",
];

function QuickSuggestionsRow() {
  // 真实 mx-auto mb-0.5 w-full max-w-5xl px-2 sm:px-3 + heading + Suggestions (gap-2.5)
  return (
    <section className="mx-auto mb-0.5 w-full max-w-5xl px-3">
      <p className="mb-2 px-1 font-medium text-muted-foreground text-xs">快速提问</p>
      <div className="flex gap-2.5 overflow-hidden px-1 pb-1">
        {QUICK_SUGGESTIONS.map((s) => (
          <span
            className="h-auto  shrink-0 whitespace-normal rounded-2xl border border-border/70 bg-card/70 px-4 py-2 text-left text-xs leading-normal"
            key={s}
          >
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

// ─────────────── Message component (real) ───────────────
function Message({ children, from }: { children: ReactNode; from: "user" | "assistant" }) {
  return (
    <div
      className={`group flex w-full max-w-full flex-col gap-2 ${
        from === "user" ? "is-user ml-auto justify-end" : "is-assistant"
      }`}
    >
      {children}
    </div>
  );
}

function MessageContent({ children, from }: { children: ReactNode; from: "user" | "assistant" }) {
  // 真实 MessageContent:
  // base: flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm leading-7
  // user: ml-auto bg-white border border-border/70 px-3 py-2 rounded-2xl max-w-[88%] text-foreground
  // assistant: w-full max-w-[100%] text-foreground
  if (from === "user") {
    return (
      <div className="ml-auto flex w-fit min-w-0 max-w-[88%] flex-col gap-2 rounded-2xl border border-border/70 bg-white px-3 py-2 text-foreground text-sm leading-7 dark:bg-secondary">
        {children}
      </div>
    );
  }
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-2 text-foreground text-sm leading-7">
      {children}
    </div>
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
  // 真实 ChatMessageItem: <p class="mb-2 text-muted-foreground text-xs"> + 右对齐时 text-right
  return (
    <p
      className={`mb-2 text-muted-foreground text-xs ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label} · {time}
    </p>
  );
}

// ─────────────── PDF attachment card (real ChatMessageItem) ───────────────
function PdfFileIcon({ className }: { className?: string }) {
  // 简化 PdfFileIcon: 红色文件外框 + PDF 标签
  return (
    <svg className={className} fill="none" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 4h14l6 6v22a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        fill="white"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M22 4v6h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect fill="#F08F8A" height="10" rx="1.5" width="20" x="4" y="20" />
      <text
        fill="white"
        fontFamily="ui-sans-serif, system-ui"
        fontSize="6"
        fontWeight="700"
        textAnchor="middle"
        x="14"
        y="27"
      >
        PDF
      </text>
    </svg>
  );
}

function PdfAttachmentCard({ filename }: { filename: string }) {
  // 真实 ChatMessageItem PDF 卡: flex w-full flex-col gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30
  // 内容: filename + mediaType + (PdfPreviewButton | ParsedResumeButton | ResumeImportButton) border-t pt-3
  return (
    <div className="flex w-[280px] flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded">
          <PdfFileIcon className="size-9 text-foreground/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{filename}</p>
          <p className="truncate text-muted-foreground text-xs">application/pdf</p>
        </div>
      </div>
      <div className="flex items-stretch gap-2 border-t pt-3 text-xs">
        <span className="flex flex-1 basis-0 items-center justify-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 font-medium">
          预览
        </span>
        <span className="flex flex-1 basis-0 items-center justify-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 font-medium">
          查看结构化
        </span>
        <span className="flex flex-1 basis-0 items-center justify-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 font-medium">
          一键入库
        </span>
      </div>
    </div>
  );
}

// ─────────────── Assistant comparison card (markdown-rendered fake) ───────────────
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
  const barColor = tone === "positive" ? "bg-emerald-500/45" : "bg-amber-500/45";
  return (
    <div className="rounded-lg border border-border/65 bg-background p-3">
      <div className="flex items-baseline justify-between">
        <div className="font-medium text-sm">{name}</div>
        <div className="flex items-baseline gap-1">
          <span className="font-semibold text-base tabular-nums">{fit}</span>
          <span className="text-[10px] text-muted-foreground">匹配度</span>
        </div>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className={`h-full ${barColor}`} style={{ width: `${fit}%` }} />
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[11px]">
        {highlights.map((h) => (
          <li className="flex items-start gap-1 text-foreground/85" key={h}>
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-500/45" />
            <span>{h}</span>
          </li>
        ))}
        <li className="flex items-start gap-1 text-muted-foreground">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500/45" />
          <span>{risk}</span>
        </li>
      </ul>
    </div>
  );
}

function ConversationView() {
  // 真实 ConversationView: max-w-5xl 容器 + 居中滚动
  // 单 message 之间用 gap-6 区分
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-3 py-6">
      {/* User message: PDF 附件 + 文本气泡 */}
      <div>
        <MessageAuthor align="right" label="郭靖" time="14:32" />
        <Message from="user">
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <PdfAttachmentCard filename="简历_李铭.pdf" />
              <PdfAttachmentCard filename="简历_王欣.pdf" />
            </div>
            <MessageContent from="user">
              <p>岗位是「资深前端工程师」，帮我对比这两份简历，给出筛选建议。</p>
            </MessageContent>
          </div>
        </Message>
      </div>

      {/* Assistant message */}
      <div>
        <MessageAuthor align="left" label="简历筛选助手" time="14:32" />
        <Message from="assistant">
          <MessageContent from="assistant">
            <p>
              结合「资深前端工程师」JD，给你一个对比视图。两位候选人都符合 5
              年以上经验门槛，但岗位贴合度有差异：
            </p>
            <div className="grid grid-cols-2 gap-3 not-prose">
              <CandidateCard
                fit={92}
                highlights={["微前端架构主导", "性能优化 2.4s → 1.1s", "团队 leader 经验"]}
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
              综合来看，<strong className="font-semibold">李铭</strong>
              与岗位贴合度更高，建议优先安排面试；王欣经验扎实但缺少架构沉淀，可作为备选。
            </p>
          </MessageContent>
        </Message>
      </div>
    </div>
  );
}

// ─────────────── Composer (real PromptInput) ───────────────
function ComposerToolButton({ children }: { children: ReactNode }) {
  // 对齐 PromptInputActionMenuTrigger / Button variant="ghost" size="icon-sm" h-8 w-8 rounded-md
  return (
    <span className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent">
      {children}
    </span>
  );
}

function ModelPickerChip() {
  // 对齐 ModelPicker 简化: 显示当前 model 名 + chevron
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 text-foreground/80 text-xs">
      <SparklesIcon className="size-3.5" />
      <span className="font-medium">claude-opus-4-7</span>
    </span>
  );
}

function Composer() {
  // 真实 PromptInput 容器：
  // rounded-[1.3rem] border-border/65 bg-white shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)]
  // 内部分为 Header (附件) / Body (textarea) / Footer (tools + submit)
  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-4">
      <div className="rounded-[1.3rem] border border-border/65 bg-white shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)] dark:bg-secondary">
        {/* PromptInputBody: textarea */}
        <div className="px-4 pt-4 pb-2">
          <p className="min-h-20 text-foreground/85 text-sm leading-relaxed">
            张铭在性能优化方面有哪些具体案例？
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
          </p>
        </div>
        {/* PromptInputFooter: justify-between gap-1 + tools left + submit right */}
        <div className="flex items-center justify-between gap-1 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <ComposerToolButton>
              <PlusIcon className="size-4" />
            </ComposerToolButton>
            <ComposerToolButton>
              <SettingsIcon className="size-4" />
            </ComposerToolButton>
            <ComposerToolButton>
              <DownloadIcon className="size-4" />
            </ComposerToolButton>
            <ModelPickerChip />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden select-none text-muted-foreground text-xs sm:inline">
              在招岗位：资深前端工程师
            </span>
            {/* PromptInputSubmit: rounded-full bg-primary/80 size-9 */}
            <span className="grid size-9 place-items-center rounded-full bg-primary/80 text-primary-foreground">
              <ArrowUpIcon className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatContent() {
  // 真实 ChatWorkspace: relative flex h-full w-full flex-col pb-4 pt-4
  return (
    <div className="relative flex h-full w-full flex-col pt-4 pb-4">
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
        bodyClassName="bg-background dark:bg-background"
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
