"use client";
import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import { SelectFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useState } from "react";
import { useDatasetMutations } from "../hooks/use-dataset-mutations";
import { SchemaConfigSection } from "./schema-config-section";
import type { DatasetTargetType } from "./target-type-options";
import { DATASET_TARGET_TYPE_OPTIONS } from "./target-type-options";

export interface CreateDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (datasetId: string) => void;
  /** If provided, auto-attaches the dataset to this target on create */
  targetType?: DatasetTargetType;
  targetIds?: string[];
}

export function CreateDatasetDialog({
  open,
  onOpenChange,
  onSuccess,
  targetType,
  targetIds,
}: CreateDatasetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inputSchema, setInputSchema] = useState<Record<string, unknown> | null>(null);
  const [groundTruthSchema, setGroundTruthSchema] = useState<Record<string, unknown> | null>(null);
  const [requestContextSchema, setRequestContextSchema] = useState<Record<string, unknown> | null>(
    null,
  );
  const [showCustomSchema, setShowCustomSchema] = useState(!targetType);
  // Only relevant for the generic (non-scoped) create. When the dialog is opened from an agent/
  // workflow context, `targetType` is supplied via props and this picker is hidden.
  const [selectedTargetType, setSelectedTargetType] = useState<DatasetTargetType | "">("");
  const { createDataset } = useDatasetMutations();

  // Props win when the dialog is pre-scoped to a target; otherwise use the user's pick (if any).
  const isPreScoped = Boolean(targetType);
  const effectiveTargetType = targetType ?? (selectedTargetType || undefined);

  const handleSchemaChange = (schemas: {
    inputSchema: Record<string, unknown> | null;
    outputSchema: Record<string, unknown> | null;
    requestContextSchema: Record<string, unknown> | null;
  }) => {
    setInputSchema(schemas.inputSchema);
    setGroundTruthSchema(schemas.outputSchema);
    setRequestContextSchema(schemas.requestContextSchema);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("数据集名称为必填项");
      return;
    }

    try {
      const result = (await createDataset.mutateAsync({
        description: description.trim() || undefined,
        groundTruthSchema,
        inputSchema,
        name: name.trim(),
        requestContextSchema,
        targetIds,
        targetType: effectiveTargetType,
      })) as { id: string };

      toast.success("数据集创建成功");

      // Reset form
      setName("");
      setDescription("");
      setInputSchema(null);
      setGroundTruthSchema(null);
      setRequestContextSchema(null);
      setSelectedTargetType("");
      setShowCustomSchema(!targetType);
      onOpenChange(false);

      // Navigate to new dataset
      onSuccess?.(result.id);
    } catch (error) {
      toast.error(`创建数据集失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const handleCancel = () => {
    setName("");
    setDescription("");
    setInputSchema(null);
    setGroundTruthSchema(null);
    setRequestContextSchema(null);
    setSelectedTargetType("");
    setShowCustomSchema(!targetType);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>创建数据集</DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dataset-name">名称 *</Label>
              <Input
                id="dataset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入数据集名称"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataset-description">描述</Label>
              <Input
                id="dataset-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入数据集描述（可选）"
              />
            </div>

            {!isPreScoped && (
              <SelectFieldBlock
                label="目标类型"
                name="dataset-target-type"
                placeholder="选择目标类型（可选）"
                options={[...DATASET_TARGET_TYPE_OPTIONS]}
                value={selectedTargetType}
                onValueChange={(value) => setSelectedTargetType(value as DatasetTargetType)}
                helpText="此数据集的评估对象，将用于目标列和目标筛选。"
                disabled={createDataset.isPending}
              />
            )}

            {targetType && !showCustomSchema ? (
              <button
                type="button"
                className="text-xs text-neutral3 hover:text-accent1 transition-colors"
                onClick={() => setShowCustomSchema(true)}
              >
                + 自定义 Schema
              </button>
            ) : (
              <SchemaConfigSection
                inputSchema={inputSchema}
                outputSchema={groundTruthSchema}
                requestContextSchema={requestContextSchema}
                onChange={handleSchemaChange}
                disabled={createDataset.isPending}
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" onClick={handleCancel}>
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={createDataset.isPending || !name.trim()}
              >
                {createDataset.isPending ? "正在创建..." : "创建数据集"}
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
