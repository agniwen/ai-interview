"use client";

import { useChat } from "@ai-sdk/react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { IconMessagePlus, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { StudioSidePaneHeader } from "@/components/features/studio/studio-side-pane-header";
import {
  StudioSidePaneContent,
  useStudioSidePane,
} from "@/components/features/studio/studio-side-pane-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasPermission } from "@/hooks/use-has-permission";
import { authClient } from "@/lib/client/auth-client";
import { SUBJECT_AGENT_PANE_ID, useSubjectAgent } from "./subject-agent-context";
import type { SubjectThreadState } from "./subject-agent-context";
import { SubjectAgentHistoryButton } from "./subject-agent-history";
import { SubjectAgentThread } from "./subject-agent-thread";

const PANE_TITLE = "Hireseer Agent";

function SubjectAgentSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载 Hireseer Agent 对话"
      className="flex min-h-0 flex-1 flex-col"
    >
      <span className="sr-only">正在加载 Hireseer Agent 对话</span>
      <div aria-hidden="true" className="min-h-0 flex-1 space-y-5 overflow-hidden px-4 pt-3">
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-3/5 rounded-[14px]" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-2/5 rounded-[14px]" />
        </div>
      </div>
      <div aria-hidden="true" className="shrink-0 px-4 pt-2 pb-4">
        <Skeleton className="h-[3.25rem] w-full rounded-[14px]" />
      </div>
    </div>
  );
}

function NewConversationButton({ disabled }: { disabled: boolean }) {
  const { startNewConversation } = useSubjectAgent();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      await startNewConversation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "开始新对话失败");
    } finally {
      setPending(false);
      setConfirming(false);
    }
  };
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="新对话"
              disabled={disabled || pending}
              onClick={() => setConfirming(true)}
              size="icon-sm"
              variant="ghost"
            >
              <IconMessagePlus className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="bottom">新对话</TooltipContent>
      </Tooltip>
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>为所有成员开始新对话？</AlertDialogTitle>
            <AlertDialogDescription>
              当前对话会移到历史对话中，之后仍可以查看或恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                void confirm();
              }}
            >
              开始新对话
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function resolveBlockedReason(
  data: SubjectThreadState,
  currentUserId: string | undefined,
  isLocalRunning: boolean,
): string | null {
  if (!data.permissions.canEdit) {
    return "你可以查看对话，但需要编辑权限才能向 Hireseer Agent 提问。";
  }
  const run = data.thread?.run;
  if (run && !isLocalRunning) {
    return run.user?.id === currentUserId
      ? "你在其他页面中的对话仍在生成，完成后可以继续提问。"
      : `${run.user?.name ?? "其他成员"} 正在与 Hireseer Agent 对话，完成后可以继续提问。`;
  }
  return null;
}

function SubjectAgentPaneContent() {
  const { chat, chatStatus, thread } = useSubjectAgent();
  const { data: session } = authClient.useSession();
  const chatHelpers = useChat({ chat, throttle: 50 });
  const runtime = useAISDKRuntime(chatHelpers, { joinStrategy: "none" });
  const isLocalRunning = chatStatus === "submitted" || chatStatus === "streaming";

  let content;
  if (thread.isPending) {
    content = <SubjectAgentSkeleton />;
  } else if (thread.isError && !thread.data) {
    content = (
      <div role="alert" className="space-y-3 px-4 py-6 text-sm">
        <p>加载对话失败</p>
        <Button
          onClick={() => {
            void thread.refetch();
          }}
          size="sm"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  } else {
    content = (
      <AssistantRuntimeProvider runtime={runtime}>
        <SubjectAgentThread
          blockedReason={resolveBlockedReason(thread.data, session?.user.id, isLocalRunning)}
        />
      </AssistantRuntimeProvider>
    );
  }

  const canEdit = thread.data?.permissions.canEdit ?? false;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StudioSidePaneHeader
        actions={
          <>
            <SubjectAgentHistoryButton />
            <NewConversationButton
              disabled={
                !(canEdit && thread.data?.thread) ||
                isLocalRunning ||
                Boolean(thread.data?.thread?.run)
              }
            />
          </>
        }
        title={PANE_TITLE}
      />
      {content}
    </div>
  );
}

/** 面板内容挂在页面内（Provider 之下），以便读取页面表单；入口按钮放在顶栏。 */
export function SubjectAgentPane() {
  return (
    <StudioSidePaneContent id={SUBJECT_AGENT_PANE_ID}>
      <SubjectAgentPaneContent />
    </StudioSidePaneContent>
  );
}

export function SubjectAgentTrigger() {
  const pane = useStudioSidePane(SUBJECT_AGENT_PANE_ID);
  const canUseChat = useHasPermission("chat", "read");
  if (!canUseChat) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            {...pane.triggerProps}
            aria-label={pane.isOpen ? `关闭 ${PANE_TITLE}` : `打开 ${PANE_TITLE}`}
            className={pane.isOpen ? "bg-accent" : undefined}
            size="icon-sm"
            variant="ghost"
          >
            <IconSparkles className="size-4" />
          </Button>
        }
      />
      <TooltipContent side="bottom">{PANE_TITLE}</TooltipContent>
    </Tooltip>
  );
}
