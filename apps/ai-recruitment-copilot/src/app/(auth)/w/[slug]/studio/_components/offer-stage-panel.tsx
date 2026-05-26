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
  HandshakeIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { offerDraftStatusMeta } from "@arc/db-schema/studio-interviews";
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
  disabled?: boolean;
  // 父级在「候选人接受 Offer」二次确认后，开「标记结案 + outcome=hired」dialog。
  // Parent opens the close dialog with outcome=hired after this fires.
  onRequestCloseAsHired?: () => void;
}

export function OfferStagePanel({
  candidateId,
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
  const [editTarget, setEditTarget] = useState<OfferDraftRecord | null>(null);
  const [respondTarget, setRespondTarget] = useState<OfferDraftRecord | null>(null);
  const [acceptedConfirm, setAcceptedConfirm] = useState<OfferDraftRecord | null>(null);

  function renderDraftsContent() {
    if (isLoading) {
      return (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-center text-muted-foreground text-sm">
          加载中…
        </div>
      );
    }

    if (drafts.length === 0) {
      return (
        <Empty className="border-border/60">
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
            candidateId={candidateId}
            disabled={disabled}
            draft={draft}
            key={draft.id}
            onCancelled={invalidateDrafts}
            onEdit={() => setEditTarget(draft)}
            onRespond={() => setRespondTarget(draft)}
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
        candidateId={candidateId}
        existingDraft={editTarget}
        mode={editTarget ? "edit" : "create"}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
        onSaved={invalidateDrafts}
        open={createOpen || editTarget !== null}
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
      <div className="rounded-lg border border-border/60 bg-card p-4">
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
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-medium text-sm">候选人期望</h4>
          <p className="text-muted-foreground text-xs">发 Offer 前先收集候选人期望，做议价参考。</p>
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
    </div>
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
  disabled,
  onEdit,
  onSent,
  onRespond,
  onCancelled,
}: {
  draft: OfferDraftRecord;
  candidateId: string;
  disabled?: boolean;
  onEdit: () => void;
  onSent: () => void;
  onRespond: () => void;
  onCancelled: () => void;
}) {
  const slug = useWorkspaceSlug();
  const meta = offerDraftStatusMeta[draft.status];
  const sendMutation = useMutation({
    mutationFn: () => sendOfferDraft(slug, candidateId, draft.id),
    onError: (e) => toast.error(e instanceof Error ? e.message : "发送失败"),
    onSuccess: () => {
      toast.success("Offer 已发送");
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

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              v{draft.version} · {draft.position}
            </span>
            <Badge variant={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
            <span>
              Base：
              <span className="font-medium text-foreground">
                ¥ {draft.baseSalary.toLocaleString()}
              </span>
              {draft.bonus ? ` · 奖金 ¥ ${draft.bonus.toLocaleString()}` : ""}
            </span>
            {draft.equity ? <span>期权：{draft.equity}</span> : null}
            {draft.joiningDate ? <span>预计入职：{formatDate(draft.joiningDate)}</span> : null}
            {draft.sentAt ? <span>发送于：{formatDate(draft.sentAt)}</span> : null}
            {draft.expiresAt ? <span>有效期至：{formatDate(draft.expiresAt)}</span> : null}
          </div>
          {draft.candidateCounter ? (
            <p className="rounded bg-muted/40 px-2 py-1 text-foreground/90 text-xs">
              <span className="text-muted-foreground">候选人议价：</span>
              {draft.candidateCounter}
            </p>
          ) : null}
          {draft.notes ? (
            <p className="text-muted-foreground text-xs">备注：{draft.notes}</p>
          ) : null}
        </div>
        {disabled ? null : (
          <OfferCardActions
            cancelMutation={cancelMutation}
            draft={draft}
            onEdit={onEdit}
            onRespond={onRespond}
            sendMutation={sendMutation}
          />
        )}
      </div>
    </div>
  );
}

function OfferCardActions({
  draft,
  onEdit,
  onRespond,
  sendMutation,
  cancelMutation,
}: {
  draft: OfferDraftRecord;
  onEdit: () => void;
  onRespond: () => void;
  sendMutation: { mutate: () => void; isPending: boolean };
  cancelMutation: { mutate: () => void; isPending: boolean };
}) {
  if (draft.status === "draft") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={onEdit} size="sm" variant="ghost">
          <PencilIcon className="size-4" />
          编辑
        </Button>
        <Button disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()} size="sm">
          <SendIcon className="size-4" />
          发送
        </Button>
      </div>
    );
  }
  if (draft.status === "sent") {
    return (
      <div className="flex flex-wrap gap-2">
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

// ── 新建 / 编辑 Offer dialog ──
// Create-or-edit dialog.

interface OfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  mode: "create" | "edit";
  existingDraft?: OfferDraftRecord | null;
  onSaved: () => void;
}

function CreateOrEditOfferDialog({
  open,
  onOpenChange,
  candidateId,
  mode,
  existingDraft,
  onSaved,
}: OfferDialogProps) {
  const slug = useWorkspaceSlug();
  const [position, setPosition] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [bonus, setBonus] = useState("");
  const [equity, setEquity] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [sendImmediately, setSendImmediately] = useState(false);

  // 编辑模式打开时同步现值；新建模式打开时清空。
  // Sync form on open: prefill in edit mode, blank in create mode.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === "edit" && existingDraft) {
      setPosition(existingDraft.position);
      setBaseSalary(String(existingDraft.baseSalary));
      setBonus(existingDraft.bonus ? String(existingDraft.bonus) : "");
      setEquity(existingDraft.equity ?? "");
      setJoiningDate(existingDraft.joiningDate ? existingDraft.joiningDate.slice(0, 10) : "");
      setExpiresAt(existingDraft.expiresAt ? existingDraft.expiresAt.slice(0, 10) : "");
      setNotes(existingDraft.notes ?? "");
      setSendImmediately(false);
    } else {
      setPosition("");
      setBaseSalary("");
      setBonus("");
      setEquity("");
      setJoiningDate("");
      setExpiresAt("");
      setNotes("");
      setSendImmediately(false);
    }
  }, [open, mode, existingDraft]);

  const mutation = useMutation({
    mutationFn: () => {
      const parsedBase = Number(baseSalary);
      if (Number.isNaN(parsedBase) || parsedBase <= 0) {
        throw new Error("Base salary 需为正整数");
      }
      const parsedBonus = bonus === "" ? null : Number(bonus);
      if (parsedBonus !== null && (Number.isNaN(parsedBonus) || parsedBonus < 0)) {
        throw new Error("奖金需为非负整数");
      }
      const payload = {
        baseSalary: parsedBase,
        bonus: parsedBonus,
        equity: equity.trim() || null,
        expiresAt: expiresAt || null,
        joiningDate: joiningDate || null,
        notes: notes.trim() || null,
        position: position.trim(),
      };
      if (mode === "edit" && existingDraft) {
        return patchOfferDraft(slug, candidateId, existingDraft.id, payload);
      }
      return createOfferDraft(slug, candidateId, { ...payload, sendImmediately });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
    onSuccess: () => {
      toast.success(saveSuccessMessage(mode, sendImmediately));
      onSaved();
      onOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "编辑 Offer 草稿" : "新建 Offer"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "草稿状态可编辑。发送后请用「记录响应」/「撤回」操作。"
              : "新建版本会自动 supersede 已发出未结的旧版本。"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-sm" htmlFor="offer-position">
              职位
            </Label>
            <Input
              id="offer-position"
              maxLength={200}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="例如 高级前端工程师（L4）"
              value={position}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="offer-base">
              Base 月薪 (¥)
            </Label>
            <Input
              id="offer-base"
              inputMode="numeric"
              min={0}
              onChange={(e) => setBaseSalary(e.target.value)}
              type="number"
              value={baseSalary}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="offer-bonus">
              年度奖金 (¥，可选)
            </Label>
            <Input
              id="offer-bonus"
              inputMode="numeric"
              min={0}
              onChange={(e) => setBonus(e.target.value)}
              type="number"
              value={bonus}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-sm" htmlFor="offer-equity">
              期权 / 股票（可选，自由文本）
            </Label>
            <Input
              id="offer-equity"
              maxLength={500}
              onChange={(e) => setEquity(e.target.value)}
              placeholder="如 0.1% / 4 年 vest"
              value={equity}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="offer-joining">
              预计入职日（可选）
            </Label>
            <Input
              id="offer-joining"
              onChange={(e) => setJoiningDate(e.target.value)}
              type="date"
              value={joiningDate}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="offer-expires">
              Offer 有效期至（可选）
            </Label>
            <Input
              id="offer-expires"
              onChange={(e) => setExpiresAt(e.target.value)}
              type="date"
              value={expiresAt}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-sm" htmlFor="offer-notes">
              备注（可选）
            </Label>
            <Textarea
              id="offer-notes"
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              value={notes}
            />
          </div>
          {mode === "create" ? (
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
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
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={mutation.isPending || !position.trim() || !baseSalary}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
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
