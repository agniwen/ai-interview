"use client";

import type { DatasetItem, DatasetRecord } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import { Label } from "@mastra/playground-ui/components/Label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@mastra/playground-ui/components/Select";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useState } from "react";
import { useDatasetMutations } from "../hooks/use-dataset-mutations";
import { useDatasets } from "../hooks/use-datasets";

export interface AddItemsToDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DatasetItem[];
  currentDatasetId: string;
  onSuccess?: (datasetId: string) => void;
}

export function AddItemsToDatasetDialog({
  open,
  onOpenChange,
  items,
  currentDatasetId,
  onSuccess,
}: AddItemsToDatasetDialogProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);
  const [progress, setProgress] = useState(0);

  const { data, isLoading: isDatasetsLoading } = useDatasets();
  const { addItem } = useDatasetMutations();

  // Extract datasets array from response
  const datasets: DatasetRecord[] =
    (data as { datasets: DatasetRecord[] } | undefined)?.datasets ?? [];

  // Filter out the current dataset from the list
  const availableDatasets = datasets.filter((d: DatasetRecord) => d.id !== currentDatasetId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDatasetId) {
      toast.error("请选择数据集");
      return;
    }

    setIsAdding(true);
    setProgress(0);

    try {
      // Add items to selected dataset
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        await addItem.mutateAsync({
          datasetId: selectedDatasetId,
          groundTruth: item.groundTruth,
          input: item.input,
          metadata: item.metadata as Record<string, unknown> | undefined,
        });
        setProgress(i + 1);
      }

      const targetDataset = datasets.find((d: DatasetRecord) => d.id === selectedDatasetId);
      toast.success(`已将 ${items.length} 个数据项添加到“${targetDataset?.name}”`);

      // Reset form
      setSelectedDatasetId("");
      setIsAdding(false);
      setProgress(0);
      onOpenChange(false);

      onSuccess?.(selectedDatasetId);
    } catch (error) {
      toast.error(`添加数据项失败：${error instanceof Error ? error.message : "未知错误"}`);
      setIsAdding(false);
      setProgress(0);
    }
  };

  const handleCancel = () => {
    if (isAdding) {
      return;
      // Prevent cancel during operation
    }
    setSelectedDatasetId("");
    onOpenChange(false);
  };

  const progressPercent = items.length > 0 ? (progress / items.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={isAdding ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>向数据集添加数据项</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-dataset">目标数据集 *</Label>
              <Select
                value={selectedDatasetId}
                onValueChange={setSelectedDatasetId}
                disabled={isAdding || isDatasetsLoading}
              >
                <SelectTrigger id="target-dataset">
                  <SelectValue
                    placeholder={isDatasetsLoading ? "正在加载数据集..." : "选择数据集"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableDatasets.length === 0 ? (
                    <div className="px-2 py-4 text-sm text-neutral4 text-center">
                      暂无其他可用数据集
                    </div>
                  ) : (
                    availableDatasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <p className="text-sm text-muted-foreground">
              将把 {items.length} 个数据项复制到所选数据集
            </p>

            {isAdding && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  正在添加数据项： {progress} / {items.length}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" onClick={handleCancel} disabled={isAdding}>
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isAdding || !selectedDatasetId || availableDatasets.length === 0}
              >
                {isAdding ? `正在添加...（${progress}/${items.length}）` : "添加数据项"}
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
