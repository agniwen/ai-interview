import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconMail } from "@tabler/icons-react";
import { toast } from "sonner";
import type { ManualHumanEmailType } from "@app/shared/manual-human-email";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, FieldDescription, FieldGroup, FieldTitle } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TimeDisplay } from "@/components/features/display/time-display";
import {
  previewHumanEmail,
  confirmHumanEmail,
} from "@/lib/client/api/endpoints/manual-human-email";

const explanations = {
  human_candidate_invitation_requested:
    "发送面试邀请，候选人点击邮件中的链接后，可在平台接受或拒绝。",
  human_interview_cancelled: "告知候选人本次面试已取消，不包含进入会议的链接。",
  human_interview_confirmed: "告知候选人已确认的面试安排，并提供面试入口。",
  human_interview_reminder: "现在发送开始提醒，提醒候选人按约定时间进入面试。这不是设置自动提醒。",
  human_interview_rescheduled:
    "告知候选人原面试时间、新面试时间及最新面试入口。发送通知不会再次改期。",
} satisfies Record<ManualHumanEmailType, string>;

function describeEmailContext(data: Awaited<ReturnType<typeof previewHumanEmail>>) {
  if (data.roundStatus === "cancelled" || data.meetingStatus === "cancelled") {
    return "面试已取消";
  }
  if (data.roundStatus === "completed" || data.meetingStatus === "ended") {
    return "面试已结束";
  }
  if (data.candidateStatus === "accepted") {
    return "候选人已接受";
  }
  if (data.candidateStatus === "declined") {
    return "候选人已拒绝";
  }
  if (data.candidateStatus === "expired") {
    return "邀请已失效";
  }
  return "等待候选人接受或拒绝";
}

export function HumanInterviewEmailButton({
  slug,
  meetingId,
  roundId,
  recordId,
  previewEmail = previewHumanEmail,
  confirmEmail = confirmHumanEmail,
}: {
  slug: string;
  meetingId: string;
  roundId: string;
  recordId: string;
  previewEmail?: typeof previewHumanEmail;
  confirmEmail?: typeof confirmHumanEmail;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const fieldId = useId();
  const queryClient = useQueryClient();
  const preview = useQuery({
    enabled: open,
    gcTime: 0,
    queryFn: () => previewEmail(slug, meetingId, roundId),
    queryKey: ["manual-human-email-preview", slug, meetingId, roundId, session],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const selected =
    preview.data?.options.find((option) => option.type === selectedType) ??
    preview.data?.options[0];
  const send = useMutation({
    mutationFn: async () => {
      if (!selected || preview.isFetching || preview.isError) {
        throw new Error("请先核对通知信息并选择通知类型。");
      }
      return await confirmEmail(
        slug,
        meetingId,
        roundId,
        selected.type,
        selected.confirmationToken,
      );
    },
    onError: (error) => toast.error(error.message),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "timeline", recordId],
      });
      if (["dead", "failed", "unknown", "cancelled"].includes(result.status)) {
        toast.error("该次邮件未成功发送，请检查活动记录后再决定是否重新发送。");
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
        size="sm"
        variant="outline"
        onClick={() => {
          setSelectedType(null);
          setSession((value) => value + 1);
          setOpen(true);
        }}
      >
        <IconMail data-icon="inline-start" />
        邮件通知
      </Button>
      {open ? (
        <Modal
          open={open}
          onOpenChange={(value) => {
            if (!send.isPending) {
              setOpen(value);
            }
          }}
          title="发送候选人邮件通知"
          description="请选择本次要发送的通知。只有点击「确认发送」才会发送邮件，不会修改面试状态，也不会重复通知 HR 或面试官。"
          size="md"
          dismissible={!send.isPending}
          showCloseButton={!send.isPending}
          footer={
            <div className="flex w-full justify-end gap-3">
              <Button variant="outline" disabled={send.isPending} onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                disabled={!selected || preview.isFetching || preview.isError || send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? "正在提交…" : "确认发送"}
              </Button>
            </div>
          }
        >
          {preview.isPending ? (
            <p className="text-sm text-muted-foreground">正在核对收件人和面试安排…</p>
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
            <FieldGroup>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt>候选人</dt>
                <dd>{preview.data.candidateName}</dd>
                <dt>收件邮箱</dt>
                <dd className="break-all">{preview.data.recipient}</dd>
                <dt>面试名称</dt>
                <dd>{preview.data.roundName}</dd>
                <dt>当前情况</dt>
                <dd>{describeEmailContext(preview.data)}</dd>
                <dt>
                  {selected?.type === "human_interview_cancelled" ? "原面试时间" : "面试时间"}
                </dt>
                <dd>
                  <TimeDisplay value={preview.data.scheduledAt} /> 至{" "}
                  <TimeDisplay value={preview.data.validUntil} />
                </dd>
                {selected?.type === "human_interview_rescheduled" ? (
                  <>
                    <dt>改期前时间</dt>
                    <dd>
                      <TimeDisplay value={preview.data.oldStart} /> 至{" "}
                      <TimeDisplay value={preview.data.oldEnd} />
                    </dd>
                  </>
                ) : null}
              </dl>
              {selected ? (
                <Field>
                  <FieldTitle id={fieldId}>通知类型（单选）</FieldTitle>
                  <ToggleGroup
                    aria-labelledby={fieldId}
                    className="flex-wrap"
                    spacing={2}
                    variant="outline"
                    disabled={send.isPending}
                    value={[selected.type]}
                    onValueChange={(values) => {
                      if (values[0]) {
                        setSelectedType(values[0]);
                      }
                    }}
                  >
                    {preview.data.options.map((option) => (
                      <ToggleGroupItem key={option.type} value={option.type}>
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>{explanations[selected.type]}</FieldDescription>
                </Field>
              ) : (
                <output className="text-sm text-muted-foreground">
                  {preview.data.blockedReason}
                </output>
              )}
            </FieldGroup>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
