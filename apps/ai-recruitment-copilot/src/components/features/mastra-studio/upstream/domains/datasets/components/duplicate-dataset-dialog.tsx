"use client";
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
import { useMastraClient } from "@mastra/react";
import { useState, useEffect } from "react";
import { useDatasetMutations } from "../hooks/use-dataset-mutations";

export interface DuplicateDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDatasetId: string;
  sourceDatasetName: string;
  sourceDatasetDescription?: string;
  sourceDatasetTargetType?: string | null;
  onSuccess?: (datasetId: string) => void;
}

export function DuplicateDatasetDialog({
  open,
  onOpenChange,
  sourceDatasetId,
  sourceDatasetName,
  sourceDatasetDescription,
  sourceDatasetTargetType,
  onSuccess,
}: DuplicateDatasetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    phase: "idle" as "idle" | "fetching" | "creating" | "copying",
    total: 0,
  });

  const client = useMastraClient();
  const { createDataset, addItem } = useDatasetMutations();

  // Pre-populate name when dialog opens
  useEffect(() => {
    if (open) {
      setName(`${sourceDatasetName}（副本）`);
      setDescription(sourceDatasetDescription || "");
    }
  }, [open, sourceDatasetName, sourceDatasetDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("数据集名称为必填项");
      return;
    }

    setIsDuplicating(true);
    setProgress({ current: 0, phase: "fetching", total: 0 });

    try {
      // Fetch all items from source dataset
      const allItems: {
        input: unknown;
        groundTruth?: unknown;
        metadata?: Record<string, unknown>;
      }[] = [];
      let page = 0;
      const perPage = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await client.listDatasetItems(sourceDatasetId, { page, perPage });
        const items = response.items || [];
        allItems.push(
          ...items.map((item) => ({
            groundTruth: item.groundTruth,
            input: item.input,
            metadata: item.metadata as Record<string, unknown> | undefined,
          })),
        );

        setProgress({
          current: allItems.length,
          phase: "fetching",
          total: response.pagination?.total || allItems.length,
        });

        const totalFetched = (page + 1) * perPage;
        hasMore = items.length > 0 && totalFetched < (response.pagination?.total || 0);
        page += 1;
      }

      // Create the new dataset
      setProgress({ current: 0, phase: "creating", total: allItems.length });
      const dataset = await createDataset.mutateAsync({
        description: description.trim() || undefined,
        name: name.trim(),
        targetType: sourceDatasetTargetType ?? undefined,
      });

      // Copy items to new dataset
      setProgress({ current: 0, phase: "copying", total: allItems.length });
      for (let i = 0; i < allItems.length; i += 1) {
        const item = allItems[i];
        await addItem.mutateAsync({
          datasetId: dataset.id,
          groundTruth: item.groundTruth,
          input: item.input,
          metadata: item.metadata,
        });
        setProgress({ current: i + 1, phase: "copying", total: allItems.length });
      }

      toast.success(`数据集复制成功，包含 ${allItems.length} 个数据项`);

      // Reset form
      setName("");
      setDescription("");
      setIsDuplicating(false);
      setProgress({ current: 0, phase: "idle", total: 0 });
      onOpenChange(false);

      // Navigate to new dataset
      onSuccess?.(dataset.id);
    } catch (error) {
      toast.error(`复制数据集失败：${error instanceof Error ? error.message : "未知错误"}`);
      setIsDuplicating(false);
      setProgress({ current: 0, phase: "idle", total: 0 });
    }
  };

  const handleCancel = () => {
    if (isDuplicating) {
      return;
      // Prevent cancel during duplication
    }
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  const getProgressText = () => {
    switch (progress.phase) {
      case "fetching": {
        return `正在获取数据项：${progress.current}${progress.total > 0 ? ` / ${progress.total}` : ""}`;
      }
      case "creating": {
        return "正在创建数据集...";
      }
      case "copying": {
        return `正在复制数据项：${progress.current} / ${progress.total}`;
      }
      default: {
        return "";
      }
    }
  };

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={isDuplicating ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>复制数据集</DialogTitle>
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
                disabled={isDuplicating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataset-description">描述</Label>
              <Input
                id="dataset-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入数据集描述（可选）"
                disabled={isDuplicating}
              />
            </div>

            <p className="text-sm text-muted-foreground">
              将把“{sourceDatasetName}”中的所有数据项复制到新数据集
            </p>

            {isDuplicating && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{getProgressText()}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" onClick={handleCancel} disabled={isDuplicating}>
                取消
              </Button>
              <Button type="submit" variant="primary" disabled={isDuplicating || !name.trim()}>
                {isDuplicating ? "正在复制..." : "复制数据集"}
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
