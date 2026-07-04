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
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconPencil,
  IconRefresh,
  IconSquare,
  IconWaveSine,
} from "@tabler/icons-react";
import { useState } from "react";
import type { ComponentProps, CSSProperties, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  total?: number;
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

const activeThreadStyle = {
  "--thread-max-width": "48rem",
} as CSSProperties;

const emptyThreadStyle = {
  "--thread-max-width": "48rem",
} as CSSProperties;

function ToolNotice({ children }: { children: string }) {
  return (
    <div className="aui-tool-notice rounded-2xl border border-[#e5e5e5] bg-white px-3 py-2 text-[#5d5d5d] text-sm dark:border-transparent dark:bg-[#212121] dark:text-[#afafaf]">
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
        "size-8 rounded-lg bg-transparent p-0 text-[#5d5d5d] transition-colors hover:bg-black/[0.07] hover:text-[#5d5d5d] dark:text-[#cdcdcd] dark:hover:bg-white/15 dark:hover:text-[#cdcdcd]",
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
      className="aui-assistant-action-bar -ms-1 flex gap-0 text-[#5d5d5d] dark:text-[#cdcdcd]"
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
      <ComposerPrimitive.Root className="aui-edit-composer ms-auto flex w-full max-w-[70%] flex-col rounded-[22px] border border-[#e5e5e5] bg-white shadow-sm dark:border-transparent dark:bg-[#212121]">
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

function AssistantMessage() {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message fade-in slide-in-from-bottom-1 animate-in relative w-full duration-150"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content text-[#0d0d0d] leading-7 wrap-break-word dark:text-[#ececec]">
        <MessagePrimitive.Parts />
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
      <div className="aui-user-message-content max-w-[70%] rounded-[22px] bg-[#0d0d0d] px-4 py-2.5 text-white leading-6 wrap-break-word empty:hidden dark:bg-[#ececec] dark:text-[#0d0d0d]">
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
      <div className="aui-composer-shell flex w-full flex-col gap-2 rounded-[28px] border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm transition-[border-color,box-shadow] focus-within:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.14),0_1px_2px_rgba(0,0,0,0.05)] dark:border-transparent dark:bg-[#212121] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <ComposerPrimitive.Input
          aria-label="招聘问题输入"
          autoFocus
          className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-[#0d0d0d] text-base outline-none placeholder:text-[#5d5d5d] dark:text-[#ececec] dark:placeholder:text-[#afafaf]"
          enterKeyHint="send"
          placeholder="输入招聘问题..."
          rows={1}
          submitMode="enter"
        />
        <div className="aui-composer-action-wrapper flex items-center justify-end gap-1">
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <ChatGPTIconButton
                className="size-9 rounded-full bg-[#0d0d0d] text-white hover:bg-[#0d0d0d]/90 hover:text-white dark:bg-white dark:text-black dark:hover:bg-white/90 dark:hover:text-black"
                label="发送"
              >
                <IconArrowUp className="size-5" />
              </ChatGPTIconButton>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(state) => state.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <ChatGPTIconButton
                className="size-9 rounded-full bg-[#0d0d0d] text-white hover:bg-[#0d0d0d]/90 hover:text-white dark:bg-white dark:text-black dark:hover:bg-white/90 dark:hover:text-black"
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

export const RecruitingResumeSearchToolUI = makeAssistantToolUI<unknown, SearchResumeRecordsResult>(
  {
    display: "standalone",
    render: ({ result, status }) => {
      const cards = result?.candidateSummaryCards ?? [];
      if (status.type === "running") {
        return <ToolNotice>正在检索候选人...</ToolNotice>;
      }
      if (cards.length === 0) {
        return <ToolNotice>未找到匹配候选人。</ToolNotice>;
      }
      return (
        <div className="aui-candidate-card-list grid gap-2">
          {cards.map((card) => (
            <article
              className="aui-candidate-card rounded-2xl border border-[#e5e5e5] bg-white p-3 shadow-sm dark:border-transparent dark:bg-[#212121]"
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
                <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5 text-[#5d5d5d] text-xs dark:border-white/10 dark:text-[#afafaf]">
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
                      className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs dark:bg-white/10"
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
    return (
      <article className="aui-action-proposal rounded-2xl border border-[#e5e5e5] bg-white p-3 shadow-sm dark:border-transparent dark:bg-[#212121]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">待确认动作</p>
            <h3 className="mt-1 font-medium text-sm">{proposal.title}</h3>
          </div>
          <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5 text-[#5d5d5d] text-xs dark:border-white/10 dark:text-[#afafaf]">
            {proposal.type}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6">{proposal.explanation}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button disabled size="sm" type="button" variant="outline">
            忽略
          </Button>
          <Button disabled size="sm" type="button">
            确认
          </Button>
        </div>
      </article>
    );
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
      className="aui-root aui-thread-root flex min-h-0 flex-1 flex-col bg-white text-[#0d0d0d] dark:bg-black dark:text-[#ececec]"
      style={activeThreadStyle}
    >
      <ThreadPrimitive.Viewport
        autoScroll
        className="aui-thread-viewport min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth"
        scrollToBottomOnRunStart
        turnAnchor="top"
      >
        <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-6 px-4 pt-6 pb-8">
          <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          {isRunning ? (
            <div className="aui-assistant-working w-fit rounded-2xl bg-black/[0.05] px-3 py-2 text-[#5d5d5d] text-sm dark:bg-white/10 dark:text-[#afafaf]">
              思考中...
            </div>
          ) : null}
        </div>
      </ThreadPrimitive.Viewport>
      <div className="aui-thread-footer sticky bottom-0 bg-white px-4 pt-2 pb-3 dark:bg-black">
        <div className="mx-auto w-full max-w-(--thread-max-width)">
          <Composer />
          <p className="mt-2 text-center text-[#5d5d5d] text-xs dark:text-[#afafaf]">
            Copilot 可能出错，请在确认动作前核对候选人和岗位信息。
          </p>
        </div>
      </div>
      <ThreadPrimitive.ScrollToBottom asChild>
        <Button
          aria-label="回到底部"
          className="aui-thread-scroll-to-bottom absolute right-6 bottom-28 size-8 rounded-full disabled:invisible"
          size="icon"
          type="button"
          variant="outline"
        >
          <IconArrowDown className="size-4" />
        </Button>
      </ThreadPrimitive.ScrollToBottom>
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

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) {
      return;
    }
    const nextText = text.trim();
    setText("");
    await onSubmit(nextText);
  };

  return (
    <div
      className="aui-root aui-thread-root flex min-h-0 flex-1 flex-col bg-white text-[#0d0d0d] dark:bg-black dark:text-[#ececec]"
      style={emptyThreadStyle}
    >
      <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col justify-center px-4 pb-[12vh]">
        <div className="aui-thread-welcome-root mb-6 text-center">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-normal duration-200">
            从哪里开始招聘协作？
          </h1>
        </div>
        <form className="aui-composer-root relative flex w-full flex-col" onSubmit={handleSubmit}>
          <div className="aui-composer-shell flex w-full flex-col gap-2 rounded-[28px] border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm transition-[border-color,box-shadow] focus-within:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.14),0_1px_2px_rgba(0,0,0,0.05)] dark:border-transparent dark:bg-[#212121] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            <Textarea
              aria-label="招聘问题输入"
              className="aui-composer-input min-h-24 resize-none border-0 bg-transparent px-2 py-2 text-[#0d0d0d] text-base shadow-none outline-none placeholder:text-[#5d5d5d] focus-visible:ring-0 dark:text-[#ececec] dark:placeholder:text-[#afafaf]"
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="输入招聘问题..."
              value={text}
            />
            <div className="aui-composer-action-wrapper flex justify-end gap-1">
              <Button
                aria-label={canSubmit ? "发送" : "语音模式"}
                className="size-9 rounded-full bg-[#0d0d0d] p-0 text-white hover:bg-[#0d0d0d]/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                disabled={!canSubmit}
                size="icon"
                title={canSubmit ? "发送" : "语音模式"}
                type="submit"
              >
                {canSubmit ? (
                  <IconArrowUp className="size-5" />
                ) : (
                  <IconWaveSine className="size-5" />
                )}
              </Button>
            </div>
          </div>
        </form>
        <p className="mt-2 text-center text-[#5d5d5d] text-xs dark:text-[#afafaf]">
          Copilot 可能出错，请在确认动作前核对候选人和岗位信息。
        </p>
      </div>
    </div>
  );
}
