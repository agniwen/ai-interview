"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { safeValidateUIMessages } from "ai";
import type { UIMessage } from "ai";
import { IconHistory, IconLoader2 } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { jobDescriptionAgentPatchSchema } from "@app/shared/job-description-agent";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSubjectAgent } from "./subject-agent-context";
import {
  deleteSubjectThread,
  fetchSubjectThreadHistory,
  fetchSubjectThreadPreview,
  restoreSubjectThread,
  subjectThreadKeys,
} from "./subject-thread-api";

const previewAuthorSchema = z.object({
  author: z.object({ name: z.string() }).nullable().optional(),
});

function formatTime(value: string): string {
  return dayjs(value).format("YYYY-MM-DD HH:mm");
}

function previewText(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      if (part.type.startsWith("tool-") && "output" in part) {
        const patch = jobDescriptionAgentPatchSchema.safeParse(part.output);
        return patch.success ? `【修改建议】${patch.data.summary}` : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function HistoryPreviewDialog({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { refreshThread, subject, thread } = useSubjectAgent();
  const permissions = thread.data?.permissions;
  const [pendingAction, setPendingAction] = useState<"delete" | "restore" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = useQuery({
    queryFn: async () => {
      const data = await fetchSubjectThreadPreview(subject, conversationId);
      const validated =
        data.messages.length > 0
          ? await safeValidateUIMessages<UIMessage>({ messages: data.messages })
          : { data: [], success: true as const };
      if (!validated.success) {
        throw new Error("会话消息格式无效。");
      }
      return { messages: validated.data, thread: data.thread };
    },
    queryKey: subjectThreadKeys.preview(subject, conversationId),
  });

  const restore = async () => {
    setPendingAction("restore");
    try {
      await restoreSubjectThread(subject, conversationId);
      await refreshThread();
      toast.success("已恢复为当前对话");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复会话失败");
    } finally {
      setPendingAction(null);
    }
  };

  const remove = async () => {
    setPendingAction("delete");
    try {
      await deleteSubjectThread(subject, conversationId);
      await queryClient.invalidateQueries({ queryKey: subjectThreadKeys.history(subject) });
      toast.success("已删除历史对话");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除会话失败");
    } finally {
      setPendingAction(null);
      setConfirmDelete(false);
    }
  };

  let body;
  if (preview.isPending) {
    body = (
      <div aria-busy="true" aria-label="正在加载历史对话" className="space-y-3">
        <span className="sr-only">正在加载历史对话</span>
        {[0, 1, 2].map((row) => (
          <div key={row} aria-hidden="true" className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    );
  } else if (preview.isError) {
    body = (
      <div role="alert" className="space-y-2 text-sm">
        <p>加载历史对话失败</p>
        <Button
          onClick={() => {
            void preview.refetch();
          }}
          size="sm"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  } else {
    body = (
      <ol className="space-y-3">
        {preview.data.messages.map((message) => {
          const author = previewAuthorSchema.safeParse(message.metadata);
          const name =
            message.role === "assistant"
              ? "Hireseer Agent"
              : ((author.success ? author.data.author?.name : null) ?? "成员");
          return (
            <li key={message.id} className="text-sm">
              <p className="text-muted-foreground text-xs">{name}</p>
              <p className="mt-0.5 whitespace-pre-wrap wrap-break-word leading-6">
                {previewText(message)}
              </p>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{preview.data?.thread.title || "历史对话"}</DialogTitle>
            <DialogDescription>
              {preview.data
                ? `${preview.data.thread.createdBy?.name ?? "成员"} 创建于 ${formatTime(preview.data.thread.createdAt)}`
                : "只读预览"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">{body}</div>
          <DialogFooter>
            {permissions?.canDelete ? (
              <Button
                disabled={pendingAction !== null}
                onClick={() => setConfirmDelete(true)}
                variant="outline"
              >
                删除
              </Button>
            ) : null}
            {permissions?.canEdit ? (
              <Button
                disabled={pendingAction !== null}
                onClick={() => {
                  void restore();
                }}
              >
                {pendingAction === "restore" ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : null}
                恢复为当前对话
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除历史对话？</AlertDialogTitle>
            <AlertDialogDescription>删除后所有成员都无法再查看这段对话。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void remove();
              }}
              variant="destructive"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SubjectAgentHistoryButton() {
  const { subject } = useSubjectAgent();
  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const history = useQuery({
    enabled: open,
    queryFn: () => fetchSubjectThreadHistory(subject),
    queryKey: subjectThreadKeys.history(subject),
  });

  let list;
  if (history.isPending) {
    list = (
      <div aria-busy="true" aria-label="正在加载历史对话" className="space-y-2 p-1">
        <span className="sr-only">正在加载历史对话</span>
        {[0, 1, 2].map((row) => (
          <div key={row} aria-hidden="true" className="space-y-1.5 px-2 py-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  } else if (history.isError) {
    list = (
      <div role="alert" className="space-y-2 p-2 text-sm">
        <p>加载历史对话失败</p>
        <Button
          onClick={() => {
            void history.refetch();
          }}
          size="sm"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  } else if (history.data.threads.length === 0) {
    list = <p className="p-3 text-muted-foreground text-sm">还没有历史对话</p>;
  } else {
    list = (
      <ul className="max-h-80 overflow-y-auto p-1">
        {history.data.threads.map((item) => (
          <li key={item.id}>
            <button
              className="w-full rounded-md px-2 py-1.5 text-start transition-colors hover:bg-muted"
              onClick={() => {
                setOpen(false);
                setPreviewId(item.id);
              }}
              type="button"
            >
              <span className="block truncate text-sm">{item.title || "未命名对话"}</span>
              <span className="block truncate text-muted-foreground text-xs">
                {`${item.createdBy?.name ?? "成员"} · ${formatTime(item.updatedAt)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button aria-label="历史对话" size="icon-sm" variant="ghost">
                    <IconHistory className="size-4" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom">历史对话</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-72 p-1">
          {list}
        </PopoverContent>
      </Popover>
      {previewId ? (
        <HistoryPreviewDialog conversationId={previewId} onClose={() => setPreviewId(null)} />
      ) : null}
    </>
  );
}
