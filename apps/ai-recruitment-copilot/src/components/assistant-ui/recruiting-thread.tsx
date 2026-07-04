"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  makeAssistantToolUI,
  MessagePrimitive,
  ThreadPrimitive,
  useEditComposer,
  useMessage,
} from "@assistant-ui/react";
import type { TextMessagePartComponent } from "@assistant-ui/react";
import {
  IconArrowDown,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconPencil,
  IconRefresh,
  IconSend2,
  IconSquare,
  IconX,
} from "@tabler/icons-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  ChangeEvent,
  ComponentProps,
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PropsWithChildren,
  ReactNode,
} from "react";
import { toast } from "sonner";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { Button } from "@/components/ui/button";
import { confirmRecruitingAction } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@/lib/utils";
import { notifyConversationsChanged } from "@/components/features/chat/lib/chat-events";

interface CandidateSummaryCard {
  candidateName: string;
  id: string;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  keySkills: string[];
  notes: string | null;
  pipelineStage: string;
  resumeSummary: string | null;
  targetRole: string | null;
  updatedAt: string;
  workYears: number | null;
}

interface SearchResumeRecordsResult {
  candidateSummaryCards?: CandidateSummaryCard[];
  citations?: CopilotCitation[];
  retrievalMode?: "combined" | "semantic" | "structured" | "structured_text";
  semanticHitCount?: number;
  total?: number;
}

interface CopilotCitation {
  id: string;
  label: string;
  recordType: "job_description" | "resume_pool_item" | "resume_record";
  secondaryLabel: string | null;
}

interface RecruitingActionProposal {
  explanation: string;
  id: string;
  payload: Record<string, unknown>;
  title: string;
  type: "bind_candidate_to_job" | "advance_candidate_stage" | "generate_interview_questions";
}

interface RecruitingActionProposalResult {
  proposal?: RecruitingActionProposal;
}

type ProposalStatus = "confirmed" | "failed" | "ignored" | "pending";

interface RecruitingCopilotContextValue {
  citations: CopilotCitation[];
  conversationId: string | null;
  proposalStatuses: Record<string, ProposalStatus>;
  proposals: RecruitingActionProposal[];
  markProposal: (id: string, status: ProposalStatus) => void;
  upsertCitations: (citations: CopilotCitation[]) => void;
  upsertProposal: (proposal: RecruitingActionProposal) => void;
}

const RecruitingCopilotContext = createContext<RecruitingCopilotContextValue | null>(null);

function useRecruitingCopilotContext() {
  const context = useContext(RecruitingCopilotContext);
  if (!context) {
    throw new Error("RecruitingCopilotContext is missing.");
  }
  return context;
}

function mergeByKey<T>(current: T[], incoming: T[], keyOf: (value: T) => string): T[] {
  const map = new Map(current.map((item) => [keyOf(item), item]));
  for (const item of incoming) {
    map.set(keyOf(item), item);
  }
  return [...map.values()];
}

export function RecruitingCopilotContextProvider({
  children,
  conversationId,
}: PropsWithChildren<{ conversationId: string | null }>) {
  const [citations, setCitations] = useState<CopilotCitation[]>([]);
  const [proposals, setProposals] = useState<RecruitingActionProposal[]>([]);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalStatus>>({});

  useEffect(() => {
    setCitations([]);
    setProposals([]);
    setProposalStatuses({});
  }, [conversationId]);

  const upsertCitations = useCallback((next: CopilotCitation[]) => {
    if (next.length === 0) {
      return;
    }
    setCitations((current) =>
      mergeByKey(current, next, (citation) => `${citation.recordType}:${citation.id}`),
    );
  }, []);

  const upsertProposal = useCallback((proposal: RecruitingActionProposal) => {
    setProposals((current) => mergeByKey(current, [proposal], (item) => item.id));
    setProposalStatuses((current) => ({
      ...current,
      [proposal.id]: current[proposal.id] ?? "pending",
    }));
  }, []);

  const markProposal = useCallback((id: string, status: ProposalStatus) => {
    setProposalStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const value = useMemo(
    () => ({
      citations,
      conversationId,
      markProposal,
      proposalStatuses,
      proposals,
      upsertCitations,
      upsertProposal,
    }),
    [
      citations,
      conversationId,
      markProposal,
      proposalStatuses,
      proposals,
      upsertCitations,
      upsertProposal,
    ],
  );

  return (
    <RecruitingCopilotContext.Provider value={value}>{children}</RecruitingCopilotContext.Provider>
  );
}

const activeThreadStyle = {
  "--thread-max-width": "48rem",
} as CSSProperties;

const emptyThreadStyle = {
  "--thread-max-width": "48rem",
} as CSSProperties;

function ToolNotice({ children }: { children: string }) {
  return (
    <div className="aui-tool-notice rounded-2xl border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function ChatGPTIconButton({
  children,
  className,
  label,
  ...props
}: ComponentProps<typeof Button> & {
  children: ReactNode;
  label: string;
}) {
  return (
    <Button
      aria-label={label}
      className={cn(
        "size-8 rounded-lg bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
      {...props}
    >
      {children}
    </Button>
  );
}

function BranchPicker({ className }: { className?: string }) {
  return (
    <BranchPickerPrimitive.Root
      className={cn(
        "aui-branch-picker text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      hideWhenSingleBranch
    >
      <BranchPickerPrimitive.Previous asChild>
        <ChatGPTIconButton label="上一条">
          <IconArrowDown className="size-4 rotate-90" />
        </ChatGPTIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <ChatGPTIconButton label="下一条">
          <IconArrowDown className="size-4 -rotate-90" />
        </ChatGPTIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root
      autohide="not-last"
      className="aui-assistant-action-bar -ms-1 flex gap-0 text-muted-foreground"
      hideWhenRunning
    >
      <ActionBarPrimitive.Copy asChild>
        <ChatGPTIconButton label="复制">
          <AuiIf condition={(state) => state.message.isCopied}>
            <IconCheck className="size-4" />
          </AuiIf>
          <AuiIf condition={(state) => !state.message.isCopied}>
            <IconCopy className="size-4" />
          </AuiIf>
        </ChatGPTIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <ChatGPTIconButton label="重新生成">
          <IconRefresh className="size-4" />
        </ChatGPTIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}

function UserActionBar() {
  return (
    <ActionBarPrimitive.Root
      autohide="not-last"
      className="aui-user-action-bar flex items-center justify-end gap-0"
      hideWhenRunning
    >
      <ActionBarPrimitive.Copy asChild>
        <ChatGPTIconButton label="复制">
          <AuiIf condition={(state) => state.message.isCopied}>
            <IconCheck className="size-4" />
          </AuiIf>
          <AuiIf condition={(state) => !state.message.isCopied}>
            <IconCopy className="size-4" />
          </AuiIf>
        </ChatGPTIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Edit asChild>
        <ChatGPTIconButton label="编辑">
          <IconPencil className="size-4" />
        </ChatGPTIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
}

function EditComposer() {
  return (
    <MessagePrimitive.Root className="aui-edit-composer-wrapper flex flex-col px-2">
      <ComposerPrimitive.Root className="aui-edit-composer ms-auto flex w-full max-w-[70%] flex-col rounded-[22px] border bg-background shadow-sm">
        <ComposerPrimitive.Input
          autoFocus
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base text-foreground outline-none"
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button className="h-8 rounded-full px-3.5" size="sm" variant="ghost">
              取消
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button className="h-8 rounded-full px-3.5" size="sm">
              更新
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

const MarkdownTextPart: TextMessagePartComponent = ({ text }) => (
  <MarkdownView className="aui-markdown-text" content={text} />
);

function AssistantMessage() {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message fade-in slide-in-from-bottom-1 animate-in relative w-full min-w-0 duration-150"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content min-w-0 max-w-full text-foreground leading-7 wrap-break-word">
        <MessagePrimitive.Parts components={{ Text: MarkdownTextPart }} />
      </div>
      <div className="mt-1 flex min-h-8 items-center">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root
      className="aui-user-message fade-in slide-in-from-bottom-1 animate-in flex w-full flex-col items-end gap-1 duration-150"
      data-role="user"
    >
      <div className="aui-user-message-content max-w-[70%] rounded-[22px] border border-primary/15 bg-primary/10 px-4 py-2.5 text-foreground leading-6 wrap-break-word empty:hidden dark:bg-primary/15">
        <MessagePrimitive.Parts />
      </div>
      <UserActionBar />
      <BranchPicker className="-me-1 justify-end" />
    </MessagePrimitive.Root>
  );
}

function ThreadMessage() {
  const role = useMessage((message) => message.role);
  const editComposer = useEditComposer({ optional: true });
  const isEditing = editComposer?.isEditing ?? false;
  if (isEditing) {
    return <EditComposer />;
  }
  if (role === "user") {
    return <UserMessage />;
  }
  if (role === "assistant") {
    return <AssistantMessage />;
  }
  return null;
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <div className="aui-composer-shell flex w-full flex-col gap-2 rounded-[28px] border bg-background px-3 py-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-primary/40 focus-within:shadow-[0_6px_24px_-8px_color-mix(in_oklch,var(--primary)_24%,transparent),0_1px_2px_rgba(0,0,0,0.05)]">
        <ComposerPrimitive.Input
          aria-label="招聘问题输入"
          autoFocus
          className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
          enterKeyHint="send"
          placeholder="输入招聘问题..."
          rows={1}
          submitMode="enter"
        />
        <div className="aui-composer-action-wrapper flex items-center justify-end gap-1">
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <ChatGPTIconButton
                className="size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                label="发送"
              >
                <IconSend2 className="size-4.5" />
              </ChatGPTIconButton>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(state) => state.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <ChatGPTIconButton
                className="size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                label="停止生成"
              >
                <IconSquare className="size-3.5 fill-current" />
              </ChatGPTIconButton>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

function CopilotToolContextReporter({
  citations = [],
  proposal,
}: {
  citations?: CopilotCitation[];
  proposal?: RecruitingActionProposal;
}) {
  const { upsertCitations, upsertProposal } = useRecruitingCopilotContext();
  const citationsKey = JSON.stringify(citations);
  useEffect(() => {
    upsertCitations(JSON.parse(citationsKey) as CopilotCitation[]);
  }, [citationsKey, upsertCitations]);
  useEffect(() => {
    if (proposal) {
      upsertProposal(proposal);
    }
  }, [proposal, upsertProposal]);
  return null;
}

function citationHref(slug: string, citation: CopilotCitation) {
  if (citation.recordType === "job_description") {
    return `/w/${slug}/studio/job-descriptions`;
  }
  if (citation.recordType === "resume_pool_item") {
    return `/w/${slug}/studio/resume-pool`;
  }
  return `/w/${slug}/studio/resumes`;
}

function CitationList({ citations }: { citations: CopilotCitation[] }) {
  const slug = useWorkspaceSlug();
  if (citations.length === 0) {
    return <p className="text-muted-foreground text-sm">当前会话还没有引用系统记录。</p>;
  }
  return (
    <div className="grid gap-2">
      {citations.map((citation) => (
        <a
          className="group flex min-w-0 items-start justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
          href={citationHref(slug, citation)}
          key={`${citation.recordType}:${citation.id}`}
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{citation.label}</span>
            <span className="block truncate text-muted-foreground text-xs">
              {citation.secondaryLabel ?? citation.recordType}
            </span>
          </span>
          <IconExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        </a>
      ))}
    </div>
  );
}

function ProposalList({
  proposals,
  statuses,
}: {
  proposals: RecruitingActionProposal[];
  statuses: Record<string, ProposalStatus>;
}) {
  if (proposals.length === 0) {
    return <p className="text-muted-foreground text-sm">暂无待确认动作。</p>;
  }
  return (
    <div className="grid gap-2">
      {proposals.map((proposal) => (
        <div className="rounded-lg border bg-background px-3 py-2 text-sm" key={proposal.id}>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{proposal.title}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
              {statuses[proposal.id] ?? "pending"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">{proposal.explanation}</p>
        </div>
      ))}
    </div>
  );
}

function ContextPanelContent() {
  const { citations, proposalStatuses, proposals } = useRecruitingCopilotContext();
  const pendingCount = proposals.filter(
    (proposal) => (proposalStatuses[proposal.id] ?? "pending") === "pending",
  ).length;
  return (
    <div className="space-y-5">
      <section>
        <h2 className="font-medium text-sm">引用记录</h2>
        <div className="mt-2">
          <CitationList citations={citations} />
        </div>
      </section>
      <section>
        <h2 className="font-medium text-sm">检索范围</h2>
        <div className="mt-2 rounded-lg border bg-background px-3 py-2 text-sm">
          <p>当前 workspace 简历库与岗位库</p>
          <p className="mt-1 text-muted-foreground text-xs">
            已收集 {citations.length} 条引用，{pendingCount} 个动作待确认。
          </p>
        </div>
      </section>
      <section>
        <h2 className="font-medium text-sm">待确认动作</h2>
        <div className="mt-2">
          <ProposalList proposals={proposals} statuses={proposalStatuses} />
        </div>
      </section>
    </div>
  );
}

function RecruitingContextPanel() {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <aside
        className={cn(
          "hidden min-h-0 border-l bg-muted/20 transition-[width] lg:block",
          desktopOpen ? "w-80" : "w-12",
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-12 items-center justify-between border-b px-3">
            {desktopOpen ? <h2 className="font-medium text-sm">上下文</h2> : null}
            <Button
              aria-label={desktopOpen ? "收起上下文" : "展开上下文"}
              className="ms-auto size-8"
              onClick={() => setDesktopOpen((open) => !open)}
              size="icon"
              type="button"
              variant="ghost"
            >
              {desktopOpen ? <IconX className="size-4" /> : <IconExternalLink className="size-4" />}
            </Button>
          </div>
          {desktopOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <ContextPanelContent />
            </div>
          ) : null}
        </div>
      </aside>
      <Button
        className="fixed right-4 bottom-24 z-30 h-9 rounded-full px-3 shadow-sm lg:hidden"
        onClick={() => setMobileOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        上下文
      </Button>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden">
          <div className="absolute inset-x-3 bottom-20 max-h-[70vh] overflow-y-auto rounded-2xl border bg-background p-3 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-sm">上下文</h2>
              <Button
                aria-label="关闭上下文"
                className="size-8"
                onClick={() => setMobileOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconX className="size-4" />
              </Button>
            </div>
            <ContextPanelContent />
          </div>
        </div>
      ) : null}
    </>
  );
}

export const RecruitingResumeSearchToolUI = makeAssistantToolUI<unknown, SearchResumeRecordsResult>(
  {
    display: "standalone",
    render: ({ result, status }) => {
      const cards = result?.candidateSummaryCards ?? [];
      if (status.type === "running") {
        return <ToolNotice>正在检索候选人...</ToolNotice>;
      }
      if (cards.length === 0) {
        return (
          <>
            <CopilotToolContextReporter citations={result?.citations ?? []} />
            <ToolNotice>未找到匹配候选人。</ToolNotice>
          </>
        );
      }
      return (
        <div className="aui-candidate-card-list grid gap-2">
          <CopilotToolContextReporter citations={result?.citations ?? []} />
          {result?.retrievalMode ? (
            <p className="text-muted-foreground text-xs">
              检索方式：{result.retrievalMode}
              {result.semanticHitCount ? ` · 语义命中 ${result.semanticHitCount}` : ""}
            </p>
          ) : null}
          {cards.map((card) => (
            <article
              className="aui-candidate-card rounded-xl border bg-background p-3"
              key={card.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-sm">{card.candidateName}</h3>
                  <p className="text-muted-foreground text-xs">
                    {card.targetRole ?? "未标注目标岗位"}
                    {card.jobDescriptionName ? ` · ${card.jobDescriptionName}` : ""}
                  </p>
                </div>
                <span className="rounded-full border bg-muted/50 px-2 py-0.5 text-muted-foreground text-xs">
                  {card.pipelineStage}
                </span>
              </div>
              {card.resumeSummary ? (
                <p className="mt-2 line-clamp-2 text-sm leading-6">{card.resumeSummary}</p>
              ) : null}
              {card.keySkills.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {card.keySkills.map((skill) => (
                    <span
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs"
                      key={skill}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {typeof result?.total === "number" && result.total > cards.length ? (
            <p className="text-muted-foreground text-xs">
              还有 {result.total - cards.length} 个候选人未展示。
            </p>
          ) : null}
        </div>
      );
    },
    toolName: "search_resume_records",
  },
);

function statusLabel(status: ProposalStatus) {
  switch (status) {
    case "confirmed": {
      return "已确认";
    }
    case "failed": {
      return "确认失败";
    }
    case "ignored": {
      return "已忽略";
    }
    default: {
      return "待确认";
    }
  }
}

function RecruitingActionProposalCard({ proposal }: { proposal: RecruitingActionProposal }) {
  const slug = useWorkspaceSlug();
  const { conversationId, markProposal, proposalStatuses } = useRecruitingCopilotContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentStatus = proposalStatuses[proposal.id] ?? "pending";
  const isDone = currentStatus === "confirmed" || currentStatus === "ignored";

  const handleConfirm = async () => {
    if (!conversationId || isSubmitting || isDone) {
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await confirmRecruitingAction(slug, conversationId, proposal);
      if (result.status === "failed") {
        markProposal(proposal.id, "failed");
        toast.error(result.message);
        return;
      }
      markProposal(proposal.id, "confirmed");
      notifyConversationsChanged();
      toast.success(result.message);
    } catch (error) {
      markProposal(proposal.id, "failed");
      toast.error(error instanceof Error ? error.message : "确认动作失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIgnore = () => {
    markProposal(proposal.id, "ignored");
  };

  return (
    <article className="aui-action-proposal rounded-xl border bg-background p-3">
      <CopilotToolContextReporter proposal={proposal} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{statusLabel(currentStatus)}</p>
          <h3 className="mt-1 font-medium text-sm">{proposal.title}</h3>
        </div>
        <span className="rounded-full border bg-muted/50 px-2 py-0.5 text-muted-foreground text-xs">
          {proposal.type}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6">{proposal.explanation}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          disabled={isSubmitting || isDone}
          onClick={handleIgnore}
          size="sm"
          type="button"
          variant="outline"
        >
          忽略
        </Button>
        <Button
          disabled={!conversationId || isSubmitting || isDone}
          onClick={handleConfirm}
          size="sm"
          type="button"
        >
          {isSubmitting ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
          确认
        </Button>
      </div>
    </article>
  );
}

export const RecruitingActionProposalToolUI = makeAssistantToolUI<
  unknown,
  RecruitingActionProposalResult
>({
  display: "standalone",
  render: ({ result, status }) => {
    const proposal = result?.proposal;
    if (status.type === "running") {
      return <ToolNotice>正在生成动作建议...</ToolNotice>;
    }
    if (!proposal) {
      return null;
    }
    return <RecruitingActionProposalCard proposal={proposal} />;
  },
  toolName: "propose_recruiting_action",
});

export function RecruitingToolRenderers() {
  return (
    <>
      <RecruitingResumeSearchToolUI />
      <RecruitingActionProposalToolUI />
    </>
  );
}

export function RecruitingThread({ isRunning }: { isRunning: boolean }) {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root flex min-h-0 flex-1 flex-col bg-background text-foreground"
      style={activeThreadStyle}
    >
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport
            autoScroll
            className="aui-thread-viewport min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth"
            scrollToBottomOnRunStart
            turnAnchor="top"
          >
            <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-6 px-4 pt-6 pb-8">
              <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
              {isRunning ? (
                <div className="aui-assistant-working w-fit rounded-2xl bg-muted/55 px-3 py-2 text-muted-foreground text-sm">
                  思考中...
                </div>
              ) : null}
            </div>
          </ThreadPrimitive.Viewport>
          <div className="aui-thread-footer sticky bottom-0 bg-background px-4 pt-2 pb-3">
            <div className="mx-auto w-full max-w-(--thread-max-width)">
              <Composer />
              <p className="mt-2 text-center text-muted-foreground text-xs">
                Copilot 可能出错，请在确认动作前核对候选人和岗位信息。
              </p>
            </div>
          </div>
          <ThreadPrimitive.ScrollToBottom asChild>
            <Button
              aria-label="回到底部"
              className="aui-thread-scroll-to-bottom absolute bottom-40 left-1/2 z-20 size-8 -translate-x-1/2 rounded-full disabled:invisible"
              size="icon"
              type="button"
              variant="outline"
            >
              <IconArrowDown className="size-4" />
            </Button>
          </ThreadPrimitive.ScrollToBottom>
        </div>
        <RecruitingContextPanel />
      </div>
    </ThreadPrimitive.Root>
  );
}

export function NewRecruitingThread({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const canSubmit = text.trim().length > 0 && !disabled;

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    setText(target.value);
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) {
      return;
    }
    const nextText = text.trim();
    setText("");
    await onSubmit(nextText);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div
      className="aui-root aui-thread-root flex min-h-0 flex-1 flex-col bg-background text-foreground"
      style={emptyThreadStyle}
    >
      <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col justify-center px-4 pb-[18vh]">
        <div className="aui-thread-welcome-root mb-6 text-center">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-normal duration-200">
            从哪里开始招聘协作？
          </h1>
        </div>
        <form className="aui-composer-root relative flex w-full flex-col" onSubmit={handleSubmit}>
          <div className="aui-composer-shell flex w-full items-end gap-1 rounded-[28px] border bg-background px-3 py-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-primary/40 focus-within:shadow-[0_6px_24px_-8px_color-mix(in_oklch,var(--primary)_24%,transparent),0_1px_2px_rgba(0,0,0,0.05)]">
            <textarea
              aria-label="招聘问题输入"
              className="aui-composer-input max-h-36 min-h-9 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-base text-foreground leading-6 outline-none placeholder:text-muted-foreground"
              disabled={disabled}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="输入招聘问题..."
              rows={1}
              value={text}
            />
            <Button
              aria-label="发送"
              className="size-9 shrink-0 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90 disabled:bg-primary/20 disabled:text-primary/50 disabled:opacity-100"
              disabled={!canSubmit}
              size="icon"
              title="发送"
              type="submit"
            >
              <IconSend2 className="size-4.5" />
            </Button>
          </div>
        </form>
        <p className="mt-2 text-center text-muted-foreground text-xs">
          Copilot 可能出错，请在确认动作前核对候选人和岗位信息。
        </p>
      </div>
    </div>
  );
}
