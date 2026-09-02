"use client";

/* oxlint-disable no-use-before-define -- helper components follow the public dialog */

import { IconCopy, IconLink, IconLoader2, IconUsers } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import type {
  FeishuHumanInterviewSyncStatus,
  HumanInterviewMeetingInterviewerRole,
} from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
} from "@app/shared/studio-pipeline-stages";
import { issueHumanInterviewMeetingLinks, retryHumanInterviewFeishuSync } from "@/lib/client/api";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "./human-interview-stage-utils";

export function EndMeetingDialog({
  isPending,
  meeting,
  onConfirm,
  onOpenChange,
}: {
  isPending: boolean;
  meeting: HumanInterviewMeetingRecord | null;
  onConfirm: (meeting: HumanInterviewMeetingRecord) => Promise<{ ok: boolean }>;
  onOpenChange: (open: boolean) => void;
}) {
  async function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (meeting) {
      try {
        await onConfirm(meeting);
      } catch {
        // The mutation already surfaces the error toast; keep the dialog open.
      }
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={meeting !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>结束真人复面会议？</AlertDialogTitle>
          <AlertDialogDescription>
            结束后会关闭当前视频房间，已拿到链接的候选人和面试官将不能继续进入该会议。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleConfirm} variant="destructive">
            {isPending ? <IconLoader2 className="size-4 animate-spin" /> : null}
            确认结束
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const interviewerRoleLabel = {
  host: "主持人",
  interviewer: "面试官",
  observer: "旁听",
} satisfies Record<HumanInterviewMeetingInterviewerRole, string>;

export interface MeetingLinksDialogDependencies {
  issueLinks: typeof issueHumanInterviewMeetingLinks;
  retryFeishu: typeof retryHumanInterviewFeishuSync;
  slug: string;
}

export function MeetingLinksDialogView({
  dependencies,
  meeting,
  onOpenChange,
}: {
  dependencies: MeetingLinksDialogDependencies;
  meeting: HumanInterviewMeetingRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { issueLinks, retryFeishu: retryFeishuMutation, slug } = dependencies;
  const { data, error, isFetching } = useQuery({
    enabled: Boolean(meeting),
    queryFn: () => {
      if (!meeting) {
        throw new Error("missing meeting");
      }
      return issueLinks(slug, meeting.id);
    },
    queryKey: ["human-interview-meeting-links", slug, meeting?.id],
  });
  const retryFeishu = useMutation({
    mutationFn: () => {
      if (!meeting) {
        throw new Error("missing meeting");
      }
      return retryFeishuMutation(slug, meeting.id);
    },
    onError: (retryError) => {
      toast.error(retryError instanceof Error ? retryError.message : "重试飞书日程同步失败");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-meeting-links", slug, meeting?.id],
      });
    },
    onSuccess: () => {
      toast.success("飞书日程已创建");
    },
  });
  return (
    <Dialog onOpenChange={onOpenChange} open={meeting !== null}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>候选人确认与面试官会议链接</DialogTitle>
          <DialogDescription>
            {meeting?.title ?? "真人复面会议"} 的候选人确认入口和面试官会议入口。链接不可混用。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60dvh] space-y-5 overflow-y-auto py-1">
          {isFetching ? (
            <Card className="gap-0 rounded-lg py-0">
              <CardContent className="flex items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
                <IconLoader2 className="size-4 animate-spin" />
                生成链接中…
              </CardContent>
            </Card>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {error instanceof Error ? error.message : "生成链接失败"}
            </p>
          ) : null}
          {data ? (
            <MeetingLinksContent
              isRetrying={retryFeishu.isPending}
              links={data}
              onRetry={() => retryFeishu.mutate()}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingLinksContent({
  isRetrying,
  links,
  onRetry,
}: {
  isRetrying: boolean;
  links: HumanInterviewMeetingLinkBundle;
  onRetry: () => void;
}) {
  const retryCopy = getFeishuRetryCopy(links.feishu?.status);

  return (
    <div className="space-y-5">
      {retryCopy ? (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${retryCopy.tone}`}
        >
          <p className="text-sm">{retryCopy.message}</p>
          <Button disabled={isRetrying} onClick={onRetry} size="sm" variant="outline">
            {isRetrying ? <IconLoader2 className="size-4 animate-spin" /> : null}
            {retryCopy.button}
          </Button>
        </div>
      ) : null}
      {links.feishu?.status === "unknown" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-700 text-sm dark:text-amber-300">
          历史飞书同步结果未知，请先在飞书中人工核查，暂时不能直接重试。
        </p>
      ) : null}

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-medium text-sm">
          <IconUsers className="size-4" />
          候选人确认链接
        </h4>
        <div className="space-y-2">
          {links.candidateLinks.map((link) => (
            <MeetingLinkRow
              description={`${link.roundLabel} · 有效至 ${formatDateTime(link.expiresAt)}`}
              key={link.roundId}
              label={link.candidateName}
              url={link.url}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-medium text-sm">
          <IconLink className="size-4" />
          面试官会议链接
        </h4>
        <div className="space-y-2">
          {links.interviewerLinks.map((link) => (
            <MeetingLinkRow
              description={interviewerRoleLabel[link.role]}
              key={link.userId}
              label={link.name}
              url={link.url}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function getFeishuRetryCopy(status: FeishuHumanInterviewSyncStatus | undefined) {
  if (status === "failed") {
    return {
      button: "重试飞书同步",
      message: "飞书日程同步失败，现有候选人和面试官链接仍可使用。",
      tone: "border-destructive/30 bg-destructive/5 text-destructive",
    };
  }
  if (status === "pending") {
    return {
      button: "继续飞书同步",
      message: "飞书日程同步尚未完成，可以继续创建日程并邀请面试官。",
      tone: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    };
  }
  if (status === "creating") {
    return {
      button: "检查并恢复同步",
      message: "飞书同步可能仍在进行；若长时间未完成，可以检查并恢复。",
      tone: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    };
  }
  return null;
}

function MeetingLinkRow({
  description,
  label,
  url,
}: {
  description: string;
  label: string;
  url: string;
}) {
  const absoluteUrl = toAbsoluteUrl(url);

  async function handleCopy() {
    const result = await copyTextToClipboard(absoluteUrl);
    if (result === "copied") {
      toast.success("链接已复制");
      return;
    }
    if (result === "manual") {
      toast.info("已打开手动复制窗口");
      return;
    }
    toast.error("复制失败，请手动选择链接");
  }

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{label}</span>
            <Badge variant="outline">{description}</Badge>
          </div>
          <Input className="h-8 text-xs" readOnly value={absoluteUrl} />
        </div>
        <Button className="md:self-end" onClick={handleCopy} size="sm" variant="outline">
          <IconCopy className="size-4" />
          复制
        </Button>
      </CardContent>
    </Card>
  );
}

export function MeetingLinksDialog({
  meeting,
  onOpenChange,
}: {
  meeting: HumanInterviewMeetingRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <MeetingLinksDialogView
      dependencies={{
        issueLinks: issueHumanInterviewMeetingLinks,
        retryFeishu: retryHumanInterviewFeishuSync,
        slug: useWorkspaceSlug(),
      }}
      meeting={meeting}
      onOpenChange={onOpenChange}
    />
  );
}
