"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import { getOfferEmailPreview, sendOfferEmail } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmailAttachmentField } from "./email-attachment-field";

export function OfferEmailDialog({
  candidateEmail,
  candidateId,
  candidateName,
  draft,
  onOpenChange,
  onSent,
  open,
  slug,
}: {
  candidateEmail: string | null;
  candidateId: string;
  candidateName: string;
  draft: OfferDraftRecord;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
  open: boolean;
  slug: string;
}) {
  const [to, setTo] = useState(candidateEmail ?? "");
  const [subject, setSubject] = useState(`Offer 通知｜${draft.position}`);
  const [content, setContent] = useState(
    `${candidateName}，您好：\n\n我们诚挚邀请您加入，以下是本次 Offer 的确认链接：\n{{offerLink}}\n\n请在有效期内查看并选择接受或拒绝。`,
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const previewQuery = useQuery({
    enabled: open,
    queryFn: () => getOfferEmailPreview(slug, candidateId, draft.id),
    queryKey: ["offer-email-preview", slug, candidateId, draft.id],
    staleTime: 0,
  });

  useEffect(() => {
    if (!open || !previewQuery.data) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- Server defaults reflect current company and linked-job configuration each time the dialog opens.
    setTo(previewQuery.data.to);
    setSubject(previewQuery.data.subject);
    setContent(previewQuery.data.content);
  }, [open, previewQuery.data]);

  const expectedOfferUrl = previewQuery.data?.offerUrl;
  const exactOfferLinkCount = expectedOfferUrl ? content.split(expectedOfferUrl).length - 1 : 0;
  const offerPathCount = content.match(/\/offer\/[A-Za-z0-9_-]+/g)?.length ?? 0;
  const offerLinkValid = exactOfferLinkCount === 1 && offerPathCount === 1;
  let offerLinkHint = "Offer 链接由系统生成，请勿修改。";
  let offerLinkError = false;
  if (previewQuery.isError) {
    offerLinkHint = "无法加载系统 Offer 链接，请关闭后重试。";
    offerLinkError = true;
  } else if (!previewQuery.isPending && !offerLinkValid) {
    offerLinkHint = "Offer 链接缺失或已被修改，请关闭后重新打开弹窗恢复。";
    offerLinkError = true;
  }

  const mutation = useMutation({
    mutationFn: () =>
      sendOfferEmail(slug, candidateId, draft.id, { attachments, content, subject, to }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "邮件发送失败"),
    onSuccess: () => {
      toast.success("Offer 邮件已发送");
      setAttachments([]);
      onOpenChange(false);
      onSent();
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setAttachments([]);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-h-[90dvh] sm:max-w-3xl sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>发送 Offer 邮件</DialogTitle>
          <DialogDescription>邮件发送成功后会标记为已发送，并保留活动记录。</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4 py-2">
          <Field>
            <FieldLabel htmlFor={`offer-email-to-${draft.id}`}>
              接收邮箱{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </FieldLabel>
            <Input
              aria-required="true"
              id={`offer-email-to-${draft.id}`}
              onChange={(event) => setTo(event.target.value)}
              required
              type="email"
              value={to}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`offer-email-subject-${draft.id}`}>
              邮件主题{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </FieldLabel>
            <Input
              aria-required="true"
              id={`offer-email-subject-${draft.id}`}
              onChange={(event) => setSubject(event.target.value)}
              required
              value={subject}
            />
          </Field>
          <Field data-invalid={offerLinkError}>
            <FieldLabel htmlFor={`offer-email-content-${draft.id}`}>
              邮件内容{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </FieldLabel>
            <Textarea
              aria-invalid={!previewQuery.isPending && !offerLinkValid}
              aria-required="true"
              id={`offer-email-content-${draft.id}`}
              onChange={(event) => setContent(event.target.value)}
              required
              rows={9}
              value={content}
            />
            {offerLinkError ? (
              <FieldError>{offerLinkHint}</FieldError>
            ) : (
              <FieldDescription>{offerLinkHint}</FieldDescription>
            )}
          </Field>
          <EmailAttachmentField
            disabled={mutation.isPending}
            files={attachments}
            id={`offer-email-attachments-${draft.id}`}
            onFilesChange={setAttachments}
          />
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              previewQuery.isPending ||
              !offerLinkValid ||
              !to.trim() ||
              !subject.trim() ||
              !content.trim()
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "发送中…" : "发送邮件"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
