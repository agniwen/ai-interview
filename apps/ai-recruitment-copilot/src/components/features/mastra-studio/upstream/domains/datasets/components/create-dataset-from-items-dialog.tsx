"use client";

import type { DatasetItem } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useState } from "react";
import { useDatasetMutations } from "../hooks/use-dataset-mutations";

export interface CreateDatasetFromItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DatasetItem[];
  onSuccess?: (datasetId: string) => void;
}

export function CreateDatasetFromItemsDialog({
  open,
  onOpenChange,
  items,
  onSuccess,
}: CreateDatasetFromItemsDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const { createDataset, addItem } = useDatasetMutations();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("数据集名称为必填项");
      return;
    }

    setIsCreating(true);
    setProgress(0);

    try {
      // Create the dataset
      const dataset = (await createDataset.mutateAsync({
        description: description.trim() || undefined,
        name: name.trim(),
      })) as { id: string };

      // Copy items to new dataset
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        await addItem.mutateAsync({
          datasetId: dataset.id,
          expectedTrajectory: item.expectedTrajectory,
          groundTruth: item.groundTruth,
          input: item.input,
          metadata: item.metadata as Record<string, unknown> | undefined,
          requestContext: item.requestContext,
          toolMocks: item.toolMocks,
        });
        setProgress(i + 1);
      }

      toast.success(`数据集已创建，包含 ${items.length} 个数据项`);

      // Reset form
      setName("");
      setDescription("");
      setIsCreating(false);
      setProgress(0);
      onOpenChange(false);

      // Navigate to new dataset
      onSuccess?.(dataset.id);
    } catch (error) {
      toast.error(`创建数据集失败：${error instanceof Error ? error.message : "未知错误"}`);
      setIsCreating(false);
      setProgress(0);
    }
  };

  const handleCancel = () => {
    if (isCreating) {
      return;
      // Prevent cancel during creation
    }
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  const progressPercent = items.length > 0 ? (progress / items.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={isCreating ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>从数据项创建数据集</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dataset-name">名称 *</Label>
              <Input
                id="dataset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入数据集名称"
                autoFocus
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataset-description">描述</Label>
              <Input
                id="dataset-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入数据集描述（可选）"
                disabled={isCreating}
              />
            </div>

            <p className="text-sm text-muted-foreground">
              将把 {items.length} 个数据项复制到新数据集
            </p>

            {isCreating && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  正在复制数据项： {progress} / {items.length}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" onClick={handleCancel} disabled={isCreating}>
                取消
              </Button>
              <Button type="submit" variant="primary" disabled={isCreating || !name.trim()}>
                {isCreating ? `正在创建...（${progress}/${items.length}）` : "创建数据集"}
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
