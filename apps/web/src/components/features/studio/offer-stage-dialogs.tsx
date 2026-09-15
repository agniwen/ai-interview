"use client";

/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 接受后完成协商，后续继续背调与入职。

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
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
  initialBaseSalary?: number | null;
  onSaved: () => void;
}

export function CreateOrEditOfferDialog({
  open,
  onOpenChange,
  candidateId,
  mode,
  existingDraft,
  initialBaseSalary,
  onSaved,
}: OfferDialogProps) {
  const slug = useWorkspaceSlug();
  const [form, setForm] = useState<OfferFormState>(() =>
    mode === "edit" && existingDraft
      ? offerFormStateFromDraft(existingDraft)
      : createBlankOfferFormState(initialBaseSalary),
  );
  const setFormField = createOfferFormFieldSetter(setForm);

  useEffect(() => {
    if (!open) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- Each opening resets the draft form while keeping the animated dialog root mounted.
    setForm(
      mode === "edit" && existingDraft
        ? offerFormStateFromDraft(existingDraft)
        : createBlankOfferFormState(initialBaseSalary),
    );
  }, [existingDraft, initialBaseSalary, mode, open]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = buildOfferDraftPayload(form);
      if (mode === "edit" && existingDraft) {
        return patchOfferDraft(slug, candidateId, existingDraft.id, payload);
      }
      return createOfferDraft(slug, candidateId, payload);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
    onSuccess: () => {
      toast.success(saveSuccessMessage(mode, false));
      onSaved();
      onOpenChange(false);
    },
  });

  function handleSave() {
    mutation.mutate();
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "编辑 Offer 草稿" : "创建 Offer"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "草稿状态可编辑和删除。确认发布后内容将锁定。"
              : "先保存草稿，核对无误后再确认发布。"}
          </DialogDescription>
        </DialogHeader>

        <OfferDraftFormFields form={form} idPrefix="offer" onFieldChange={setFormField} />

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
}

export function RespondOfferDialog({
  draft,
  candidateId,
  onOpenChange,
  onResponded,
}: RespondDialogProps) {
  const slug = useWorkspaceSlug();
  const [response, setResponse] = useState<"accepted" | "declined" | "counter">("accepted");
  const [counter, setCounter] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    if (draft) {
      // oxlint-disable-next-line react/set-state-in-effect -- A new response target resets dialog-local fields without remounting the animated root.
      setResponse("accepted");
      setCounter("");
      setDeclineReason("");
    }
  }, [draft]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!draft) {
        throw new Error("missing draft");
      }
      return respondOfferDraft(slug, candidateId, draft.id, {
        candidateCounter: response === "counter" ? counter.trim() || null : null,
        declineReason: response === "declined" ? declineReason.trim() || null : null,
        response,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "记录失败"),
    onSuccess: (updated) => {
      onResponded();
      if (updated.status === "accepted") {
        toast.success("已接受 Offer，可进入背调");
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
          <DialogTitle>HR 手动记录 Offer 响应</DialogTitle>
          <DialogDescription>
            用于候选人无法在线操作等异常场景。接受后可进入背调。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <p className="text-sm">
              候选人回应{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </p>
            <RadioGroup
              aria-required="true"
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
          </div>

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
          {response === "declined" ? (
            <div className="grid gap-1.5">
              <Label className="text-sm" htmlFor="offer-decline-reason">
                拒绝原因（选填）
              </Label>
              <Textarea
                id="offer-decline-reason"
                maxLength={1000}
                onChange={(event) => setDeclineReason(event.target.value)}
                placeholder="记录候选人反馈，便于后续沟通"
                rows={3}
                value={declineReason}
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
