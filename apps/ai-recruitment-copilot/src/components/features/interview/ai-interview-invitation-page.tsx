"use client";

import { IconCalendarEvent, IconCheck, IconX } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { CandidateInterviewInvitationStatus } from "@arc/db-schema/interview-notifications";
import type { PublicAiInterviewInvitationPreview } from "@arc/shared/studio-pipeline-stages";
import { Button } from "@/components/ui/button";
import { ApiError, rpcFetch } from "@/lib/client/api";
import { publicRpc } from "@/lib/client/rpc";

interface InvitationResponseError {
  message: string;
  title: string;
}

const invitationResponseErrorPayloadSchema = z.object({
  error: z.string().optional(),
  title: z.string().optional(),
});

function invitationResponseError(error: Error): InvitationResponseError {
  if (error instanceof ApiError) {
    const parsed = invitationResponseErrorPayloadSchema.safeParse(error.payload);
    return {
      message: parsed.success ? (parsed.data.error ?? error.message) : error.message,
      title: parsed.success ? (parsed.data.title ?? "面试确认异常") : "面试确认异常",
    };
  }
  return {
    message: error.message || "提交面试邀请响应失败，请稍后重试。",
    title: "面试确认异常",
  };
}

function formatTime(value: string | null): string {
  if (!value) {
    return "可按邀请链接进入面试";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function responseStatusMessage(status: CandidateInterviewInvitationStatus): string {
  if (status === "declined") {
    return "你已拒绝本次面试，如需变更请联系 HR。";
  }
  if (status === "accepted") {
    return "你已接受本次面试。";
  }
  return "该邀请已失效，请联系 HR。";
}

export function AiInterviewInvitationPage({
  inviteToken,
  preview,
}: {
  inviteToken: string;
  preview: PublicAiInterviewInvitationPreview;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CandidateInterviewInvitationStatus>(preview.status);
  const [responseError, setResponseError] = useState<InvitationResponseError | null>(null);
  const responseMutation = useMutation({
    mutationFn: (action: "accept" | "decline") =>
      rpcFetch(
        publicRpc["ai-interview-invitations"][":token"].respond.$post({
          json: { action },
          param: { token: inviteToken },
        }),
        "提交面试邀请响应失败",
      ),
    onError: (error) => {
      const nextError = invitationResponseError(error);
      setResponseError(nextError);
      toast.error(nextError.message);
    },
    onMutate: () => setResponseError(null),
    onSuccess: (result) => {
      setResponseError(null);
      setStatus(result.status);
      if (result.status === "accepted") {
        void router.navigate({ href: result.interviewUrl });
      }
    },
  });
  const canRespond = status === "pending" || status === "sent";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-muted-foreground text-sm">{preview.companyName}</p>
      <h1 className="text-2xl font-semibold">{preview.roundName}</h1>
      <p className="mt-2 text-muted-foreground">
        {preview.candidateName}，你已收到
        {preview.jobName ? ` ${preview.jobName} 岗位的` : ""} AI 面试邀请。
      </p>
      <div className="mt-8 flex items-center gap-3 border-border border-y py-5">
        <IconCalendarEvent className="size-5 text-muted-foreground" />
        <span className="font-medium">{formatTime(preview.scheduledAt)}</span>
      </div>
      {responseError ? (
        <div
          aria-live="polite"
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
          role="alert"
        >
          <p className="font-medium text-destructive">❌ {responseError.title}</p>
          <p className="mt-1 text-muted-foreground text-sm leading-6">{responseError.message}</p>
        </div>
      ) : null}
      {canRespond ? (
        <div className="mt-8 flex gap-3">
          <Button
            disabled={responseMutation.isPending}
            onClick={() => responseMutation.mutate("accept")}
          >
            <IconCheck className="size-4" />
            {responseMutation.isPending ? "处理中…" : "接受并进入面试"}
          </Button>
          <Button
            disabled={responseMutation.isPending}
            onClick={() => responseMutation.mutate("decline")}
            variant="outline"
          >
            <IconX className="size-4" />
            无法参加
          </Button>
        </div>
      ) : (
        <p className="mt-8 text-muted-foreground text-sm">{responseStatusMessage(status)}</p>
      )}
    </main>
  );
}
