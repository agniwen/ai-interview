"use client";

import { IconCopy, IconMail, IconShieldCheck } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  BackgroundCheckCollectionRecord,
  BackgroundCheckEmailPreviewRecord,
} from "@app/shared/studio-pipeline-stages";
import type { RecruitingNodeStateRecord } from "@app/shared/studio-resumes";
import {
  getBackgroundCheckCollection,
  getBackgroundCheckEmailPreview,
  getBackgroundCheckPublicLink,
  sendBackgroundCheckEmail,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TimeDisplay } from "@/components/features/display/time-display";

const leavingReasonLabels = {
  contract_ended: "劳动合同终止",
  employee_resigned: "员工主动离职",
  other: "其他",
  refuse_to_answer: "不便回答",
  restructuring: "企业重组",
  workforce_reduction: "裁员",
} as const;

function display(value: null | string | undefined) {
  return value?.trim() || "—";
}

type BackgroundCheckReview = Pick<
  RecruitingNodeStateRecord,
  "decidedAt" | "reason" | "result" | "status"
>;

function getBackgroundCheckReviewMeta(review?: BackgroundCheckReview) {
  if (review?.status === "completed" && review.result === "pass") {
    return { label: "确认通过", statusLabel: "已确认通过", variant: "success" as const };
  }
  if (review?.status === "completed" && review.result === "fail") {
    return { label: "确认未通过", statusLabel: "已确认未通过", variant: "destructive" as const };
  }
  if (review?.status === "completed" && review.result === "withdrawn") {
    return { label: "候选人放弃", statusLabel: "候选人已放弃", variant: "warning" as const };
  }
  if (review?.status === "skipped") {
    return { label: "已跳过", statusLabel: "已跳过", variant: "outline" as const };
  }
  return { label: "待确认", statusLabel: "已提交，待确认结果", variant: "warning" as const };
}

function BackgroundCheckReviewSummary({ review }: { review?: BackgroundCheckReview }) {
  const meta = getBackgroundCheckReviewMeta(review);
  return (
    <div aria-label="背调结果" className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">确认结果</span>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        {review?.decidedAt ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">确认时间</span>
            <TimeDisplay value={review.decidedAt} />
          </div>
        ) : null}
      </div>
      {review?.reason ? (
        <p aria-label="背调确认说明" className="mt-2 text-xs leading-relaxed whitespace-pre-wrap">
          <span className="font-medium">确认说明：</span>
          {review.reason}
        </p>
      ) : null}
    </div>
  );
}

function getBackgroundCheckPanelMeta(
  status: BackgroundCheckCollectionRecord["status"] | undefined,
  review?: BackgroundCheckReview,
) {
  const submitted = status === "submitted";
  const reviewed = review?.status === "completed" || review?.status === "skipped";
  const reviewMeta = getBackgroundCheckReviewMeta(review);
  if (submitted && reviewed) {
    return {
      description: "以下为 HR 确认结果和候选人提交的背调信息。",
      heading: "背景调查结果已确认",
      statusLabel: reviewMeta.statusLabel,
      statusVariant: reviewMeta.variant,
      submitted,
    };
  }
  if (submitted) {
    return {
      description: "请核对下方信息，然后使用页面底部的“确认背调结果”。",
      heading: "候选人已提交背景调查信息",
      statusLabel: reviewMeta.statusLabel,
      statusVariant: "success" as const,
      submitted,
    };
  }
  if (status === "sent") {
    return {
      description: "可发送系统邮件，也可复制链接后通过其他方式发送。",
      heading: "向候选人收集背景调查所需信息",
      statusLabel: "已发送，待填写",
      statusVariant: "info" as const,
      submitted,
    };
  }
  return {
    description: "可发送系统邮件，也可复制链接后通过其他方式发送。",
    heading: "向候选人收集背景调查所需信息",
    statusLabel: "待发送",
    statusVariant: "outline" as const,
    submitted,
  };
}

function BackgroundCheckSubmittedDetails({
  collection,
}: {
  collection: BackgroundCheckCollectionRecord;
}) {
  const form = collection.formData;
  if (!form) {
    return null;
  }
  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">姓名</dt>
          <dd className="mt-1 font-medium">{form.candidateName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">性别</dt>
          <dd className="mt-1 font-medium">
            {{ female: "女", male: "男", other: "其他" }[form.gender]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">证件号码</dt>
          <dd className="mt-1 font-medium">{form.idNumber}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">毕业证书编号</dt>
          <dd className="mt-1 font-medium">{display(form.graduationCertificateNumber)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">本人签名</dt>
          <dd className="mt-1 font-medium">{form.signatureName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">签署日期</dt>
          <dd className="mt-1 font-medium">{form.signedDate}</dd>
        </div>
      </dl>
      {form.employmentRecords.map((record, index) => (
        <section className="space-y-3 border-t pt-4" key={`${record.companyName}-${index}`}>
          <h4 className="font-medium text-sm">
            工作经历 {index + 1} · {record.companyName}
          </h4>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">在职时间</dt>
              <dd className="mt-1">
                {record.employmentStart} 至 {record.employmentEnd ?? "今"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">是否已离职</dt>
              <dd className="mt-1">{record.hasLeftCompany ? "是" : "否"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">最后职位</dt>
              <dd className="mt-1">{record.lastPosition}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">离职原因</dt>
              <dd className="mt-1">
                {record.leavingReason ? leavingReasonLabels[record.leavingReason] : "—"}
                {record.leavingReasonOther ? `：${record.leavingReasonOther}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">违纪记录</dt>
              <dd className="mt-1">{display(record.disciplinaryRecord)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">人力联系人</dt>
              <dd className="mt-1">
                {display(record.hrContact.name)} · {display(record.hrContact.contact)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">直接主管</dt>
              <dd className="mt-1">
                {display(record.lineManager.name)} · {display(record.lineManager.contact)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">同事联系人</dt>
              <dd className="mt-1">
                {display(record.colleague.name)} · {display(record.colleague.contact)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">允许联系证明人</dt>
              <dd className="mt-1">{record.contactPermission ? "是" : "否"}</dd>
            </div>
          </dl>
        </section>
      ))}
    </div>
  );
}

function BackgroundCheckEmailDialog({
  candidateId,
  onOpenChange,
  onSent,
  open,
  slug,
}: {
  candidateId: string;
  onOpenChange: (open: boolean) => void;
  onSent: () => Promise<void>;
  open: boolean;
  slug: string;
}) {
  const [preview, setPreview] = useState<BackgroundCheckEmailPreviewRecord | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const previewQuery = useQuery({
    enabled: open,
    queryFn: () => getBackgroundCheckEmailPreview(slug, candidateId),
    queryKey: ["background-check-email-preview", slug, candidateId],
    staleTime: 0,
  });
  useEffect(() => {
    if (!open || !previewQuery.data) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- Server defaults replace stale values when a fresh preview arrives.
    setPreview(previewQuery.data);
    setTo(previewQuery.data.to);
    setSubject(previewQuery.data.subject);
    setContent(previewQuery.data.content);
  }, [open, previewQuery.data]);
  const exactLinkCount = preview ? content.split(preview.formUrl).length - 1 : 0;
  const pathCount = content.match(/\/background-check\/[A-Za-z0-9_-]+/g)?.length ?? 0;
  const linkValid = exactLinkCount === 1 && pathCount === 1;
  const mutation = useMutation({
    mutationFn: () => sendBackgroundCheckEmail(slug, candidateId, { content, subject, to }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "邮件发送失败"),
    onSuccess: async () => {
      toast.success("背调信息采集邮件已发送");
      onOpenChange(false);
      await onSent();
    },
  });
  let linkHint = "背调链接由系统生成，请勿修改。";
  if (previewQuery.isError) {
    linkHint = "无法加载系统背调链接，请关闭后重试。";
  } else if (!previewQuery.isPending && !linkValid) {
    linkHint = "背调链接缺失或已被修改，请关闭后重新打开弹窗恢复。";
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>发送背调信息采集邮件</DialogTitle>
          <DialogDescription>候选人提交后，系统会提醒 HR 核对并记录背调结果。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="background-check-email-to">接收邮箱</Label>
            <Input
              id="background-check-email-to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="background-check-email-subject">邮件主题</Label>
            <Input
              id="background-check-email-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="background-check-email-content">邮件内容</Label>
            <Textarea
              aria-invalid={!previewQuery.isPending && !linkValid}
              id="background-check-email-content"
              rows={9}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
            <p
              className={
                !previewQuery.isPending && !linkValid
                  ? "text-destructive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {linkHint}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              previewQuery.isPending ||
              !linkValid ||
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

export function BackgroundCheckPanel({
  candidateId,
  disabled,
  review,
}: {
  candidateId: string;
  disabled?: boolean;
  review?: BackgroundCheckReview;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [emailOpen, setEmailOpen] = useState(false);
  const queryKey = ["background-check", slug, candidateId] as const;
  const collectionQuery = useQuery({
    queryFn: () => getBackgroundCheckCollection(slug, candidateId),
    queryKey,
  });
  const copyMutation = useMutation({
    mutationFn: () => getBackgroundCheckPublicLink(slug, candidateId),
    onError: (error) => toast.error(error instanceof Error ? error.message : "复制链接失败"),
    onSuccess: async ({ url }) => {
      await navigator.clipboard.writeText(url);
      toast.success("背调信息采集链接已复制");
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const collection = collectionQuery.data;
  const { description, heading, statusLabel, statusVariant, submitted } =
    getBackgroundCheckPanelMeta(collection?.status, review);
  return (
    <Frame>
      <FrameHeader className="h-auto min-h-10 justify-between gap-3 py-2">
        <FrameTitle>背调信息采集</FrameTitle>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        {collectionQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex gap-3">
                <IconShieldCheck className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">{heading}</p>
                  <p className="mt-1 text-muted-foreground text-xs">{description}</p>
                  {collection?.emailSentAt ? (
                    <p className="mt-2 text-muted-foreground text-xs">
                      发送至 {collection.emailRecipient} ·{" "}
                      {new Date(collection.emailSentAt).toLocaleString("zh-CN")}
                    </p>
                  ) : null}
                </div>
              </div>
              {!submitted && !disabled ? (
                <div className="flex gap-2">
                  <Button
                    disabled={copyMutation.isPending}
                    onClick={() => copyMutation.mutate()}
                    size="sm"
                    variant="outline"
                  >
                    <IconCopy className="size-4" />
                    复制链接
                  </Button>
                  <Button onClick={() => setEmailOpen(true)} size="sm">
                    <IconMail className="size-4" />
                    发送邮件
                  </Button>
                </div>
              ) : null}
            </div>
            {submitted ? <BackgroundCheckReviewSummary review={review} /> : null}
            {collection ? <BackgroundCheckSubmittedDetails collection={collection} /> : null}
          </>
        )}
      </FramePanel>
      <BackgroundCheckEmailDialog
        candidateId={candidateId}
        onOpenChange={setEmailOpen}
        onSent={async () => await queryClient.invalidateQueries({ queryKey })}
        open={emailOpen && !submitted && !disabled}
        slug={slug}
      />
    </Frame>
  );
}
