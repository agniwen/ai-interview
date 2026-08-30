"use client";

import { IconArrowUpRight } from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 阶段的详情面板内容：
//   - 顶部：候选人期望（薪资 / 现 base / 期望入职日）—— 可编辑，partial merge
//   - 下方：Offer 草稿版本时间线（version desc）
//   - 新建 Offer / 编辑 draft / 发送 / 记录响应 / 撤回
//   - 候选人接受 Offer 时弹二次确认，请上层走「标记结束 hired」流程
//
// Offer-stage panel: candidate expectations inline form + offer draft
// timeline. Draft → sent → respond / cancel flows; on "accepted" we prompt
// the caller to launch the close flow.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { OfferDraftRecord } from "@arc/shared/studio-pipeline-stages";
import { createOfferDraft, patchOfferDraft, respondOfferDraft } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { SendOfferConfirmDialog } from "./offer-stage-cards";
import {
  OfferDraftFormFields,
  buildOfferDraftPayload,
  createBlankOfferFormState,
  createOfferFormFieldSetter,
  offerFormStateFromDraft,
  offerResponseLabel,
  saveSuccessMessage,
} from "./offer-stage-form";
import type { OfferFormState } from "./offer-stage-form";

const offerResponseSchema = z.enum(["accepted", "counter", "declined"]);

interface OfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateEmail: string | null;
  mode: "create" | "edit";
  existingDraft?: OfferDraftRecord | null;
  onSaved: () => void;
}

export function CreateOrEditOfferDialog({
  open,
  onOpenChange,
  candidateId,
  candidateEmail,
  mode,
  existingDraft,
  onSaved,
}: OfferDialogProps) {
  const slug = useWorkspaceSlug();
  const [form, setForm] = useState<OfferFormState>(() =>
    mode === "edit" && existingDraft
      ? offerFormStateFromDraft(existingDraft)
      : createBlankOfferFormState(),
  );
  const setFormField = createOfferFormFieldSetter(setForm);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSendConfirmOpen(false);
    }
    onOpenChange(next);
  }

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
          <DialogTitle>{mode === "edit" ? "编辑 Offer 草稿" : "创建 Offer"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "草稿状态可编辑。发送后请用「记录响应」/「撤回」操作。"
              : "创建版本会替换尚未结束的已发出版本。"}
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

export function RespondOfferDialog({
  draft,
  candidateId,
  onOpenChange,
  onResponded,
  onAccepted,
}: RespondDialogProps) {
  const slug = useWorkspaceSlug();
  const [response, setResponse] = useState<"accepted" | "declined" | "counter">("accepted");
  const [counter, setCounter] = useState("");

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
        // 接受 Offer：让上层弹「标记结束 + outcome=hired」二次确认。
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
            候选人接受 → 建议结束为「已录用」；候选人议价 → 当前版本保持已发出，后续创建版本响应。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup
            className="grid gap-2"
            onValueChange={(value) => {
              const result = offerResponseSchema.safeParse(value);
              if (result.success) {
                setResponse(result.data);
              }
            }}
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

export function AcceptedConfirmDialog({
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
            是否立刻标记为「已录用」并结束？你也可以稍后在 action bar 里手动标记。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            稍后
          </Button>
          <Button onClick={onProceed}>
            <IconArrowUpRight className="size-4" />
            标记为已录用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
