import { Button } from "@mastra/playground-ui/components/Button";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { toast } from "@mastra/playground-ui/utils/toast";
import { Pencil, Save, X, Trash2 } from "lucide-react";
import { useState, useCallback } from "react";
import { isDefined } from "../../utils/presence";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";

function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function ExpandedItemEditor({
  datasetId,
  item,
}: {
  datasetId: string;
  item: {
    id: string;
    input: unknown;
    groundTruth?: unknown;
    expectedTrajectory?: unknown;
    source?: unknown;
  };
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [groundTruthValue, setGroundTruthValue] = useState("");
  const [trajectoryValue, setTrajectoryValue] = useState("");
  const { updateItem, deleteItem } = useDatasetMutations();

  const startEditing = useCallback(() => {
    setInputValue(formatValue(item.input));
    setGroundTruthValue(formatValue(item.groundTruth));
    setTrajectoryValue(formatValue(item.expectedTrajectory));
    setIsEditing(true);
  }, [item.input, item.groundTruth, item.expectedTrajectory]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleDelete = useCallback(async () => {
    try {
      await deleteItem.mutateAsync({ datasetId, itemId: item.id });
      toast.success("条目已删除");
    } catch (error) {
      toast.error(`删除失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [deleteItem, datasetId, item.id]);

  const handleSave = useCallback(async () => {
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(inputValue);
    } catch {
      parsedInput = inputValue;
    }

    let parsedGroundTruth: unknown | undefined;
    if (groundTruthValue.trim()) {
      try {
        parsedGroundTruth = JSON.parse(groundTruthValue);
      } catch {
        parsedGroundTruth = groundTruthValue;
      }
    }

    let parsedTrajectory: unknown | undefined;
    if (trajectoryValue.trim()) {
      try {
        parsedTrajectory = JSON.parse(trajectoryValue);
      } catch {
        parsedTrajectory = trajectoryValue;
      }
    }

    try {
      await updateItem.mutateAsync({
        datasetId,
        expectedTrajectory: parsedTrajectory,
        groundTruth: parsedGroundTruth,
        input: parsedInput,
        itemId: item.id,
      });
      toast.success("条目已更新");
      setIsEditing(false);
    } catch (error) {
      toast.error(`更新失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [inputValue, groundTruthValue, trajectoryValue, datasetId, item.id, updateItem]);

  if (isEditing) {
    return (
      <div className="px-4 pb-3 pl-10 space-y-2">
        <div>
          <Txt variant="ui-xs" className="text-neutral3 font-medium">
            输入
          </Txt>
          <Textarea
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
            className="mt-1 font-mono text-xs"
            rows={4}
          />
        </div>
        <div>
          <Txt variant="ui-xs" className="text-neutral3 font-medium">
            标准答案
          </Txt>
          <Textarea
            value={groundTruthValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setGroundTruthValue(e.target.value)
            }
            className="mt-1 font-mono text-xs"
            rows={3}
            placeholder="可选"
          />
        </div>
        <div>
          <Txt variant="ui-xs" className="text-neutral3 font-medium">
            预期轨迹（JSON）
          </Txt>
          <Textarea
            value={trajectoryValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setTrajectoryValue(e.target.value)
            }
            className="mt-1 font-mono text-xs"
            rows={3}
            placeholder="可选 — JSON 格式的预期轨迹"
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={updateItem.isPending}>
            {updateItem.isPending ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <Icon size="sm">
                <Save />
              </Icon>
            )}
            保存
          </Button>
          <Button variant="ghost" size="sm" onClick={cancelEditing}>
            <Icon size="sm">
              <X />
            </Icon>
            取消
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-3 pl-10 space-y-2">
      <div>
        <Txt variant="ui-xs" className="text-neutral3 font-medium">
          输入
        </Txt>
        <pre className="text-xs text-neutral5 bg-surface1 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto mt-1">
          {formatValue(item.input)}
        </pre>
      </div>
      {item.groundTruth !== undefined && item.groundTruth !== null && (
        <div>
          <Txt variant="ui-xs" className="text-neutral3 font-medium">
            标准答案
          </Txt>
          <pre className="text-xs text-neutral5 bg-surface1 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto mt-1">
            {formatValue(item.groundTruth)}
          </pre>
        </div>
      )}
      {isDefined(item.expectedTrajectory) && (
        <div>
          <Txt variant="ui-xs" className="text-neutral3 font-medium">
            预期轨迹
          </Txt>
          <pre className="text-xs text-neutral5 bg-surface1 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto mt-1">
            {formatValue(item.expectedTrajectory)}
          </pre>
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={startEditing}>
          <Icon size="sm">
            <Pencil />
          </Icon>
          编辑
        </Button>
        {isConfirmingDelete ? (
          <>
            <Txt variant="ui-xs" className="text-negative1 font-medium">
              删除此条目？
            </Txt>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              className="text-negative1 hover:text-negative1"
            >
              {deleteItem.isPending ? <Spinner className="h-3 w-3" /> : "是"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsConfirmingDelete(false)}>
              否
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsConfirmingDelete(true)}
            className="text-neutral2 hover:text-negative1"
          >
            <Icon size="sm">
              <Trash2 />
            </Icon>
            删除
          </Button>
        )}
        {isDefined(item.source) && (
          <Txt variant="ui-xs" className="text-neutral2">
            来源：{" "}
            {typeof item.source === "object" && item.source !== null && "type" in item.source
              ? String((item.source as unknown as Record<string, unknown>).type)
              : "手动"}
          </Txt>
        )}
      </div>
    </div>
  );
}
