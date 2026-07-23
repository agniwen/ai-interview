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
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconPencil,
  IconRefresh,
  IconSquare,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { toast } from "sonner";
import { MarkdownView } from "@/components/features/display/markdown-view";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import {
  UnsupportedResumeDocumentPreviewTooltip,
  isPreviewableResumeDocumentInput,
} from "@/components/features/resume/resume-document-preview-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { confirmRecruitingAction } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@/lib/utils";
import { notifyConversationsChanged } from "@/components/features/chat/lib/chat-events";
import { pipelineStageMeta, pipelineStageSchema } from "@arc/db-schema/studio-interviews";
import { JobDescriptionSelectField } from "@/components/features/studio/interviews/job-description-select-field";
import { RecruitingContextPanel } from "./recruiting-context-panel";
import {
  activeThreadStyle,
  composerSendButtonClass,
  useRecruitingCopilotContext,
} from "./recruiting-copilot-context";
import {
  RecruitingComposerDirectiveChip,
  RecruitingDirectiveText,
} from "./recruiting-directive-text";
import { RecruitingPersonMentionPopover } from "./recruiting-person-mention";
import type {
  CandidateSummaryCard,
  CopilotCitation,
  ProposalStatus,
  RecruitingActionProposal,
  RecruitingActionProposalResult,
  SearchResumeRecordsResult,
} from "./recruiting-copilot-context";
export { RecruitingCopilotContextProvider } from "./recruiting-copilot-context";
export { NewRecruitingThread } from "./new-recruiting-thread";

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
      className="aui-user-action-bar flex min-h-8 items-center justify-end gap-0"
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
      className="aui-assistant-message fade-in slide-in-from-bottom-1 animate-in relative w-full min-w-0 px-2 duration-150"
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
      <div className="aui-user-message-content max-w-[70%] rounded-[22px] border border-border bg-muted/55 px-4 py-2.5 text-foreground leading-6 wrap-break-word empty:hidden dark:bg-muted/35">
        <MessagePrimitive.Parts components={{ Text: RecruitingDirectiveText }} />
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

function RecruitingComposerInput() {
  "use no memo";
  // Lexical renders mentions as inline chips; textarea would show raw `:type[label]{name=id}`.
  return (
    <LexicalComposerInput
      aria-label="招聘问题输入"
      autoFocus
      className={cn(
        "aui-composer-input relative max-h-32 min-h-10 w-full bg-transparent px-2 py-2 text-base text-foreground",
        "[&_.aui-lexical-input]:min-h-10 [&_.aui-lexical-input]:outline-none [&_.aui-lexical-input]:whitespace-pre-wrap [&_p]:m-0",
        "[&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:inset-x-2 [&_.aui-lexical-placeholder]:top-2 [&_.aui-lexical-placeholder]:text-muted-foreground",
      )}
      directiveChip={RecruitingComposerDirectiveChip}
      placeholder="输入招聘问题，或输入 @ 提及候选人..."
      submitMode="enter"
    />
  );
}

function Composer() {
  "use no memo";
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <div className="relative flex w-full flex-col">
        <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
          <div className="aui-composer-shell relative flex w-full flex-col gap-2 rounded-[28px] border border-input bg-background px-3 py-2 transition-colors focus-within:border-foreground/20">
            <RecruitingComposerInput />
            <div className="aui-composer-action-wrapper flex items-center justify-end gap-1">
              <AuiIf condition={(state) => !state.thread.isRunning}>
                <ComposerPrimitive.Send asChild>
                  <Button
                    aria-label="发送"
                    className={composerSendButtonClass}
                    size="icon"
                    type="button"
                  >
                    <IconArrowUp className="size-4" />
                  </Button>
                </ComposerPrimitive.Send>
              </AuiIf>
              <AuiIf condition={(state) => state.thread.isRunning}>
                <ComposerPrimitive.Cancel asChild>
                  <Button
                    aria-label="停止生成"
                    className="size-9 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90"
                    size="icon"
                    type="button"
                  >
                    <IconSquare className="size-3.5 fill-current" />
                  </Button>
                </ComposerPrimitive.Cancel>
              </AuiIf>
            </div>
          </div>
          {/* Mentions must live inside Composer.Root per assistant-ui docs. */}
          <RecruitingPersonMentionPopover />
        </ComposerPrimitive.Root>
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
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

function getPipelineStageLabel(stage: string) {
  const parsed = pipelineStageSchema.safeParse(stage);
  return parsed.success ? pipelineStageMeta[parsed.data].label : "未知阶段";
}

function CandidateResumePreviewIcon({ card }: { card: CandidateSummaryCard }) {
  const { openResumePreview } = useRecruitingCopilotContext();
  const documentKind = getResumeDocumentFileIconKind({ fileName: card.resumeFileName });
  const previewable = isPreviewableResumeDocumentInput({ fileName: card.resumeFileName });
  // Older persisted tool results do not include `hasResumeFile`; avoid
  // pessimistically disabling previews for records that may still have files.
  const hasResumeFile = card.hasResumeFile ?? true;
  const canPreview = hasResumeFile && previewable;
  const label = card.resumeFileName ?? "简历附件";

  if (canPreview) {
    return (
      <TooltipProvider delay={500}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`预览 ${label}`}
                className="size-8 shrink-0 rounded-md p-0"
                onClick={(event) => {
                  event.stopPropagation();
                  openResumePreview({ id: card.id, resumeFileName: card.resumeFileName ?? null });
                }}
                size="icon-sm"
                title={label}
                type="button"
                variant="ghost"
              >
                <ResumeDocumentFileIcon className="size-4" kind={documentKind} />
              </Button>
            }
          />
          <TooltipContent side="top">预览简历</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const disabledIcon = (
    <span
      aria-disabled="true"
      aria-label={hasResumeFile ? "该格式不支持预览" : "暂无可预览简历"}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
      title={hasResumeFile ? undefined : "暂无可预览简历"}
    >
      <ResumeDocumentFileIcon className="size-4" kind={documentKind} />
    </span>
  );

  return hasResumeFile ? (
    <UnsupportedResumeDocumentPreviewTooltip>
      {disabledIcon}
    </UnsupportedResumeDocumentPreviewTooltip>
  ) : (
    disabledIcon
  );
}

function CandidateSummaryCardButton({ card }: { card: CandidateSummaryCard }) {
  const { openResumeDetail } = useRecruitingCopilotContext();
  const stageLabel = getPipelineStageLabel(card.pipelineStage);
  const openDetail = () => openResumeDetail(card.id);

  return (
    <div className="aui-candidate-card group relative w-full rounded-xl border bg-background p-3 text-left transition-colors hover:border-foreground/15 hover:bg-muted/35">
      <button
        aria-label={`查看 ${card.candidateName} 的简历详情`}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={openDetail}
        type="button"
      />
      <div className="pointer-events-none relative z-20 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate font-medium text-sm">{card.candidateName}</h3>
            <IconExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </div>
          <div className="mt-1 grid gap-0.5 text-muted-foreground text-xs">
            <p className="truncate">
              <span className="text-muted-foreground/75">意向岗位：</span>
              <span>{card.targetRole ?? "未标注"}</span>
            </p>
            <p className="truncate">
              <span className="text-muted-foreground/75">关联岗位：</span>
              <span>{card.jobDescriptionName ?? "未绑定"}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="pointer-events-auto">
            <CandidateResumePreviewIcon card={card} />
          </span>
          <span className="rounded-full border bg-muted/50 px-2 py-0.5 text-muted-foreground text-xs">
            {stageLabel}
          </span>
        </div>
      </div>
      {card.resumeSummary ? (
        <p className="pointer-events-none relative z-20 mt-2 line-clamp-2 text-sm leading-6">
          {card.resumeSummary}
        </p>
      ) : null}
      {card.keySkills.length > 0 ? (
        <div className="pointer-events-none relative z-20 mt-2 flex flex-wrap gap-1">
          {card.keySkills.map((skill) => (
            <span
              className="rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-muted-foreground text-xs"
              key={skill}
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}
    </div>
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
            <CandidateSummaryCardButton card={card} key={card.id} />
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

function readJobBindPayload(payload: Record<string, unknown>): {
  jobDescriptionId: string | null;
  poolItemId: string | null;
  resumeRecordId: string | null;
} {
  const resumeRecordId =
    typeof payload.resumeRecordId === "string" && payload.resumeRecordId.length > 0
      ? payload.resumeRecordId
      : null;
  const rawPoolItemId =
    typeof payload.poolItemId === "string" && payload.poolItemId.length > 0
      ? payload.poolItemId
      : null;
  const poolItemId = rawPoolItemId?.startsWith("pool:")
    ? rawPoolItemId.slice("pool:".length)
    : rawPoolItemId;
  const jobDescriptionId =
    typeof payload.jobDescriptionId === "string" && payload.jobDescriptionId.length > 0
      ? payload.jobDescriptionId
      : null;
  return { jobDescriptionId, poolItemId, resumeRecordId };
}

function isJobBindProposal(type: RecruitingActionProposal["type"]) {
  return type === "bind_candidate_to_job" || type === "bind_pool_item_to_job";
}

function withConfirmedJobBindPayload(
  proposal: RecruitingActionProposal,
  jobDescriptionId: string | null,
  bindPayload: ReturnType<typeof readJobBindPayload> | null,
): RecruitingActionProposal {
  if (proposal.type === "bind_candidate_to_job") {
    return {
      ...proposal,
      payload: {
        ...proposal.payload,
        jobDescriptionId,
        resumeRecordId: bindPayload?.resumeRecordId,
      },
    };
  }
  if (proposal.type === "bind_pool_item_to_job") {
    return {
      ...proposal,
      payload: {
        ...proposal.payload,
        jobDescriptionId,
        poolItemId: bindPayload?.poolItemId,
      },
    };
  }
  return proposal;
}

function RecruitingActionProposalCard({ proposal }: { proposal: RecruitingActionProposal }) {
  const slug = useWorkspaceSlug();
  const { conversationId, markProposal, proposalStatuses } = useRecruitingCopilotContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bindPayload = isJobBindProposal(proposal.type)
    ? readJobBindPayload(proposal.payload)
    : null;
  const needsJobPicker = Boolean(bindPayload && !bindPayload.jobDescriptionId);
  const [selectedJobDescriptionId, setSelectedJobDescriptionId] = useState(
    bindPayload?.jobDescriptionId ?? "",
  );
  const currentStatus = proposalStatuses[proposal.id] ?? "pending";
  const isDone = currentStatus === "confirmed" || currentStatus === "ignored";
  const canConfirmBind =
    !isJobBindProposal(proposal.type) ||
    Boolean(selectedJobDescriptionId) ||
    Boolean(bindPayload?.jobDescriptionId);

  const handleConfirm = async () => {
    if (!conversationId || isSubmitting || isDone) {
      return;
    }
    const jobDescriptionId = selectedJobDescriptionId || bindPayload?.jobDescriptionId || null;
    if (
      proposal.type === "bind_candidate_to_job" &&
      (!bindPayload?.resumeRecordId || !jobDescriptionId)
    ) {
      toast.error("请先选择要绑定的岗位");
      return;
    }
    if (
      proposal.type === "bind_pool_item_to_job" &&
      (!bindPayload?.poolItemId || !jobDescriptionId)
    ) {
      toast.error("请先选择要绑定的岗位");
      return;
    }
    setIsSubmitting(true);
    try {
      const nextProposal = withConfirmedJobBindPayload(proposal, jobDescriptionId, bindPayload);
      const result = await confirmRecruitingAction(slug, conversationId, nextProposal);
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
    <article className="aui-action-proposal my-3 rounded-xl border bg-background p-3">
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
      {needsJobPicker && !isDone ? (
        <div className="mt-3">
          <JobDescriptionSelectField
            disabled={isSubmitting}
            onChange={setSelectedJobDescriptionId}
            showDescription={false}
            size="sm"
            value={selectedJobDescriptionId}
          />
        </div>
      ) : null}
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
          disabled={!conversationId || isSubmitting || isDone || !canConfirmBind}
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
      className="aui-root aui-thread-root relative flex min-h-0 flex-1 flex-col bg-background text-foreground"
      style={activeThreadStyle}
    >
      <div className="relative flex min-h-0 flex-1">
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
          <div className="aui-thread-footer sticky bottom-0 bg-background px-4 pb-3">
            <div className="mx-auto w-full max-w-(--thread-max-width)">
              <Composer />
              <p className="mt-2 text-center text-muted-foreground text-xs">
                AI Recruitment Copilot 可能出错，请在确认动作前核对候选人和岗位信息。
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
