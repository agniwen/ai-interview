"use client";

import { IconCircleCheck, IconCopy, IconMail, IconPencil } from "@tabler/icons-react";
/* oxlint-disable complexity, max-lines, no-nested-ternary, no-use-before-define -- One card coordinates Offer content, approval status, and delivery actions; helpers remain below the public component. */
// Offer 接受后完成协商，后续继续背调与入职。

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { offerDraftStatusMeta } from "@app/db-schema/studio-interviews";
import { offerApprovalLabels } from "@app/shared/offer-approval";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import {
  deleteOfferDraft,
  voidOfferDraft,
  fetchStudioResume,
  getOfferApprovalPolicy,
  getOfferPublicLink,
  patchOfferDraft,
  sendOfferDraft,
  updateCandidateExpectations,
  rpcFetch,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useHasPermission } from "@/hooks/use-has-permission";
import { SubmitOfferApprovalDialog } from "@/components/features/offer-approval/submit-dialog";
import {
  approvalApi,
  approvalDetailOptions,
  approvalKeys,
} from "@/components/features/offer-approval/queries";
import { DatePicker } from "@/components/date-time-picker";
import { Badge } from "@/components/ui/badge";
import { EmptyValue } from "@/components/features/display/empty-value";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  OfferDraftFormFields,
  buildOfferDraftPayload,
  createOfferFormFieldSetter,
  formatDate,
  formatIsoDateOnly,
  offerFormStateFromDraft,
} from "./offer-stage-form";
import type { OfferFormState } from "./offer-stage-form";
import { OfferEmailDialog } from "./offer-email-dialog";

export function CandidateExpectationsBlock({
  candidateId,
  disabled,
}: {
  candidateId: string;
  disabled?: boolean;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { data: resume } = useQuery({
    enabled: !!candidateId,
    queryFn: () => fetchStudioResume(slug, candidateId),
    queryKey: ["studio-resumes", slug, "detail", candidateId],
  });
  const meta = resume?.candidateExpectationsMeta;

  const [editing, setEditing] = useState(false);
  const [expectedSalary, setExpectedSalary] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [earliestJoiningDate, setEarliestJoiningDate] = useState("");
  const [notes, setNotes] = useState("");

  function startEditing() {
    setExpectedSalary(meta?.expectedSalary ? String(meta.expectedSalary) : "");
    setCurrentSalary(meta?.currentSalary ? String(meta.currentSalary) : "");
    setEarliestJoiningDate(meta?.earliestJoiningDate ?? "");
    setNotes(meta?.notes ?? "");
    setEditing(true);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const parsedExpected = expectedSalary === "" ? null : Number(expectedSalary);
      const parsedCurrent = currentSalary === "" ? null : Number(currentSalary);
      if (
        (parsedExpected !== null && (Number.isNaN(parsedExpected) || parsedExpected < 0)) ||
        (parsedCurrent !== null && (Number.isNaN(parsedCurrent) || parsedCurrent < 0))
      ) {
        throw new Error("薪资需为非负整数");
      }
      return updateCandidateExpectations(slug, candidateId, {
        currentSalary: parsedCurrent,
        earliestJoiningDate: earliestJoiningDate || null,
        expectedSalary: parsedExpected,
        notes: notes.trim() || null,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
    onSuccess: () => {
      toast.success("已更新候选人期望");
      void queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "detail", candidateId],
      });
      setEditing(false);
    },
  });

  if (editing && !disabled) {
    return (
      <Frame>
        <FrameHeader className="h-auto min-h-10 py-2">
          <FrameTitle>编辑候选人期望</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-sm" htmlFor="exp-salary">
                期望月薪
              </Label>
              <Input
                id="exp-salary"
                inputMode="numeric"
                min={0}
                onChange={(e) => setExpectedSalary(e.target.value)}
                placeholder="如 30000"
                type="number"
                value={expectedSalary}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-sm" htmlFor="cur-salary">
                当前月薪
              </Label>
              <Input
                id="cur-salary"
                inputMode="numeric"
                min={0}
                onChange={(e) => setCurrentSalary(e.target.value)}
                placeholder="如 25000"
                type="number"
                value={currentSalary}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-sm" htmlFor="exp-joining">
                最早入职日
              </Label>
              <DatePicker
                id="exp-joining"
                onValueChange={setEarliestJoiningDate}
                value={earliestJoiningDate}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-sm" htmlFor="exp-notes">
                备注
              </Label>
              <Textarea
                id="exp-notes"
                maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="如「希望远程」「期权敏感」"
                rows={2}
                value={notes}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              disabled={mutation.isPending}
              onClick={() => setEditing(false)}
              size="sm"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()} size="sm">
              {mutation.isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame>
      <FrameHeader className="h-auto min-h-10 justify-between gap-3 py-2">
        <FrameTitle>候选人期望</FrameTitle>
        {disabled ? null : (
          <Button onClick={startEditing} size="sm" variant="ghost">
            <IconPencil data-icon="inline-start" />
            编辑
          </Button>
        )}
      </FrameHeader>
      <FramePanel>
        <p className="text-muted-foreground text-xs">发 Offer 前先收集候选人期望，做议价参考。</p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <ExpectationField
            label="期望月薪"
            value={meta?.expectedSalary ? `¥ ${meta.expectedSalary.toLocaleString()}` : null}
          />
          <ExpectationField
            label="当前月薪"
            value={meta?.currentSalary ? `¥ ${meta.currentSalary.toLocaleString()}` : null}
          />
          <ExpectationField
            label="转正工资"
            value={meta?.agreedBaseSalary ? `¥ ${meta.agreedBaseSalary.toLocaleString()}` : null}
          />
          <ExpectationField
            label="试用期工资"
            value={meta?.probationSalary ? `¥ ${meta.probationSalary.toLocaleString()}` : null}
          />
          <ExpectationField
            label="出国工资"
            value={meta?.overseasSalary ? `¥ ${meta.overseasSalary.toLocaleString()}` : null}
          />
          <ExpectationField label="最早入职日" value={meta?.earliestJoiningDate ?? null} />
          <ExpectationField label="备注" value={meta?.notes ?? null} />
        </dl>
      </FramePanel>
    </Frame>
  );
}

function ExpectationField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-foreground text-sm">{value || <EmptyValue />}</dd>
    </div>
  );
}

// ── Offer 单版卡片 ──
// Single offer-version card.

export interface OfferCardDependencies {
  slug: string;
}

export function buildOfferLinkCopy({
  candidateName,
  position,
  url,
}: {
  candidateName: string;
  position: string;
  url: string;
}) {
  const greeting = candidateName.trim() ? `${candidateName.trim()}，您好！` : "您好！";
  const role = position.trim() ? `「${position.trim()}」岗位` : "";
  return `${greeting}\n\n您的${role} Offer 已准备好，请通过以下链接查看详情，并在页面中确认是否接受。如有疑问，请与 HR 联系。\n\nOffer 查看与确认链接：\n${url}`;
}

export function OfferCardView({
  dependencies,
  draft,
  canDelete,
  canUpdate,
  candidateId,
  candidateEmail,
  candidateName,
  disabled,
  onRespond,
  onSaved,
  onCancelled,
}: {
  dependencies: OfferCardDependencies;
  draft: OfferDraftRecord;
  canDelete: boolean;
  canUpdate: boolean;
  candidateId: string;
  candidateEmail: string | null;
  candidateName: string;
  disabled?: boolean;
  onRespond: () => void;
  onSaved: () => void;
  onCancelled: () => void;
}) {
  const { slug } = dependencies;
  const meta = offerDraftStatusMeta[draft.status];
  const [editing, setEditing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [invalidateApprovedApproval, setInvalidateApprovedApproval] = useState(false);
  const queryClient = useQueryClient();
  const canCreateApproval =
    useHasPermission("page", "offerApprovals") && useHasPermission("offerApproval", "create");
  const canReadApproval =
    useHasPermission("page", "offerApprovals") && useHasPermission("offerApproval", "read");
  const approvalPolicy = useQuery({
    enabled: draft.status === "draft" && canUpdate,
    queryFn: () => getOfferApprovalPolicy(slug, candidateId),
    queryKey: approvalKeys.policy(slug),
  });
  const approval = useQuery({
    ...approvalDetailOptions(slug, draft.currentApprovalId ?? ""),
    enabled: Boolean(draft.currentApprovalId && canReadApproval),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 15_000 : false),
  });
  const approvedApproval = approval.data?.status === "approved" && !approval.data.invalidatedAt;
  const currentApprovalPending = Boolean(
    draft.currentApprovalId &&
    (!canReadApproval ||
      approval.isPending ||
      !approval.data ||
      (approval.data.status === "pending" && !approval.data.invalidatedAt)),
  );
  const approvalRequired = Boolean(approvalPolicy.data?.approvalRequired || currentApprovalPending);
  const publishBlockReason = approvalPolicy.isPending
    ? "正在确认审批配置…"
    : approvalPolicy.isError
      ? "审批配置暂不可用，请刷新后重试。"
      : approvalRequired && !approvedApproval
        ? "请先提交并完成审批，审批通过后才能发布。"
        : null;
  const canSubmitApproval =
    canCreateApproval &&
    (!draft.currentApprovalId ||
      (canReadApproval &&
        Boolean(
          approval.data &&
          (approval.data.invalidatedAt ||
            ["cancelled", "rejected", "withdrawn"].includes(approval.data.status)),
        )));
  const approvalStatusLabel = approval.data
    ? getApprovalStatusLabel(approval.data.status, Boolean(approval.data.invalidatedAt))
    : null;
  const [form, setForm] = useState<OfferFormState>(() => offerFormStateFromDraft(draft));
  const setFormField = createOfferFormFieldSetter(setForm);

  const publishMutation = useMutation({
    mutationFn: () => sendOfferDraft(slug, candidateId, draft.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新失败"),
    onSuccess: () => {
      setPublishOpen(false);
      toast.success("Offer 已发布，可发送邮件或复制链接");
      onSaved();
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () =>
      draft.currentApprovalId
        ? voidOfferDraft(slug, candidateId, draft.id)
        : deleteOfferDraft(slug, candidateId, draft.id),
    onError: (e) => toast.error(e instanceof Error ? e.message : "移除草稿失败"),
    onSuccess: () => {
      toast.success(draft.currentApprovalId ? "已作废 Offer，审批历史已保留" : "已删除 Offer");
      onCancelled();
    },
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      patchOfferDraft(slug, candidateId, draft.id, {
        ...buildOfferDraftPayload(form),
        expectedContentRevision: draft.contentRevision,
        invalidateApproval: invalidateApprovedApproval,
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
    onSuccess: () => {
      toast.success("已更新草稿");
      setEditing(false);
      onSaved();
    },
  });
  const withdrawMutation = useMutation({
    mutationFn: () => {
      if (!draft.currentApprovalId) {
        throw new Error("当前没有可撤回的审批");
      }
      return rpcFetch(
        approvalApi[":approvalId"].withdraw.$post({
          json: { reason: withdrawalReason, requestId: crypto.randomUUID() },
          param: { approvalId: draft.currentApprovalId, slug },
        }),
        "撤回审批失败",
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "撤回审批失败"),
    onSuccess: async () => {
      setWithdrawOpen(false);
      setWithdrawalReason("");
      if (draft.currentApprovalId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: approvalKeys.detail(slug, draft.currentApprovalId),
          }),
          queryClient.invalidateQueries({ queryKey: approvalKeys.all(slug) }),
        ]);
      }
      onSaved();
      toast.success("审批已撤回，可调整 Offer 后重新提交");
    },
  });

  function cancelEditing() {
    setForm(offerFormStateFromDraft(draft));
    setInvalidateApprovedApproval(false);
    setEditing(false);
  }

  function startEditing() {
    setForm(offerFormStateFromDraft(draft));
    setInvalidateApprovedApproval(false);
    setEditing(true);
  }

  async function copyOfferLink() {
    try {
      const { url } = await getOfferPublicLink(slug, candidateId, draft.id);
      await navigator.clipboard.writeText(
        buildOfferLinkCopy({ candidateName, position: draft.position, url }),
      );
      toast.success("Offer 文案和链接已复制，可直接转发给候选人");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制链接失败");
    }
  }

  if (editing && !disabled && canUpdate && draft.status === "draft") {
    return (
      <div className="min-w-0">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">编辑 Offer 草稿</span>
              <Badge variant={meta.tone}>{meta.label}</Badge>
            </div>
          </div>

          <OfferDraftFormFields
            form={form}
            idPrefix={`offer-${draft.id}`}
            onFieldChange={setFormField}
          />

          {approvedApproval ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
              <Checkbox
                aria-label="确认修改会使已通过审批失效"
                checked={invalidateApprovedApproval}
                onCheckedChange={(checked) => setInvalidateApprovedApproval(checked === true)}
              />
              <span>
                我确认修改已通过的 Offer 会使当前审批失效，保存后必须重新提交审批才能发布。
              </span>
            </div>
          ) : null}

          <div className="mt-3 flex justify-end gap-2">
            <Button
              disabled={saveMutation.isPending}
              onClick={cancelEditing}
              size="sm"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={
                saveMutation.isPending ||
                !form.position.trim() ||
                !form.baseSalary ||
                (approvedApproval && !invalidateApprovedApproval)
              }
              onClick={() => saveMutation.mutate()}
              size="sm"
            >
              {saveMutation.isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div>
        <div className="space-y-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{draft.position}</span>
            {draft.status === "draft" && approvalStatusLabel ? (
              <Badge variant={approval.data?.status === "rejected" ? "destructive" : "outline"}>
                {approvalStatusLabel}
              </Badge>
            ) : (
              <Badge variant={meta.tone}>
                {draft.status === "draft" && draft.currentApprovalId && canReadApproval
                  ? "读取审批状态…"
                  : meta.label}
              </Badge>
            )}
          </div>

          <PublishOfferConfirmDialog
            isPending={publishMutation.isPending}
            onConfirm={() => publishMutation.mutate()}
            onOpenChange={setPublishOpen}
            open={publishOpen && !disabled && canUpdate}
          />
          <OfferEmailDialog
            candidateEmail={candidateEmail}
            candidateId={candidateId}
            candidateName={candidateName}
            draft={draft}
            onOpenChange={setEmailOpen}
            onSent={onSaved}
            open={emailOpen && !disabled && canUpdate}
            slug={slug}
          />
          {approvalOpen ? (
            <SubmitOfferApprovalDialog
              offerId={draft.id}
              onClose={() => setApprovalOpen(false)}
              onSaved={onSaved}
              recordId={candidateId}
              slug={slug}
            />
          ) : null}
          <Dialog
            onOpenChange={(open) => {
              setWithdrawOpen(open);
              if (!open) {
                setWithdrawalReason("");
              }
            }}
            open={withdrawOpen}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>撤回本轮审批</DialogTitle>
                <DialogDescription>
                  撤回后，本轮审批会结束并保留在历史记录中。调整 Offer 后可重新提交审批。
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor={`withdrawal-reason-${draft.id}`}>撤回原因</Label>
                <Textarea
                  id={`withdrawal-reason-${draft.id}`}
                  maxLength={2000}
                  onChange={(event) => setWithdrawalReason(event.target.value)}
                  placeholder="请说明撤回原因"
                  rows={3}
                  value={withdrawalReason}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={withdrawMutation.isPending}
                  onClick={() => setWithdrawOpen(false)}
                  variant="outline"
                >
                  取消
                </Button>
                <Button
                  disabled={withdrawMutation.isPending || !withdrawalReason.trim()}
                  onClick={() => withdrawMutation.mutate()}
                  variant="destructive"
                >
                  {withdrawMutation.isPending ? "撤回中…" : "确认撤回"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <OfferDraftReadonlyFields draft={draft} />
          {draft.currentApprovalId && canReadApproval ? (
            <div className="text-sm">
              {approval.isPending ? (
                <span className="text-muted-foreground">正在读取审批状态…</span>
              ) : approval.data ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-muted-foreground">当前审批</span>
                  <Badge variant="outline">
                    {offerApprovalLabels[approval.data.status]}
                    {approval.data.invalidatedAt ? " · 已不适用" : ""}
                  </Badge>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Link
                      className="text-primary underline underline-offset-4"
                      params={{ approvalId: draft.currentApprovalId, slug }}
                      to="/w/$slug/studio/offer-approvals/$approvalId"
                    >
                      查看审批历史
                    </Link>
                    {!disabled && approval.data.canManage && approval.data.status === "pending" ? (
                      <Button
                        className="text-destructive hover:text-destructive"
                        onClick={() => setWithdrawOpen(true)}
                        size="sm"
                        variant="ghost"
                      >
                        撤回本轮审批
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <span className="text-destructive">审批状态暂不可用，请刷新后重试。</span>
              )}
            </div>
          ) : null}

          {disabled ? null : (
            <div className="border-border/60 border-t pt-3">
              <OfferCardActions
                canDelete={canDelete}
                canUpdate={canUpdate}
                cancelMutation={cancelMutation}
                draft={draft}
                onEmail={() => setEmailOpen(true)}
                onPublish={() => setPublishOpen(true)}
                onCopyLink={copyOfferLink}
                onEdit={startEditing}
                onSubmitApproval={() => setApprovalOpen(true)}
                onRespond={onRespond}
                canSubmitApproval={canSubmitApproval}
                publishBlockReason={publishBlockReason}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getApprovalStatusLabel(status: string, invalidated: boolean) {
  if (invalidated) {
    return "审批已失效";
  }
  return {
    approved: "审批通过",
    cancelled: "审批已取消",
    pending: "审批中",
    rejected: "审批已驳回",
    withdrawn: "审批已撤回",
  }[status];
}

function OfferCardActions({
  draft,
  canDelete,
  canUpdate,
  onEdit,
  onSubmitApproval,
  onPublish,
  onEmail,
  onCopyLink,
  onRespond,
  canSubmitApproval,
  publishBlockReason,
  cancelMutation,
}: {
  draft: OfferDraftRecord;
  canDelete: boolean;
  canUpdate: boolean;
  onEdit: () => void;
  onSubmitApproval: () => void;
  onPublish: () => void;
  onEmail: () => void;
  onCopyLink: () => void;
  onRespond: () => void;
  canSubmitApproval: boolean;
  publishBlockReason: string | null;
  cancelMutation: { mutate: () => void; isPending: boolean };
}) {
  if (draft.status === "draft") {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {canDelete && draft.sentAt === null && (
          <Button
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
            size="sm"
            variant="outline"
          >
            {draft.currentApprovalId ? "作废 Offer 草稿" : "删除 Offer"}
          </Button>
        )}
        {canUpdate && (
          <>
            {canSubmitApproval ? (
              <Button
                disabled={cancelMutation.isPending}
                onClick={onSubmitApproval}
                size="sm"
                variant="outline"
              >
                提交审批
              </Button>
            ) : null}
            <Button
              disabled={cancelMutation.isPending || Boolean(publishBlockReason)}
              onClick={onPublish}
              size="sm"
            >
              <IconCircleCheck className="size-4" />
              确认并发布
            </Button>
            {publishBlockReason ? (
              <p className="w-full text-xs text-muted-foreground">{publishBlockReason}</p>
            ) : null}
            <Button disabled={cancelMutation.isPending} onClick={onEdit} size="sm" variant="ghost">
              <IconPencil className="size-4" />
              编辑
            </Button>
          </>
        )}
      </div>
    );
  }
  if (draft.status === "sent" && canUpdate) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onCopyLink} size="sm" variant="outline">
          <IconCopy className="size-4" />
          复制 Offer 链接
        </Button>
        <Button onClick={onEmail} size="sm" variant="outline">
          <IconMail className="size-4" />
          {draft.emailSentAt ? "重新发送邮件" : "发送邮件"}
        </Button>
        <Button onClick={onRespond} size="sm">
          <IconCircleCheck className="size-4" />
          记录响应
        </Button>
      </div>
    );
  }
  return null;
}

function OfferDraftReadonlyFields({ draft }: { draft: OfferDraftRecord }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm lg:grid-cols-4">
      <ReadonlyOfferField label="职位" value={draft.position} />
      <ReadonlyOfferField label="Base 月薪" value={`¥ ${draft.baseSalary.toLocaleString()}`} />
      <ReadonlyOfferField
        label="年度奖金"
        value={draft.bonus === null ? null : `¥ ${draft.bonus.toLocaleString()}`}
      />
      <ReadonlyOfferField label="期权 / 股票" value={draft.equity} />
      <ReadonlyOfferField
        label="预计入职日"
        value={draft.joiningDate ? formatIsoDateOnly(draft.joiningDate) : null}
      />
      <ReadonlyOfferField
        label="Offer 有效期至"
        value={draft.expiresAt ? formatIsoDateOnly(draft.expiresAt) : null}
      />
      {draft.publishedAt ? (
        <ReadonlyOfferField label="发布于" value={formatDate(draft.publishedAt)} />
      ) : null}
      {draft.emailSentAt ? (
        <ReadonlyOfferField
          label="邮件状态"
          value={`已发送至 ${draft.emailRecipient ?? "候选人"} · ${formatDate(draft.emailSentAt)}`}
        />
      ) : null}
      {draft.responseSource ? (
        <ReadonlyOfferField
          label="响应来源"
          value={draft.responseSource === "candidate" ? "候选人在线确认" : "HR 手动记录"}
        />
      ) : null}
      {draft.declineReason ? (
        <ReadonlyOfferField
          className="col-span-2 lg:col-span-4"
          label="拒绝原因"
          value={draft.declineReason}
        />
      ) : null}
      {draft.candidateCounter ? (
        <ReadonlyOfferField
          className="col-span-2 lg:col-span-4"
          label="候选人议价"
          value={draft.candidateCounter}
        />
      ) : null}
      <ReadonlyOfferField className="col-span-2 lg:col-span-4" label="备注" value={draft.notes} />
    </dl>
  );
}

function ReadonlyOfferField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string | null;
}) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 wrap-break-word text-foreground text-sm">{value || <EmptyValue />}</dd>
    </div>
  );
}

export function PublishOfferConfirmDialog({
  isPending,
  onConfirm,
  onOpenChange,
  open,
}: {
  isPending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认并发布 Offer</DialogTitle>
          <DialogDescription>
            发布后内容将锁定，并生成候选人确认链接。之后可发送邮件或复制链接。
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button disabled={isPending} onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button disabled={isPending} onClick={onConfirm}>
            {isPending ? "处理中…" : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function OfferCard(props: Omit<Parameters<typeof OfferCardView>[0], "dependencies">) {
  return <OfferCardView {...props} dependencies={{ slug: useWorkspaceSlug() }} />;
}
