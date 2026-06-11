"use client";

import type { RoundEmailSummary } from "@arc/db-schema/round-email-log";
import { Loader2Icon, MailIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSendRoundEmail } from "./use-send-round-email";

interface RoundEmailActionProps {
  // 候选人邮箱，为空时禁用发送按钮。/ Candidate email; null disables the send button.
  candidateEmail: string | null;
  // 面试轮次 ID。/ Interview round ID.
  roundId: string;
  // 工作区 slug。/ Workspace slug.
  slug: string;
  // 该轮次的邮件发送汇总，未加载时为 undefined。/ Round email summary; undefined while loading.
  summary: RoundEmailSummary | undefined;
  // 外部锁定（如候选人已推进到真人复面/Offer/结案）。
  // External lock (e.g. candidate has advanced past AI interview stage).
  lockedReason?: string | null;
}

export function RoundEmailAction({
  candidateEmail,
  roundId,
  slug,
  summary,
  lockedReason,
}: RoundEmailActionProps) {
  const [open, setOpen] = useState(false);
  const mutation = useSendRoundEmail(slug);
  const count = summary?.count ?? 0;
  const lastSentAt = summary?.lastSentAt ?? null;
  const hasSent = count > 0;
  const missingEmail = !candidateEmail;
  const locked = Boolean(lockedReason);
  const disabled = missingEmail || locked;

  const button = (
    <Button
      disabled={disabled || mutation.isPending}
      onClick={() => setOpen(true)}
      size="sm"
      variant="ghost"
    >
      {mutation.isPending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <MailIcon className="size-4" />
      )}
      <span className="ml-1">{hasSent ? "重发" : "发送邮件"}</span>
      {hasSent ? (
        <span className="ml-1 text-muted-foreground text-xs">
          已发 {count} 次
          {lastSentAt ? (
            <>
              {" · "}
              <TimeDisplay as="span" options={DATE_TIME_DISPLAY_OPTIONS} value={lastSentAt} />
            </>
          ) : null}
        </span>
      ) : null}
    </Button>
  );

  // 禁用时用 Tooltip 解释原因（外部锁定优先于缺邮箱）。
  // Tooltip explains why the button is disabled; the lock reason wins over missing-email.
  function renderTrigger() {
    if (locked) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{button}</span>
          </TooltipTrigger>
          <TooltipContent>{lockedReason}</TooltipContent>
        </Tooltip>
      );
    }

    if (missingEmail) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{button}</span>
          </TooltipTrigger>
          <TooltipContent>请先在面试信息中填写候选人邮箱</TooltipContent>
        </Tooltip>
      );
    }

    return button;
  }

  const trigger = renderTrigger();

  return (
    <>
      {trigger}
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{hasSent ? "确认重发？" : "确认发送邮件？"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                将发送邮件到 <strong>{candidateEmail}</strong>
                {hasSent && lastSentAt ? (
                  <>
                    。该轮次已发送过 {count} 次，最近一次：
                    <TimeDisplay as="span" options={DATE_TIME_DISPLAY_OPTIONS} value={lastSentAt} />
                    。
                  </>
                ) : (
                  "。"
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await mutation.mutateAsync(roundId);
                  toast.success("邮件已发送");
                  setOpen(false);
                } catch (error) {
                  const message = error instanceof Error ? error.message : "邮件发送失败";
                  toast.error(message);
                }
              }}
            >
              {mutation.isPending ? <Loader2Icon className="mr-1 size-4 animate-spin" /> : null}
              {hasSent ? "重发" : "发送"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
