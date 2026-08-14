"use client";

import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import { Label } from "@mastra/playground-ui/components/Label";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { toast } from "@mastra/playground-ui/utils/toast";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  Loader2Icon,
  TrashIcon,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";

export interface BulkTraceItem {
  input: string;
  groundTruth: string;
  expectedTrajectory: string;
  source?: { type: "trace"; referenceId: string };
}

interface BulkTraceReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  datasetName: string;
  initialItems: BulkTraceItem[];
}

export function BulkTraceReviewDialog({
  isOpen,
  onClose,
  datasetId,
  datasetName,
  initialItems,
}: BulkTraceReviewDialogProps) {
  const [items, setItems] = useState<BulkTraceItem[]>(initialItems);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { batchInsertItems } = useDatasetMutations();

  // Reset state when dialog opens with new items
  useEffect(() => {
    if (isOpen) {
      setItems(initialItems);
      setCurrentIndex(0);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- only reset on open, not on initialItems change

  const currentItem = items[currentIndex];
  const total = items.length;

  const updateCurrentItem = useCallback(
    (field: keyof BulkTraceItem, value: string) => {
      setItems((prev) =>
        prev.map((item, i) => (i === currentIndex ? { ...item, [field]: value } : item)),
      );
    },
    [currentIndex],
  );

  const removeCurrentItem = useCallback(() => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== currentIndex);
      if (next.length === 0) {
        onClose();
        return prev;
      }
      setCurrentIndex((idx) => Math.min(idx, next.length - 1));
      return next;
    });
  }, [currentIndex, onClose]);

  const handleSubmit = async () => {
    const parsed = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(item.input);
      } catch {
        toast.error(`第 ${i + 1} 个数据项：输入必须是有效的 JSON`);
        setCurrentIndex(i);
        return;
      }

      let parsedGroundTruth: unknown | undefined;
      if (item.groundTruth.trim()) {
        try {
          parsedGroundTruth = JSON.parse(item.groundTruth);
        } catch {
          toast.error(`第 ${i + 1} 个数据项：标准答案必须是有效的 JSON`);
          setCurrentIndex(i);
          return;
        }
      }

      let parsedTrajectory: unknown | undefined;
      if (item.expectedTrajectory.trim()) {
        try {
          parsedTrajectory = JSON.parse(item.expectedTrajectory);
        } catch {
          toast.error(`第 ${i + 1} 个数据项：预期轨迹必须是有效的 JSON`);
          setCurrentIndex(i);
          return;
        }
      }

      parsed.push({
        expectedTrajectory: parsedTrajectory,
        groundTruth: parsedGroundTruth,
        input: parsedInput,
        ...(item.source ? { source: item.source } : {}),
      });
    }

    try {
      await batchInsertItems.mutateAsync({ datasetId, items: parsed });
      toast.success(`已将 ${parsed.length} 个数据项添加到“${datasetName}”`);
      onClose();
    } catch {
      toast.error("向数据集添加数据项失败");
    }
  };

  if (!currentItem) {
    return null;
  }

  return (
    <SideDialog
      dialogTitle="添加到数据集前确认数据项"
      dialogDescription={`正在确认要添加到数据集“${datasetName}”的 ${total} 个数据项`}
      isOpen={isOpen}
      onClose={onClose}
      level={1}
    >
      <SideDialog.Top>
        <DatabaseIcon className="size-4" /> 确认 {total} 个数据项 → {datasetName}
      </SideDialog.Top>

      <SideDialog.Content>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              tooltip="上一个数据项"
              variant="outline"
              size="icon-sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => prev - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Txt variant="ui-sm" className="text-icon3 tabular-nums">
              {currentIndex + 1} / {total}
            </Txt>
            <Button
              tooltip="下一个数据项"
              variant="outline"
              size="icon-sm"
              disabled={currentIndex === total - 1}
              onClick={() => setCurrentIndex((prev) => prev + 1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>

          <Button tooltip="移除此数据项" variant="ghost" size="icon-sm" onClick={removeCurrentItem}>
            <TrashIcon />
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>输入（JSON）*</Label>
            <CodeEditor
              value={currentItem.input}
              onChange={(v: string | undefined) => updateCurrentItem("input", v ?? "")}
              showCopyButton={false}
              className="min-h-[120px]"
            />
          </div>

          <div className="grid gap-2">
            <Label>标准答案（JSON，可选）</Label>
            <CodeEditor
              value={currentItem.groundTruth}
              onChange={(v: string | undefined) => updateCurrentItem("groundTruth", v ?? "")}
              showCopyButton={false}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid gap-2">
            <Label>预期轨迹（JSON，可选）</Label>
            <CodeEditor
              value={currentItem.expectedTrajectory}
              onChange={(v: string | undefined) => updateCurrentItem("expectedTrajectory", v ?? "")}
              showCopyButton={false}
              className="min-h-[80px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button variant="default" disabled={batchInsertItems.isPending} onClick={handleSubmit}>
              {batchInsertItems.isPending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  正在添加...
                </>
              ) : (
                <>
                  <DatabaseIcon className="size-4" />
                  全部添加 {total} 个数据项
                </>
              )}
            </Button>
          </div>
        </div>
      </SideDialog.Content>
    </SideDialog>
  );
}
