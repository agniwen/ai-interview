"use client";

/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 阶段的详情面板内容：
//   - 顶部：候选人期望（薪资 / 现 base / 期望入职日）—— 可编辑，partial merge
//   - 下方：Offer 草稿版本时间线（version desc）
//   - 新建 Offer / 编辑 draft / 发送 / 记录响应 / 撤回
//   - 候选人接受 Offer 时弹二次确认，请上层走「标记结案 hired」流程
//
// Offer-stage panel: candidate expectations inline form + offer draft
// timeline. Draft → sent → respond / cancel flows; on "accepted" we prompt
// the caller to launch the close flow.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRightIcon,
  BanIcon,
  CheckCircle2Icon,
  MailIcon,
  HandshakeIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { offerDraftStatusMeta } from "@arc/db-schema/studio-interviews";
import type { OfferDraftInput } from "@arc/db-schema/studio-interviews";
import type { OfferDraftRecord } from "@/lib/shared/studio-pipeline-stages";
import {
  cancelOfferDraft,
  createOfferDraft,
  fetchStudioResume,
  listOfferDrafts,
  patchOfferDraft,
  respondOfferDraft,
  sendOfferDraft,
  updateCandidateExpectations,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Badge } from "@/components/ui/badge";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

interface PanelProps {
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  disabled?: boolean;
  // 父级在「候选人接受 Offer」二次确认后，开「标记结案 + outcome=hired」dialog。
  // Parent opens the close dialog with outcome=hired after this fires.
  onRequestCloseAsHired?: () => void;
}

export function OfferStagePanel({
  candidateId,
  candidateEmail,
  candidateName,
  disabled,
  onRequestCloseAsHired,
}: PanelProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { data: drafts = [], isLoading } = useQuery({
    queryFn: () => listOfferDrafts(slug, candidateId),
    queryKey: ["offer-drafts", slug, candidateId],
  });

  function invalidateDrafts() {
    void queryClient.invalidateQueries({ queryKey: ["offer-drafts", slug, candidateId] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [respondTarget, setRespondTarget] = useState<OfferDraftRecord | null>(null);
  const [acceptedConfirm, setAcceptedConfirm] = useState<OfferDraftRecord | null>(null);

  function renderDraftsContent() {
    if (isLoading) {
      return (
        <Card className="gap-0 rounded-lg py-0">
          <CardContent className="bg-muted/30 p-6 text-center text-muted-foreground text-sm">
            加载中…
          </CardContent>
        </Card>
      );
    }

    if (drafts.length === 0) {
      return (
        <Empty className="border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandshakeIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>尚未发出 Offer</EmptyTitle>
            <EmptyDescription>
              {disabled ? "已结案候选人不可新建 Offer。" : "点「新建 Offer」起草第一版。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <div className="space-y-3">
        {drafts.map((draft) => (
          <OfferCard
            candidateEmail={candidateEmail}
            candidateId={candidateId}
            disabled={disabled}
            draft={draft}
            key={draft.id}
            onCancelled={invalidateDrafts}
            onRespond={() => setRespondTarget(draft)}
            onSaved={invalidateDrafts}
            onSent={invalidateDrafts}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <CandidateExpectationsBlock candidateId={candidateId} disabled={disabled} />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">Offer 版本</h3>
          <p className="text-muted-foreground text-xs">
            管理 {candidateName} 的 Offer：新版本会自动 supersede 旧的草稿/已发版本。
          </p>
        </div>
        {disabled ? null : (
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <PlusIcon className="size-4" />
            新建 Offer
          </Button>
        )}
      </div>

      {renderDraftsContent()}

      <CreateOrEditOfferDialog
        candidateEmail={candidateEmail}
        candidateId={candidateId}
        mode="create"
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
          }
        }}
        onSaved={invalidateDrafts}
        open={createOpen}
      />
      <RespondOfferDialog
        candidateId={candidateId}
        draft={respondTarget}
        onAccepted={(accepted) => {
          setAcceptedConfirm(accepted);
        }}
        onOpenChange={(open) => !open && setRespondTarget(null)}
        onResponded={invalidateDrafts}
      />
      <AcceptedConfirmDialog
        draft={acceptedConfirm}
        onOpenChange={(open) => !open && setAcceptedConfirm(null)}
        onProceed={() => {
          setAcceptedConfirm(null);
          onRequestCloseAsHired?.();
        }}
      />
    </div>
  );
}

// ── 候选人期望（内联编辑）──
// Candidate expectations inline editor.

function CandidateExpectationsBlock({
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

  // 打开编辑时同步当前值。
  // Sync form when entering edit mode.
  useEffect(() => {
    if (editing) {
      setExpectedSalary(meta?.expectedSalary ? String(meta.expectedSalary) : "");
      setCurrentSalary(meta?.currentSalary ? String(meta.currentSalary) : "");
      setEarliestJoiningDate(meta?.earliestJoiningDate ?? "");
      setNotes(meta?.notes ?? "");
    }
  }, [editing, meta]);

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
              <Input
                id="exp-joining"
                onChange={(e) => setEarliestJoiningDate(e.target.value)}
                type="date"
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
            <Button onClick={() => setEditing(true)} size="sm" variant="ghost">
              <PencilIcon className="size-3.5" />
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
      <dd className="mt-0.5 text-foreground text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

// ── Offer 单版卡片 ──
// Single offer-version card.

function OfferCard({
  draft,
  candidateId,
  candidateEmail,
  disabled,
  onSent,
  onRespond,
  onSaved,
  onCancelled,
}: {
  draft: OfferDraftRecord;
  candidateId: string;
  candidateEmail: string | null;
  disabled?: boolean;
  onSent: () => void;
  onRespond: () => void;
  onSaved: () => void;
  onCancelled: () => void;
}) {
  const slug = useWorkspaceSlug();
  const meta = offerDraftStatusMeta[draft.status];
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OfferFormState>(() => offerFormStateFromDraft(draft));
  const setFormField = createOfferFormFieldSetter(setForm);

  useEffect(() => {
    if (editing) {
      setForm(offerFormStateFromDraft(draft));
    }
  }, [draft, editing]);

  const sendMutation = useMutation({
    mutationFn: () => sendOfferDraft(slug, candidateId, draft.id),
    onError: (e) => toast.error(e instanceof Error ? e.message : "发送失败"),
    onSuccess: () => {
      toast.success("Offer 已发送");
      setSendConfirmOpen(false);
      onSent();
    },
  });
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

  if (editing && draft.status === "draft") {
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
                cancelMutation={cancelMutation}
                draft={draft}
                onEdit={() => setEditing(true)}
                onRespond={onRespond}
                onSend={() => setSendConfirmOpen(true)}
                sendPending={sendMutation.isPending}
              />
            </div>
          )}
        </div>
      </CardContent>
      <SendOfferConfirmDialog
        candidateEmail={candidateEmail}
        isPending={sendMutation.isPending}
        onConfirm={() => sendMutation.mutate()}
        onOpenChange={setSendConfirmOpen}
        open={sendConfirmOpen}
      />
    </Card>
  );
}

function OfferCardActions({
  draft,
  onEdit,
  onRespond,
  onSend,
  sendPending,
  cancelMutation,
}: {
  draft: OfferDraftRecord;
  onEdit: () => void;
  onRespond: () => void;
  onSend: () => void;
  sendPending: boolean;
  cancelMutation: { mutate: () => void; isPending: boolean };
}) {
  if (draft.status === "draft") {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onEdit} size="sm" variant="ghost">
          <PencilIcon className="size-4" />
          编辑
        </Button>
        <Button disabled={sendPending} onClick={onSend} size="sm">
          <SendIcon className="size-4" />
          发送
        </Button>
      </div>
    );
  }
  if (draft.status === "sent") {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onRespond} size="sm">
          <CheckCircle2Icon className="size-4" />
          记录响应
        </Button>
        <Button
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate()}
          size="sm"
          variant="outline"
        >
          <BanIcon className="size-4" />
          撤回
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
      <dd className="mt-0.5 break-words text-foreground text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function SendOfferConfirmDialog({
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
            <MailIcon className="size-3.5" />
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Toast 文案 helper：避免内联三元嵌套（mode + sendImmediately 两维组合）。
// Save-success toast helper; flattens the nested ternary of mode × sendImmediately.
function saveSuccessMessage(mode: "create" | "edit", sendImmediately: boolean): string {
  if (mode === "edit") {
    return "已更新草稿";
  }
  return sendImmediately ? "Offer 已发送" : "已保存草稿";
}

// 响应选项的中文标签 helper。
// Localized labels for the offer-response radio options.
function offerResponseLabel(value: "accepted" | "declined" | "counter"): string {
  if (value === "accepted") {
    return "接受";
  }
  return value === "declined" ? "拒绝" : "议价";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatIsoDateOnly(iso: string): string {
  const dateOnly = iso.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return dateOnly ?? formatDate(iso);
}

interface OfferFormState {
  position: string;
  baseSalary: string;
  bonus: string;
  equity: string;
  joiningDate: string;
  expiresAt: string;
  notes: string;
}

function createBlankOfferFormState(): OfferFormState {
  return {
    baseSalary: "",
    bonus: "",
    equity: "",
    expiresAt: "",
    joiningDate: "",
    notes: "",
    position: "",
  };
}

function offerFormStateFromDraft(draft: OfferDraftRecord): OfferFormState {
  return {
    baseSalary: String(draft.baseSalary),
    bonus: draft.bonus === null ? "" : String(draft.bonus),
    equity: draft.equity ?? "",
    expiresAt: draft.expiresAt ? formatIsoDateOnly(draft.expiresAt) : "",
    joiningDate: draft.joiningDate ? formatIsoDateOnly(draft.joiningDate) : "",
    notes: draft.notes ?? "",
    position: draft.position,
  };
}

function createOfferFormFieldSetter(setForm: Dispatch<SetStateAction<OfferFormState>>) {
  return <K extends keyof OfferFormState>(field: K, value: OfferFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
}

function buildOfferDraftPayload(form: OfferFormState): OfferDraftInput {
  const parsedBase = Number(form.baseSalary);
  if (Number.isNaN(parsedBase) || parsedBase <= 0) {
    throw new Error("Base salary 需为正整数");
  }
  const parsedBonus = form.bonus === "" ? null : Number(form.bonus);
  if (parsedBonus !== null && (Number.isNaN(parsedBonus) || parsedBonus < 0)) {
    throw new Error("奖金需为非负整数");
  }
  return {
    baseSalary: parsedBase,
    bonus: parsedBonus,
    equity: form.equity.trim() || null,
    expiresAt: form.expiresAt || null,
    joiningDate: form.joiningDate || null,
    notes: form.notes.trim() || null,
    position: form.position.trim(),
  };
}

function OfferDraftFormFields({
  form,
  idPrefix,
  onFieldChange,
}: {
  form: OfferFormState;
  idPrefix: string;
  onFieldChange: <K extends keyof OfferFormState>(field: K, value: OfferFormState[K]) => void;
}) {
  const fullSpanClassName = "sm:col-span-2";

  return (
    <div className="grid gap-3 py-2 sm:grid-cols-2">
      <div className={`grid gap-1.5 ${fullSpanClassName}`}>
        <Label className="text-sm" htmlFor={`${idPrefix}-position`}>
          职位
        </Label>
        <Input
          id={`${idPrefix}-position`}
          maxLength={200}
          onChange={(e) => onFieldChange("position", e.target.value)}
          placeholder="例如 高级前端工程师（L4）"
          value={form.position}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-base`}>
          Base 月薪 (¥)
        </Label>
        <Input
          id={`${idPrefix}-base`}
          inputMode="numeric"
          min={0}
          onChange={(e) => onFieldChange("baseSalary", e.target.value)}
          type="number"
          value={form.baseSalary}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-bonus`}>
          年度奖金 (¥，可选)
        </Label>
        <Input
          id={`${idPrefix}-bonus`}
          inputMode="numeric"
          min={0}
          onChange={(e) => onFieldChange("bonus", e.target.value)}
          type="number"
          value={form.bonus}
        />
      </div>
      <div className={`grid gap-1.5 ${fullSpanClassName}`}>
        <Label className="text-sm" htmlFor={`${idPrefix}-equity`}>
          期权 / 股票（可选，自由文本）
        </Label>
        <Input
          id={`${idPrefix}-equity`}
          maxLength={500}
          onChange={(e) => onFieldChange("equity", e.target.value)}
          placeholder="如 0.1% / 4 年 vest"
          value={form.equity}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-joining`}>
          预计入职日（可选）
        </Label>
        <Input
          id={`${idPrefix}-joining`}
          onChange={(e) => onFieldChange("joiningDate", e.target.value)}
          type="date"
          value={form.joiningDate}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-expires`}>
          Offer 有效期至（可选）
        </Label>
        <Input
          id={`${idPrefix}-expires`}
          onChange={(e) => onFieldChange("expiresAt", e.target.value)}
          type="date"
          value={form.expiresAt}
        />
      </div>
      <div className={`grid gap-1.5 ${fullSpanClassName}`}>
        <Label className="text-sm" htmlFor={`${idPrefix}-notes`}>
          备注（可选）
        </Label>
        <Textarea
          id={`${idPrefix}-notes`}
          maxLength={2000}
          onChange={(e) => onFieldChange("notes", e.target.value)}
          rows={2}
          value={form.notes}
        />
      </div>
    </div>
  );
}

// ── 新建 / 编辑 Offer dialog ──
// Create-or-edit dialog.

interface OfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateEmail: string | null;
  mode: "create" | "edit";
  existingDraft?: OfferDraftRecord | null;
  onSaved: () => void;
}

function CreateOrEditOfferDialog({
  open,
  onOpenChange,
  candidateId,
  candidateEmail,
  mode,
  existingDraft,
  onSaved,
}: OfferDialogProps) {
  const slug = useWorkspaceSlug();
  const [form, setForm] = useState<OfferFormState>(() => createBlankOfferFormState());
  const setFormField = createOfferFormFieldSetter(setForm);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSendConfirmOpen(false);
    }
    onOpenChange(next);
  }

  // 编辑模式打开时同步现值；新建模式打开时清空。
  // Sync form on open: prefill in edit mode, blank in create mode.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === "edit" && existingDraft) {
      setForm(offerFormStateFromDraft(existingDraft));
      setSendImmediately(false);
    } else {
      setForm(createBlankOfferFormState());
      setSendImmediately(false);
    }
  }, [open, mode, existingDraft]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = buildOfferDraftPayload(form);
      if (mode === "edit" && existingDraft) {
        return patchOfferDraft(slug, candidateId, existingDraft.id, payload);
      }
      return createOfferDraft(slug, candidateId, { ...payload, sendImmediately });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
    onSuccess: () => {
      toast.success(saveSuccessMessage(mode, sendImmediately));
      setSendConfirmOpen(false);
      onSaved();
      onOpenChange(false);
    },
  });

  function handleSave() {
    if (mode === "create" && sendImmediately) {
      setSendConfirmOpen(true);
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "编辑 Offer 草稿" : "新建 Offer"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "草稿状态可编辑。发送后请用「记录响应」/「撤回」操作。"
              : "新建版本会自动 supersede 已发出未结的旧版本。"}
          </DialogDescription>
        </DialogHeader>

        <OfferDraftFormFields form={form} idPrefix="offer" onFieldChange={setFormField} />
        <div className="grid gap-3 py-2 sm:grid-cols-2">
          {mode === "create" ? (
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                aria-label="立即发送 Offer"
                checked={sendImmediately}
                className="size-4 accent-foreground"
                id="offer-send-now"
                onChange={(e) => setSendImmediately(e.target.checked)}
                type="checkbox"
              />
              <Label className="cursor-pointer text-sm" htmlFor="offer-send-now">
                立即发送（跳过草稿状态）
              </Label>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={mutation.isPending || !form.position.trim() || !form.baseSalary}
            onClick={handleSave}
          >
            {mutation.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
        <SendOfferConfirmDialog
          candidateEmail={candidateEmail}
          isPending={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onOpenChange={setSendConfirmOpen}
          open={sendConfirmOpen}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── 记录响应 dialog ──
// Record-response dialog.

interface RespondDialogProps {
  draft: OfferDraftRecord | null;
  candidateId: string;
  onOpenChange: (open: boolean) => void;
  onResponded: () => void;
  onAccepted: (draft: OfferDraftRecord) => void;
}

function RespondOfferDialog({
  draft,
  candidateId,
  onOpenChange,
  onResponded,
  onAccepted,
}: RespondDialogProps) {
  const slug = useWorkspaceSlug();
  const [response, setResponse] = useState<"accepted" | "declined" | "counter">("accepted");
  const [counter, setCounter] = useState("");

  useEffect(() => {
    if (draft) {
      setResponse("accepted");
      setCounter("");
    }
  }, [draft]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!draft) {
        throw new Error("missing draft");
      }
      return respondOfferDraft(slug, candidateId, draft.id, {
        candidateCounter: response === "counter" ? counter.trim() || null : null,
        response,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "记录失败"),
    onSuccess: (updated) => {
      onResponded();
      if (updated.status === "accepted") {
        // 接受 Offer：让上层弹「标记结案 + outcome=hired」二次确认。
        // Accepted: nudge caller to launch the close-as-hired flow.
        onAccepted(updated);
      } else {
        toast.success(response === "declined" ? "已记录为拒绝" : "已记录候选人议价");
      }
      onOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={draft !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>记录候选人响应</DialogTitle>
          <DialogDescription>
            候选人接受 → 建议结案为「已录用」；候选人议价 → 当前版本保持已发出，后续新建版本响应。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup
            className="grid gap-2"
            onValueChange={(v) => setResponse(v as typeof response)}
            value={response}
          >
            {(["accepted", "declined", "counter"] as const).map((value) => (
              <div className="flex items-center gap-2" key={value}>
                <RadioGroupItem id={`resp-${value}`} value={value} />
                <Label className="cursor-pointer text-sm" htmlFor={`resp-${value}`}>
                  {offerResponseLabel(value)}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {response === "counter" ? (
            <div className="grid gap-1.5">
              <Label className="text-sm" htmlFor="counter-content">
                议价内容
              </Label>
              <Textarea
                id="counter-content"
                maxLength={2000}
                onChange={(e) => setCounter(e.target.value)}
                placeholder="例如：希望月薪提高到 35k，或希望追加 0.05% 期权"
                rows={3}
                value={counter}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "保存中…" : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 接受 Offer 二次确认 dialog ──
// "Just accepted → mark as hired?" confirmation.

function AcceptedConfirmDialog({
  draft,
  onOpenChange,
  onProceed,
}: {
  draft: OfferDraftRecord | null;
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={draft !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>候选人已接受 Offer</DialogTitle>
          <DialogDescription>
            是否立刻标记为「已录用」并结案？你也可以稍后在 action bar 里手动标记。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            稍后
          </Button>
          <Button onClick={onProceed}>
            <ArrowUpRightIcon className="size-4" />
            标记为已录用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
