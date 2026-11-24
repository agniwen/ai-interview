import { useId, useState } from "react";
import { updateCandidateMaterialSchema } from "@app/shared/candidate-materials";
import type {
  CandidateMaterialItem,
  UpdateCandidateMaterialInput,
} from "@app/shared/candidate-materials";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

interface EditDraft {
  notes: string;
  title: string;
  url: string;
}

function resolveEditDraft(
  item: CandidateMaterialItem | null,
  draftState: { itemId: string; draft: EditDraft } | null,
): EditDraft | null {
  if (!item) {
    return null;
  }
  if (draftState?.itemId === item.id) {
    return draftState.draft;
  }
  return {
    notes: item.notes,
    title: item.title,
    url: item.url ?? "",
  };
}

export function EditCandidateMaterialDialog({
  busy,
  item,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  item: CandidateMaterialItem | null;
  onClose: () => void;
  onSubmit: (materialId: string, patch: UpdateCandidateMaterialInput) => Promise<void> | void;
}) {
  const id = useId();
  const [draftState, setDraftState] = useState<{ itemId: string; draft: EditDraft } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draft = resolveEditDraft(item, draftState);

  function updateDraft(patch: Partial<EditDraft>) {
    if (!item || !draft) {
      return;
    }
    setError(null);
    setDraftState({
      draft: { ...draft, ...patch },
      itemId: item.id,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!item || !draft) {
      return;
    }
    const payload: UpdateCandidateMaterialInput = {
      notes: draft.notes,
      title: draft.title,
    };
    if (item.kind === "link") {
      payload.url = draft.url;
    }
    const parsed = updateCandidateMaterialSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "请检查修改内容");
      return;
    }
    setError(null);
    try {
      await onSubmit(item.id, parsed.data);
      setDraftState(null);
    } catch {
      // Mutation error toast is handled by the caller; keep the draft intact.
    }
  }

  return (
    <Modal
      open={item !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) {
          setDraftState(null);
          setError(null);
          onClose();
        }
      }}
      title="编辑补充资料"
      description={item?.fileName ?? item?.url ?? undefined}
      dismissible={!busy}
      showCloseButton={!busy}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDraftState(null);
              setError(null);
              onClose();
            }}
          >
            取消
          </Button>
          <Button type="submit" form={`${id}-edit-form`} disabled={busy || !draft}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </div>
      }
    >
      {item && draft ? (
        <form
          id={`${id}-edit-form`}
          className="space-y-4"
          onSubmit={(event) => handleSubmit(event)}
        >
          <FieldGroup>
            <Field data-invalid={error ? "true" : undefined}>
              <FieldLabel htmlFor={`${id}-edit-title`}>标题</FieldLabel>
              <Input
                id={`${id}-edit-title`}
                required
                disabled={busy}
                maxLength={200}
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
            </Field>
            {item.kind === "link" ? (
              <Field data-invalid={error ? "true" : undefined}>
                <FieldLabel htmlFor={`${id}-edit-url`}>链接地址</FieldLabel>
                <Input
                  id={`${id}-edit-url`}
                  type="url"
                  required
                  disabled={busy}
                  value={draft.url}
                  onChange={(event) => updateDraft({ url: event.target.value })}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`${id}-edit-notes`}>说明</FieldLabel>
              <Textarea
                id={`${id}-edit-notes`}
                rows={3}
                className="field-sizing-fixed resize-none"
                disabled={busy}
                maxLength={500}
                placeholder="填写资料说明（选填）"
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}

export function DeleteCandidateMaterialDialog({
  busy,
  item,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  item: CandidateMaterialItem | null;
  onClose: () => void;
  onConfirm: (materialId: string) => void;
}) {
  return (
    <AlertDialog
      open={item !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除补充资料</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除“{item?.title ?? ""}”？删除后将从当前记录移除，无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            variant="destructive"
            onClick={() => {
              if (item) {
                onConfirm(item.id);
              }
            }}
          >
            {busy ? "删除中…" : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
