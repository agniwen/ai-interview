"use client";

import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useDatasetMutations } from "../hooks/use-dataset-mutations";

export interface DeleteDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetId: string;
  datasetName: string;
  onSuccess?: () => void;
}

export function DeleteDatasetDialog({
  open,
  onOpenChange,
  datasetId,
  datasetName,
  onSuccess,
}: DeleteDatasetDialogProps) {
  const { deleteDataset } = useDatasetMutations();

  const handleDelete = async () => {
    try {
      await deleteDataset.mutateAsync(datasetId);
      toast.success("数据集删除成功");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(`删除数据集失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>删除数据集</AlertDialog.Title>
          <AlertDialog.Description>
            确定要删除“{datasetName}
            ”吗？这将永久删除该数据集、其中的所有数据项和运行记录，且无法撤销。
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Action onClick={handleDelete} disabled={deleteDataset.isPending}>
            {deleteDataset.isPending ? "正在删除..." : "删除"}
          </AlertDialog.Action>
          <AlertDialog.Cancel>取消</AlertDialog.Cancel>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
