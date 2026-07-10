"use client";

/* oxlint-disable no-use-before-define -- helper components follow the public dialog */

import { IconCopy, IconLink, IconLoader2, IconUsers } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import type { HumanInterviewMeetingInterviewerRole } from "@arc/db-schema/studio-interviews";
import type {
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
} from "@arc/shared/studio-pipeline-stages";
import { issueHumanInterviewMeetingLinks } from "@/lib/client/api";
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
  onConfirm: (meeting: HumanInterviewMeetingRecord) => Promise<unknown>;
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

const interviewerRoleLabel: Record<HumanInterviewMeetingInterviewerRole, string> = {
  host: "主持人",
  interviewer: "面试官",
  observer: "旁听",
};

export function MeetingLinksDialog({
  meeting,
  onOpenChange,
}: {
  meeting: HumanInterviewMeetingRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const slug = useWorkspaceSlug();
  const { data, error, isFetching } = useQuery({
    enabled: Boolean(meeting),
    queryFn: () => {
      if (!meeting) {
        throw new Error("missing meeting");
      }
      return issueHumanInterviewMeetingLinks(slug, meeting.id);
    },
    queryKey: ["human-interview-meeting-links", slug, meeting?.id],
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={meeting !== null}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>复制面试链接</DialogTitle>
          <DialogDescription>
            {meeting?.title ?? "真人复面会议"} 的候选人和面试官入场链接。
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
          {data ? <MeetingLinksContent links={data} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingLinksContent({ links }: { links: HumanInterviewMeetingLinkBundle }) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-medium text-sm">
          <IconUsers className="size-4" />
          候选人链接
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
          面试官链接
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
