"use client";

import { IconBan, IconCircleCheck, IconMail, IconPencil } from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 阶段的详情面板内容：
//   - 顶部：候选人期望（薪资 / 现 base / 期望入职日）—— 可编辑，partial merge
//   - 下方：Offer 草稿版本时间线（version desc）
//   - 新建 Offer / 编辑 draft / 记录响应 / 撤回
//   - 候选人接受 Offer 时弹二次确认，请上层走「标记结束 hired」流程
//
// Offer-stage panel: candidate expectations inline form + offer draft
// timeline. Draft → sent → respond / cancel flows; on "accepted" we prompt
// the caller to launch the close flow.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { toast } from "sonner";
import { offerDraftStatusMeta } from "@app/db-schema/studio-interviews";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import {
  cancelOfferDraft,
  fetchStudioResume,
  patchOfferDraft,
  updateCandidateExpectations,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { DatePicker } from "@/components/date-time-picker";
import { Badge } from "@/components/ui/badge";
import { EmptyValue } from "@/components/features/display/empty-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  OfferDraftFormFields,
  buildOfferDraftPayload,
  createOfferFormFieldSetter,
  formatDate,
  formatIsoDateOnly,
  offerFormStateFromDraft,
} from "./offer-stage-form";
import type { OfferFormState } from "./offer-stage-form";

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

  if (editing) {
    return (
      <Card className="gap-0 rounded-lg py-0">
        <CardContent className="p-4">
          <h4 className="mb-3 font-medium text-sm">编辑候选人期望</h4>
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
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">候选人期望</h4>
            <p className="text-muted-foreground text-xs">
              发 Offer 前先收集候选人期望，做议价参考。
            </p>
          </div>
          {disabled ? null : (
            <Button onClick={startEditing} size="sm" variant="ghost">
              <IconPencil className="size-3.5" />
              编辑
            </Button>
          )}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <ExpectationField
            label="期望月薪"
            value={meta?.expectedSalary ? `¥ ${meta.expectedSalary.toLocaleString()}` : null}
          />
          <ExpectationField
            label="当前月薪"
            value={meta?.currentSalary ? `¥ ${meta.currentSalary.toLocaleString()}` : null}
          />
          <ExpectationField label="最早入职日" value={meta?.earliestJoiningDate ?? null} />
          <ExpectationField label="备注" value={meta?.notes ?? null} />
        </dl>
      </CardContent>
    </Card>
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

export function OfferCardView({
  dependencies,
  draft,
  canDelete,
  canUpdate,
  candidateId,
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
  disabled?: boolean;
  onRespond: () => void;
  onSaved: () => void;
  onCancelled: () => void;
}) {
  const { slug } = dependencies;
  const meta = offerDraftStatusMeta[draft.status];
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OfferFormState>(() => offerFormStateFromDraft(draft));
  const setFormField = createOfferFormFieldSetter(setForm);

  const cancelMutation = useMutation({
    mutationFn: () => cancelOfferDraft(slug, candidateId, draft.id),
    onError: (e) => toast.error(e instanceof Error ? e.message : "撤回失败"),
    onSuccess: () => {
      toast.success("已撤回 Offer");
      onCancelled();
    },
  });
  const saveMutation = useMutation({
    mutationFn: () => patchOfferDraft(slug, candidateId, draft.id, buildOfferDraftPayload(form)),
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
    onSuccess: () => {
      toast.success("已更新草稿");
      setEditing(false);
      onSaved();
    },
  });

  function cancelEditing() {
    setForm(offerFormStateFromDraft(draft));
    setEditing(false);
  }

  function startEditing() {
    setForm(offerFormStateFromDraft(draft));
    setEditing(true);
  }

  if (editing && canUpdate && draft.status === "draft") {
    return (
      <Card className="gap-0 rounded-lg py-0">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">v{draft.version} · 编辑 Offer 草稿</span>
              <Badge variant={meta.tone}>{meta.label}</Badge>
            </div>
          </div>

          <OfferDraftFormFields
            form={form}
            idPrefix={`offer-${draft.id}`}
            onFieldChange={setFormField}
          />

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
              disabled={saveMutation.isPending || !form.position.trim() || !form.baseSalary}
              onClick={() => saveMutation.mutate()}
              size="sm"
            >
              {saveMutation.isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium text-sm">
              v{draft.version} · {draft.position}
            </span>
            <Badge variant={meta.tone}>{meta.label}</Badge>
          </div>

          <OfferDraftReadonlyFields draft={draft} />

          {disabled ? null : (
            <div className="border-border/60 border-t pt-3">
              <OfferCardActions
                canDelete={canDelete}
                canUpdate={canUpdate}
                cancelMutation={cancelMutation}
                draft={draft}
                onEdit={startEditing}
                onRespond={onRespond}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OfferCardActions({
  draft,
  canDelete,
  canUpdate,
  onEdit,
  onRespond,
  cancelMutation,
}: {
  draft: OfferDraftRecord;
  canDelete: boolean;
  canUpdate: boolean;
  onEdit: () => void;
  onRespond: () => void;
  cancelMutation: { mutate: () => void; isPending: boolean };
}) {
  if (draft.status === "draft") {
    if (!canUpdate) {
      return null;
    }
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onEdit} size="sm" variant="ghost">
          <IconPencil className="size-4" />
          编辑
        </Button>
      </div>
    );
  }
  if (draft.status === "sent") {
    const hasActions = canUpdate || canDelete;
    if (!hasActions) {
      return null;
    }
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {canUpdate ? (
          <Button onClick={onRespond} size="sm">
            <IconCircleCheck className="size-4" />
            记录响应
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
            size="sm"
            variant="outline"
          >
            <IconBan className="size-4" />
            撤回
          </Button>
        ) : null}
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
      {draft.sentAt ? <ReadonlyOfferField label="发送于" value={formatDate(draft.sentAt)} /> : null}
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

export function SendOfferConfirmDialog({
  candidateEmail,
  isPending,
  onConfirm,
  onOpenChange,
  open,
}: {
  candidateEmail: string | null;
  isPending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const email = candidateEmail?.trim() || "";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认发送 Offer</DialogTitle>
          <DialogDescription>
            发送前请确认候选人邮箱。确认后该 Offer 会进入「已发送」状态。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <IconMail className="size-3.5" />
            即将发送至
          </div>
          <div className="mt-1 font-medium text-sm">
            {email || <span className="text-muted-foreground">未填写候选人邮箱</span>}
          </div>
        </div>

        <DialogFooter>
          <Button disabled={isPending} onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button disabled={isPending || !email} onClick={onConfirm}>
            {isPending ? "发送中…" : "确认发送"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OfferCard(props: Omit<Parameters<typeof OfferCardView>[0], "dependencies">) {
  return <OfferCardView {...props} dependencies={{ slug: useWorkspaceSlug() }} />;
}
