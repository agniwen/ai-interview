"use client";

import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import { IconArrowUp, IconLoader2, IconSquare } from "@tabler/icons-react";
import { z } from "zod";
import type { ChatSubjectKind } from "@app/db-schema/chat-subject-threads";
import {
  composerActionsClass,
  composerInputClass,
  composerSendButtonClass,
  composerShellClass,
} from "@/components/assistant-ui/recruiting-composer-style";
import { focusComposerInputFromShellClick } from "@/components/assistant-ui/recruiting-composer-focus";
import { RecruitingMarkdownText } from "@/components/assistant-ui/recruiting-markdown-text";
import {
  assistantMessageContentClass,
  assistantMessageRootClass,
  userMessageBubbleClass,
  userMessageRootClass,
} from "@/components/assistant-ui/recruiting-message-style";
import { RecruitingThinkingIndicator } from "@/components/assistant-ui/recruiting-thinking-indicator";
import { ToolChipsGroup } from "@/components/assistant-ui/tool-chips";
import { useRecruitingComposerShellLayout } from "@/components/assistant-ui/use-recruiting-composer-shell-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/client/auth-client";
import { useSubjectAgent } from "./subject-agent-context";
import {
  CandidateFormPatchToolUI,
  InterviewQuestionPatchToolUI,
  JobDescriptionPatchToolUI,
} from "./subject-patch-tool-uis";

const messageAuthorSchema = z.object({
  author: z.object({ id: z.string(), image: z.string().nullable(), name: z.string() }).nullable(),
});

const SUBJECT_COPY = {
  candidate_form_template: {
    description: "可以让 Hireseer Agent 设计表单题目、题型和选项。",
    placeholder: "让 Hireseer Agent 修改表单题…",
    suggestions: [
      "帮我设计一份候选人基础信息表单",
      "把开放式问题尽量改成选择题",
      "检查哪些问题不必向候选人收集",
    ],
  },
  interview_question_template: {
    description: "可以让 Hireseer Agent 出题，并补充难度、考核点和追问方向。",
    placeholder: "让 Hireseer Agent 修改沟通题…",
    suggestions: [
      "帮我出 5 道考察项目经验的沟通题",
      "为每道题补充考核点和追问方向",
      "检查题目难度分布是否合理",
    ],
  },
  job_description: {
    description: "可以让 Hireseer Agent 完善岗位 JD、内部标准等设置。",
    placeholder: "让 Hireseer Agent 修改岗位设置…",
    suggestions: [
      "帮我检查岗位 JD 还缺哪些关键信息",
      "把岗位 JD 改写成职责和要求分开的结构",
      "根据岗位 JD 补充内部评价标准",
    ],
  },
} satisfies Record<
  ChatSubjectKind,
  { description: string; placeholder: string; suggestions: string[] }
>;

function MessageAuthor() {
  const custom = useAuiState((state) => state.message.metadata.custom);
  const { data: session } = authClient.useSession();
  const parsed = messageAuthorSchema.safeParse(custom);
  let author = parsed.success ? parsed.data.author : null;
  // 本人刚发出、尚未从服务端刷新的消息没有发送人信息，显示当前用户。
  if (!parsed.success && session?.user) {
    author = { id: session.user.id, image: session.user.image ?? null, name: session.user.name };
  }
  if (!author) {
    return null;
  }
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <span className="truncate">{author.name}</span>
      <Avatar aria-hidden="true" seed={`member:${author.id}`} size="sm" className="size-5">
        {author.image ? <AvatarImage alt="" src={author.image} /> : null}
        <AvatarFallback>{author.name.slice(0, 1)}</AvatarFallback>
      </Avatar>
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className={userMessageRootClass} data-role="user">
      <MessageAuthor />
      <div className={userMessageBubbleClass}>
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantRunningIndicator() {
  const isRunning = useAuiState((state) => state.message.status?.type === "running");
  return isRunning ? <RecruitingThinkingIndicator className="mt-3" /> : null;
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={assistantMessageRootClass} data-role="assistant">
      <div className={assistantMessageContentClass}>
        <MessagePrimitive.Parts
          components={{ Text: RecruitingMarkdownText, ToolGroup: ToolChipsGroup }}
        />
        <AssistantRunningIndicator />
      </div>
    </MessagePrimitive.Root>
  );
}

function ThreadMessage() {
  const role = useAuiState((state) => state.message.role);
  if (role === "user") {
    return <UserMessage />;
  }
  if (role === "assistant") {
    return <AssistantMessage />;
  }
  return null;
}

function LoadOlderMessages() {
  const { hasOlderMessages, isLoadingOlder, loadOlderMessages } = useSubjectAgent();
  if (!hasOlderMessages) {
    return null;
  }
  return (
    <div className="flex justify-center py-2">
      <Button
        disabled={isLoadingOlder}
        onClick={() => {
          void loadOlderMessages();
        }}
        size="sm"
        variant="ghost"
      >
        {isLoadingOlder ? <IconLoader2 className="size-4 animate-spin" /> : null}
        加载更早的消息
      </Button>
    </div>
  );
}

function EmptyThread({ canSend }: { canSend: boolean }) {
  const { subject } = useSubjectAgent();
  const copy = SUBJECT_COPY[subject.kind];
  return (
    <div className="flex flex-col gap-3 px-2 py-6">
      <div>
        <p className="font-medium text-sm">Hireseer Agent</p>
        <p className="mt-1 text-muted-foreground text-sm leading-6">
          {`${copy.description}修改建议需要应用到表单并保存后才会生效，对话对能查看该记录的成员可见。`}
        </p>
      </div>
      {canSend ? (
        <div className="flex flex-col items-start gap-2">
          {copy.suggestions.map((prompt) => (
            <ThreadPrimitive.Suggestion
              key={prompt}
              className="rounded-[14px] bg-control px-3 py-1.5 text-start text-sm shadow-default transition-colors hover:bg-muted"
              prompt={prompt}
              send
            >
              {prompt}
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Composer() {
  "use no memo";
  const { subject } = useSubjectAgent();
  const composerShellRef = useRecruitingComposerShellLayout();
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root
        className="aui-composer-root relative flex w-full flex-col"
        onClick={focusComposerInputFromShellClick}
      >
        <div className={composerShellClass} ref={composerShellRef}>
          <LexicalComposerInput
            aria-label="向 Hireseer Agent 提问"
            autoFocus
            className={composerInputClass}
            placeholder={SUBJECT_COPY[subject.kind].placeholder}
            submitMode="enter"
          />
          <div className={composerActionsClass}>
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
                  className={composerSendButtonClass}
                  size="icon"
                  type="button"
                >
                  <IconSquare className="size-3 fill-current" />
                </Button>
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}

export function SubjectAgentThread({
  blockedReason,
}: {
  /** 不能发送时的说明（无编辑权限或其他成员正在对话）；为空表示可以发送。 */
  blockedReason: string | null;
}) {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <JobDescriptionPatchToolUI />
      <InterviewQuestionPatchToolUI />
      <CandidateFormPatchToolUI />
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pt-2 pb-4">
        <LoadOlderMessages />
        <ThreadPrimitive.Empty>
          <EmptyThread canSend={blockedReason === null} />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
      <div className="shrink-0 px-3 pt-1 pb-3">
        {blockedReason ? (
          <p className="rounded-[14px] bg-control px-3 py-2.5 text-muted-foreground text-sm shadow-default">
            {blockedReason}
          </p>
        ) : (
          <Composer />
        )}
      </div>
    </ThreadPrimitive.Root>
  );
}
