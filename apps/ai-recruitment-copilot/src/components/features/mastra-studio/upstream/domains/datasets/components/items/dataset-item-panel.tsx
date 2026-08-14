"use client";

import type { DatasetItem, DatasetItemToolMock } from "@mastra/client-js";
import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { DataKeysAndValues } from "@mastra/playground-ui/components/DataKeysAndValues";
import { DataPanel } from "@mastra/playground-ui/components/DataPanel";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { toast } from "@mastra/playground-ui/utils/toast";
import { format } from "date-fns/format";
import {
  BracesIcon,
  EllipsisVerticalIcon,
  FileInputIcon,
  FileOutputIcon,
  History,
  Pencil,
  RouteIcon,
  TagIcon,
  Trash2,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useDatasetMutations } from "../../hooks/use-dataset-mutations";
import { EditModeContent } from "../dataset-detail/dataset-item-form";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

/** Schema validation error from API */
interface SchemaValidationError {
  field: "input" | "groundTruth" | "toolMocks";
  errors: { path: string; message: string }[];
}

/** Parses API error message to extract schema validation details */
function parseValidationError(error: unknown): SchemaValidationError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  // API error format: "HTTP error! status: 400 - {\"error\":\"...\",\"field\":\"...\",\"errors\":[...]}"
  const match = error.message.match(/- ({.*})$/);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.field && Array.isArray(parsed.errors)) {
      return { errors: parsed.errors, field: parsed.field };
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

export interface DatasetItemPanelProps {
  datasetId: string;
  item: DatasetItem;
  items: DatasetItem[];
  onItemChange: (itemId: string) => void;
  onClose: () => void;
}

/**
 * Inline panel showing full details of a single dataset item.
 * Includes navigation to next/previous items and sections for Input, Ground Truth, and Metadata.
 */
export function DatasetItemPanel({
  datasetId,
  item,
  items,
  onItemChange,
  onClose,
}: DatasetItemPanelProps) {
  const { Link } = useLinkComponent();
  const { updateItem, deleteItem } = useDatasetMutations();

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [groundTruthValue, setGroundTruthValue] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
  const [trajectoryValue, setTrajectoryValue] = useState("");
  const [toolMocksValue, setToolMocksValue] = useState("");
  const [requestContextValue, setRequestContextValue] = useState("");

  // Validation error state
  const [validationErrors, setValidationErrors] = useState<SchemaValidationError | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset form state when item changes (navigation or prop update)
  useEffect(() => {
    if (item) {
      setInputValue(JSON.stringify(item.input, null, 2));
      setGroundTruthValue(item.groundTruth ? JSON.stringify(item.groundTruth, null, 2) : "");
      setMetadataValue(item.metadata ? JSON.stringify(item.metadata, null, 2) : "");
      setTrajectoryValue(
        item.expectedTrajectory ? JSON.stringify(item.expectedTrajectory, null, 2) : "",
      );
      setToolMocksValue(item.toolMocks?.length ? JSON.stringify(item.toolMocks, null, 2) : "");
      setRequestContextValue(
        item.requestContext ? JSON.stringify(item.requestContext, null, 2) : "",
      );
      // Exit edit mode on item change
      setIsEditing(false);
      // Reset delete state on item change
      setShowDeleteConfirm(false);
      // Reset validation errors on item change
      setValidationErrors(null);
    }
    // Intentionally depends on item.id only — re-running on every new `item` object
    // reference would clobber in-progress edits whenever the parent refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const currentIndex = items.findIndex((i) => i.id === item.id);
  const onPrevious = currentIndex > 0 ? () => onItemChange(items[currentIndex - 1].id) : undefined;
  const onNext =
    currentIndex !== -1 && currentIndex < items.length - 1
      ? () => onItemChange(items[currentIndex + 1].id)
      : undefined;

  // Form handlers
  const handleSave = async () => {
    // Validate input JSON
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(inputValue);
    } catch {
      toast.error("输入必须是有效的 JSON");
      return;
    }

    // Parse groundTruth if provided
    let parsedGroundTruth: unknown | undefined;
    if (groundTruthValue.trim()) {
      try {
        parsedGroundTruth = JSON.parse(groundTruthValue);
      } catch {
        toast.error("标准答案必须是有效的 JSON");
        return;
      }
    }

    // Parse metadata if provided
    let parsedMetadata: Record<string, unknown> | undefined;
    if (metadataValue.trim()) {
      try {
        parsedMetadata = JSON.parse(metadataValue);
      } catch {
        toast.error("元数据必须是有效的 JSON");
        return;
      }
    }

    // Parse expectedTrajectory: empty string means explicitly clear (null), omitted means keep existing
    let parsedTrajectory: unknown | null = null;
    if (trajectoryValue.trim()) {
      try {
        parsedTrajectory = JSON.parse(trajectoryValue);
      } catch {
        toast.error("预期轨迹必须是有效的 JSON");
        return;
      }
    }

    // Parse toolMocks: empty string means clear, otherwise must be a JSON array
    let parsedToolMocks: DatasetItemToolMock[] | undefined;
    if (toolMocksValue.trim()) {
      try {
        const parsed = JSON.parse(toolMocksValue);
        if (!Array.isArray(parsed)) {
          toast.error("工具模拟必须是 JSON 数组");
          return;
        }
        parsedToolMocks = parsed as DatasetItemToolMock[];
      } catch {
        toast.error("工具模拟必须是有效的 JSON");
        return;
      }
    } else {
      parsedToolMocks = [];
    }

    // Parse requestContext if provided
    let parsedRequestContext: Record<string, unknown> | undefined;
    if (requestContextValue.trim()) {
      try {
        parsedRequestContext = JSON.parse(requestContextValue);
      } catch {
        toast.error("请求上下文必须是有效的 JSON");
        return;
      }
    }

    try {
      await updateItem.mutateAsync({
        datasetId,
        expectedTrajectory: parsedTrajectory,
        groundTruth: parsedGroundTruth,
        input: parsedInput,
        itemId: item.id,
        metadata: parsedMetadata,
        requestContext: parsedRequestContext,
        toolMocks: parsedToolMocks,
      });

      toast.success("数据项更新成功");
      setIsEditing(false);
      setValidationErrors(null);
    } catch (error) {
      // Check for schema validation error from API
      const schemaError = parseValidationError(error);
      if (schemaError) {
        setValidationErrors(schemaError);
      } else {
        toast.error(`更新数据项失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setInputValue(JSON.stringify(item.input, null, 2));
    setGroundTruthValue(item.groundTruth ? JSON.stringify(item.groundTruth, null, 2) : "");
    setMetadataValue(item.metadata ? JSON.stringify(item.metadata, null, 2) : "");
    setTrajectoryValue(
      item.expectedTrajectory ? JSON.stringify(item.expectedTrajectory, null, 2) : "",
    );
    setToolMocksValue(item.toolMocks?.length ? JSON.stringify(item.toolMocks, null, 2) : "");
    setRequestContextValue(item.requestContext ? JSON.stringify(item.requestContext, null, 2) : "");
    setIsEditing(false);
    setValidationErrors(null);
  };

  // Clear validation errors on field change
  const handleInputValueChange = (value: string) => {
    setInputValue(value);
    if (validationErrors?.field === "input") {
      setValidationErrors(null);
    }
  };

  const handleGroundTruthValueChange = (value: string) => {
    setGroundTruthValue(value);
    if (validationErrors?.field === "groundTruth") {
      setValidationErrors(null);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteItem.mutateAsync({ datasetId, itemId: item.id });
      toast.success("数据项删除成功");
      setShowDeleteConfirm(false);
      // Close the panel after successful deletion
      onClose();
    } catch (error) {
      toast.error(`删除数据项失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  return (
    <>
      <DataPanel>
        <DataPanel.Header>
          <DataPanel.Heading>
            数据项 <b># {item.id.length > 12 ? `${item.id.slice(0, 12)}…` : item.id}</b>
          </DataPanel.Heading>
          <ButtonsGroup className="ml-auto shrink-0">
            <DataPanel.NextPrevNav
              onPrevious={onPrevious}
              onNext={onNext}
              previousLabel="上一个数据项"
              nextLabel="下一个数据项"
            />
            {!isEditing && (
              <>
                <Button
                  as={Link}
                  href={`/datasets/${datasetId}/items/${item.id}`}
                  size="md"
                  tooltip="前往数据项版本历史"
                  aria-label="前往数据项版本历史"
                >
                  <History />
                </Button>

                <DropdownMenu>
                  <DropdownMenu.Trigger asChild>
                    <Button size="md" aria-label="操作菜单">
                      <EllipsisVerticalIcon />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" className="w-48">
                    <DropdownMenu.Item onSelect={() => setIsEditing(true)}>
                      <Pencil />
                      编辑
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => setShowDeleteConfirm(true)}
                      className="text-red-500 focus:text-red-400"
                    >
                      <Trash2 />
                      删除数据项
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              </>
            )}
            <DataPanel.CloseButton onClick={onClose} tooltip="关闭详情面板" />
          </ButtonsGroup>
        </DataPanel.Header>

        <DataPanel.Content>
          {isEditing ? (
            <EditModeContent
              inputValue={inputValue}
              setInputValue={handleInputValueChange}
              groundTruthValue={groundTruthValue}
              setGroundTruthValue={handleGroundTruthValueChange}
              metadataValue={metadataValue}
              setMetadataValue={setMetadataValue}
              trajectoryValue={trajectoryValue}
              setTrajectoryValue={setTrajectoryValue}
              toolMocksValue={toolMocksValue}
              setToolMocksValue={setToolMocksValue}
              requestContextValue={requestContextValue}
              setRequestContextValue={setRequestContextValue}
              validationErrors={validationErrors}
              onSave={handleSave}
              onCancel={handleCancel}
              isSaving={updateItem.isPending}
            />
          ) : (
            <>
              <DataKeysAndValues>
                <DataKeysAndValues.Key>数据集 ID</DataKeysAndValues.Key>
                <DataKeysAndValues.ValueWithCopyBtn
                  copyTooltip="复制数据集 ID"
                  copyValue={item.datasetId}
                >
                  {item.datasetId}
                </DataKeysAndValues.ValueWithCopyBtn>
                <DataKeysAndValues.Key>版本</DataKeysAndValues.Key>
                <DataKeysAndValues.Value>v{item.datasetVersion}</DataKeysAndValues.Value>
                <DataKeysAndValues.Key>创建时间</DataKeysAndValues.Key>
                <DataKeysAndValues.Value>
                  {format(new Date(item.createdAt), "yyyy/MM/dd HH:mm")}
                </DataKeysAndValues.Value>
                {item.updatedAt &&
                  new Date(item.updatedAt).getTime() !== new Date(item.createdAt).getTime() && (
                    <>
                      <DataKeysAndValues.Key>更新时间</DataKeysAndValues.Key>
                      <DataKeysAndValues.Value>
                        {format(new Date(item.updatedAt), "yyyy/MM/dd HH:mm")}
                      </DataKeysAndValues.Value>
                    </>
                  )}
              </DataKeysAndValues>

              <div className="grid gap-3 mt-3">
                <DataPanel.CodeSection
                  title="输入"
                  icon={<FileInputIcon />}
                  codeStr={JSON.stringify(item.input ?? null, null, 2)}
                />
                <DataPanel.CodeSection
                  title="标准答案"
                  icon={<FileOutputIcon />}
                  codeStr={JSON.stringify(item.groundTruth ?? null, null, 2)}
                />
                {item.expectedTrajectory !== null && item.expectedTrajectory !== undefined && (
                  <DataPanel.CodeSection
                    title="预期轨迹"
                    icon={<RouteIcon />}
                    codeStr={JSON.stringify(item.expectedTrajectory, null, 2)}
                  />
                )}
                <DataPanel.CodeSection
                  title="工具模拟"
                  icon={<WrenchIcon />}
                  codeStr={JSON.stringify(item.toolMocks ?? [], null, 2)}
                />
                {item.requestContext !== null && item.requestContext !== undefined && (
                  <DataPanel.CodeSection
                    title="请求上下文"
                    icon={<BracesIcon />}
                    codeStr={JSON.stringify(item.requestContext, null, 2)}
                  />
                )}
                <DataPanel.CodeSection
                  title="元数据"
                  icon={<TagIcon />}
                  codeStr={JSON.stringify(item.metadata ?? null, null, 2)}
                />
              </div>
            </>
          )}
        </DataPanel.Content>
      </DataPanel>

      {/* Delete confirmation - uses portal, renders above panel */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>删除数据项</AlertDialog.Title>
            <AlertDialog.Description>
              确定要删除此数据项吗？此操作无法撤销。
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>取消</AlertDialog.Cancel>
            <AlertDialog.Action onClick={handleDeleteConfirm}>
              {deleteItem.isPending ? "正在删除..." : "确认删除"}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </>
  );
}
