import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconMail } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  previewAiInvitation,
  confirmAiInvitation,
} from "@/lib/client/api/endpoints/manual-ai-invitation";

export function SendInvitationButton({
  slug,
  roundId,
  disabled,
  previewInvitation = previewAiInvitation,
  confirmInvitation = confirmAiInvitation,
}: {
  slug: string;
  roundId: string;
  disabled?: boolean;
  previewInvitation?: typeof previewAiInvitation;
  confirmInvitation?: typeof confirmAiInvitation;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [previewSession, setPreviewSession] = useState(0);
  const preview = useQuery({
    enabled: open,
    gcTime: 0,
    queryFn: () => previewInvitation(slug, roundId),
    queryKey: ["manual-ai-invitation-preview", slug, roundId, previewSession],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!preview.data || preview.isFetching) {
        throw new Error("请等待收件人和邀请信息核对完成。");
      }
      return await confirmInvitation(slug, roundId, preview.data.confirmationToken);
    },
    onError: (error) => toast.error(error.message),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "timeline", result.recordId],
      });
      if (["dead", "failed", "unknown", "cancelled"].includes(result.status)) {
        toast.error("该次发送未成功或结果待核实，请检查通知记录后再决定是否重新发送。");
        return;
      }
      toast.success("邮件已发送成功");
      setOpen(false);
    },
    retry: false,
  });
  return (
    <>
      <Button
        className="min-w-0 flex-1"
        disabled={disabled}
        variant="outline"
        onClick={() => {
          setPreviewSession((value) => value + 1);
          setOpen(true);
        }}
      >
        <IconMail />
        发送邮件邀请
      </Button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!send.isPending) {
            setOpen(value);
          }
        }}
        title="确认发送面试邀请邮件"
        description="确认后，将向该候选人发送 AI 面试邀请邮件，邮件中包含面试链接。取消不会发送，也不会影响面试流程。"
        size="md"
        dismissible={!send.isPending}
        showCloseButton={!send.isPending}
        footer={
          <div className="flex w-full justify-end gap-3">
            <Button variant="outline" disabled={send.isPending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!preview.data || preview.isFetching || preview.isError || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? "正在提交…" : "确认发送"}
            </Button>
          </div>
        }
      >
        {preview.isPending ? (
          <p className="text-sm text-muted-foreground">正在核对收件人和邀请信息…</p>
        ) : null}
        {preview.isError ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm text-destructive">
              {preview.error.message}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                void preview.refetch();
              }}
            >
              重新加载
            </Button>
          </div>
        ) : null}
        {preview.data && !preview.isError ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt>候选人</dt>
              <dd>{preview.data.candidateName}</dd>
              <dt>收件邮箱</dt>
              <dd className="break-all">{preview.data.recipient}</dd>
            </dl>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
