import type { Dispatch, SetStateAction } from "react";
import type { RecruitingMaterialMetadata } from "@app/shared/recruiting-materials";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RecruitingMaterialMetadataFields } from "./recruiting-material-metadata-fields";

interface PendingMaterial {
  file: File;
  metadata: RecruitingMaterialMetadata;
}
type EditableMaterial = { id: string; fileName: string } & RecruitingMaterialMetadata;
export function UploadMaterialsDialog({
  pendingFiles,
  setPendingFiles,
  busy,
  onSubmit,
  onClose,
}: {
  pendingFiles: PendingMaterial[];
  setPendingFiles: Dispatch<SetStateAction<PendingMaterial[]>>;
  busy: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={pendingFiles.length > 0}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
      title="上传流水附件"
      description="类型和备注均为选填，可直接上传。"
      dismissible={!busy}
      showCloseButton={!busy}
      footer={
        <Button disabled={busy} onClick={() => onSubmit()}>
          {busy ? "上传中…" : "确认上传"}
        </Button>
      }
    >
      <div className="divide-border divide-y">
        {pendingFiles.map(({ file, metadata }, index) => (
          <div key={`${file.name}-${index}`} className="space-y-4 py-4 first:pt-0 last:pb-0">
            <p className="text-sm font-medium break-all">{file.name}</p>
            <RecruitingMaterialMetadataFields
              value={metadata}
              disabled={busy}
              onChange={(value) =>
                setPendingFiles((pending) =>
                  pending.map((item) => (item.file === file ? { ...item, metadata: value } : item)),
                )
              }
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
export function EditMaterialDialog({
  editTarget,
  setEditTarget,
  busy,
  onSubmit,
  onClose,
}: {
  editTarget: EditableMaterial | null;
  setEditTarget: (value: EditableMaterial) => void;
  busy: boolean;
  onSubmit: (value: EditableMaterial) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={editTarget !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
      title="编辑附件信息"
      description={editTarget?.fileName}
      dismissible={!busy}
      showCloseButton={!busy}
      footer={
        <Button
          disabled={busy}
          onClick={() => {
            if (editTarget) {
              onSubmit(editTarget);
            }
          }}
        >
          {busy ? "保存中…" : "保存"}
        </Button>
      }
    >
      {editTarget ? (
        <RecruitingMaterialMetadataFields
          value={editTarget}
          disabled={busy}
          onChange={(value) => setEditTarget({ ...editTarget, ...value })}
        />
      ) : null}
    </Modal>
  );
}

export function DeleteMaterialDialog({
  deleteTarget,
  busy,
  onClose,
  onSubmit,
}: {
  deleteTarget: { id: string; fileName: string } | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (id: string) => void;
}) {
  return (
    <Modal
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
      title="删除附件"
      description={`确定删除“${deleteTarget?.fileName ?? ""}”？删除后无法恢复。`}
      footer={
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => {
            if (deleteTarget) {
              onSubmit(deleteTarget.id);
            }
          }}
        >
          确认删除
        </Button>
      }
    >
      <p className="text-muted-foreground text-sm">删除后可重新上传其他材料。</p>
    </Modal>
  );
}
