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
import { useReducer } from "react";
import { useDatasetMutations } from "../hooks/use-dataset-mutations";
import { SchemaConfigSection } from "./schema-config-section";
import type { DatasetTargetType } from "./target-type-options";
import { DATASET_TARGET_TYPE_OPTIONS, isDatasetTargetType } from "./target-type-options";

export interface EditDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: {
    id: string;
    name: string;
    description?: string;
    targetType?: string | null;
    inputSchema?: Record<string, unknown> | null;
    groundTruthSchema?: Record<string, unknown> | null;
    requestContextSchema?: Record<string, unknown> | null;
  };
  onSuccess?: () => void;
}

type EditDatasetDialogFormProps = Omit<EditDatasetDialogProps, "open">;
type Dataset = EditDatasetDialogProps["dataset"];
type SchemaValue = Record<string, unknown> | null;

interface EditDatasetFormState {
  name: string;
  description: string;
  targetType: DatasetTargetType | "";
  inputSchema: SchemaValue;
  groundTruthSchema: SchemaValue;
  requestContextSchema: SchemaValue;
  validationError: string | null;
}

type EditDatasetFormAction =
  | { type: "setStringField"; field: "name" | "description"; value: string }
  | { type: "setTargetType"; value: DatasetTargetType | "" }
  | {
      type: "setSchemas";
      inputSchema: SchemaValue;
      groundTruthSchema: SchemaValue;
      requestContextSchema: SchemaValue;
    }
  | { type: "setValidationError"; validationError: string | null };

function getInitialFormState(dataset: Dataset): EditDatasetFormState {
  return {
    description: dataset.description ?? "",
    groundTruthSchema: dataset.groundTruthSchema ?? null,
    inputSchema: dataset.inputSchema ?? null,
    name: dataset.name,
    requestContextSchema: dataset.requestContextSchema ?? null,
    targetType: isDatasetTargetType(dataset.targetType) ? dataset.targetType : "",
    validationError: null,
  };
}

function editDatasetFormReducer(
  state: EditDatasetFormState,
  action: EditDatasetFormAction,
): EditDatasetFormState {
  switch (action.type) {
    case "setStringField": {
      return { ...state, [action.field]: action.value };
    }
    case "setTargetType": {
      return { ...state, targetType: action.value };
    }
    case "setSchemas": {
      return {
        ...state,
        groundTruthSchema: action.groundTruthSchema,
        inputSchema: action.inputSchema,
        requestContextSchema: action.requestContextSchema,
        validationError: null,
      };
    }
    case "setValidationError": {
      return { ...state, validationError: action.validationError };
    }
    default: {
      return state;
    }
  }
}

function EditDatasetDialogForm({ onOpenChange, dataset, onSuccess }: EditDatasetDialogFormProps) {
  const [formState, dispatch] = useReducer(editDatasetFormReducer, dataset, getInitialFormState);
  const { updateDataset } = useDatasetMutations();

  const handleSchemaChange = (schemas: {
    inputSchema: Record<string, unknown> | null;
    outputSchema: Record<string, unknown> | null;
    requestContextSchema: Record<string, unknown> | null;
  }) => {
    dispatch({
      groundTruthSchema: schemas.outputSchema,
      inputSchema: schemas.inputSchema,
      requestContextSchema: schemas.requestContextSchema,
      type: "setSchemas",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: "setValidationError", validationError: null });

    if (!formState.name.trim()) {
      toast.error("数据集名称为必填项");
      return;
    }

    try {
      await updateDataset.mutateAsync({
        datasetId: dataset.id,
        description: formState.description.trim() || undefined,
        groundTruthSchema: formState.groundTruthSchema,
        inputSchema: formState.inputSchema,
        name: formState.name.trim(),
        requestContextSchema: formState.requestContextSchema,
        targetType: formState.targetType || undefined,
      });

      toast.success("数据集更新成功");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      // Handle validation errors (existing items may fail new schema)
      // MastraClientError stores the parsed response body in `body`
      const body = (error as { body?: { cause?: { failingItems?: unknown[] } } })?.body;
      if (Array.isArray(body?.cause?.failingItems) && body.cause.failingItems.length > 0) {
        const count = body.cause.failingItems.length;
        dispatch({
          type: "setValidationError",
          validationError: `${count} 个现有数据项验证失败，请修复数据项或调整 Schema。`,
        });
      } else {
        const requestError = error as { message?: string };
        toast.error(`更新数据集失败：${requestError.message || "未知错误"}`);
      }
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>编辑数据集</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[70vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-dataset-name">名称 *</Label>
            <Input
              id="edit-dataset-name"
              value={formState.name}
              onChange={(e) =>
                dispatch({ field: "name", type: "setStringField", value: e.target.value })
              }
              placeholder="输入数据集名称"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-dataset-description">描述</Label>
            <Input
              id="edit-dataset-description"
              value={formState.description}
              onChange={(e) =>
                dispatch({ field: "description", type: "setStringField", value: e.target.value })
              }
              placeholder="输入数据集描述（可选）"
            />
          </div>

          <SelectFieldBlock
            label="目标类型"
            name="edit-dataset-target-type"
            placeholder="选择目标类型（可选）"
            options={[...DATASET_TARGET_TYPE_OPTIONS]}
            value={formState.targetType}
            onValueChange={(value) =>
              dispatch({ type: "setTargetType", value: value as DatasetTargetType })
            }
            helpText="此数据集的评估对象，将用于目标列和目标筛选。"
            disabled={updateDataset.isPending}
          />

          <SchemaConfigSection
            inputSchema={formState.inputSchema}
            outputSchema={formState.groundTruthSchema}
            requestContextSchema={formState.requestContextSchema}
            onChange={handleSchemaChange}
            disabled={updateDataset.isPending}
            defaultOpen={
              !!(dataset.inputSchema || dataset.groundTruthSchema || dataset.requestContextSchema)
            }
          />

          {formState.validationError && (
            <div className="p-3 bg-red-950/20 border border-red-900/50 rounded-md">
              <p className="text-sm text-red-200">{formState.validationError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" onClick={handleCancel}>
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={updateDataset.isPending || !formState.name.trim()}
            >
              {updateDataset.isPending ? "正在保存..." : "保存更改"}
            </Button>
          </div>
        </form>
      </DialogBody>
    </>
  );
}

export function EditDatasetDialog({
  open,
  onOpenChange,
  dataset,
  onSuccess,
}: EditDatasetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <EditDatasetDialogForm
          key={dataset.id}
          dataset={dataset}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
