import type { DatasetItemToolMock } from "@mastra/client-js";
import { collectToolMocks } from "@mastra/core/utils/collect-tool-mocks";
import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import { Label } from "@mastra/playground-ui/components/Label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@mastra/playground-ui/components/Select";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import type { SideDialogRootProps } from "@mastra/playground-ui/components/SideDialog";
import { TextAndIcon, getShortId } from "@mastra/playground-ui/components/Text";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { EyeIcon, WrenchIcon } from "lucide-react";
import { useState } from "react";
import {
  useDatasetItem,
  useDatasetItems,
} from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-items";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useDatasets } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";

interface AddTraceMocksToItemDialogProps {
  traceId?: string;
  isOpen: boolean;
  onClose: () => void;
  level?: SideDialogRootProps["level"];
}

/** Short, human-readable label for an item: short id + a preview of the input. */
function itemLabel(item: { id: string; input: unknown }): string {
  const preview = (() => {
    try {
      const json = JSON.stringify(item.input);
      if (!json) {
        return "";
      }
      return json.length > 40 ? `${json.slice(0, 40)}…` : json;
    } catch {
      return "";
    }
  })();
  const shortId = getShortId(item.id) ?? item.id;
  return preview ? `${shortId} — ${preview}` : shortId;
}

interface AddTraceMocksFormProps {
  initialMocksJson: string;
  onClose: () => void;
}

function getItemPlaceholder(selectedDatasetId: string, isItemsLoading: boolean): string {
  if (!selectedDatasetId) {
    return "请先选择数据集";
  }
  return isItemsLoading ? "正在加载数据项..." : "选择数据项";
}

function AddTraceMocksForm({ initialMocksJson, onClose }: AddTraceMocksFormProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  // Editable JSON of the mocks to append, seeded once from the trace-derived mocks.
  const [mocksJson, setMocksJson] = useState<string>(initialMocksJson);

  const { data: datasetsData, isLoading: isDatasetsLoading } = useDatasets();
  const datasets = datasetsData?.datasets ?? [];

  const { data: items = [], isLoading: isItemsLoading } = useDatasetItems(selectedDatasetId);
  const { data: selectedItem, isFetching: isSelectedItemFetching } = useDatasetItem(
    selectedDatasetId,
    selectedItemId,
  );
  const { updateItem } = useDatasetMutations();

  // Whether the current editor content is a non-empty JSON array (enables submit).
  const hasMocks = (() => {
    if (!mocksJson.trim()) {
      return false;
    }
    try {
      const parsed = JSON.parse(mocksJson);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  })();

  const handleDatasetChange = (value: string) => {
    setSelectedDatasetId(value);
    setSelectedItemId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDatasetId || !selectedItemId) {
      toast.error("请选择数据集和数据项");
      return;
    }

    // Parse the (possibly edited) mocks JSON.
    let parsedMocks: DatasetItemToolMock[];
    try {
      const parsed = mocksJson.trim() ? JSON.parse(mocksJson) : [];
      if (!Array.isArray(parsed)) {
        toast.error("工具模拟必须是 JSON 数组");
        return;
      }
      parsedMocks = parsed as DatasetItemToolMock[];
    } catch {
      toast.error("工具模拟必须是有效的 JSON");
      return;
    }
    if (parsedMocks.length === 0) {
      toast.error("没有可添加的工具模拟");
      return;
    }
    // Guard against appending to a stale/unloaded item — require the authoritative item first.
    if (!selectedItem || selectedItem.id !== selectedItemId) {
      toast.error("数据项仍在加载，请稍后重试");
      return;
    }

    const existing = selectedItem.toolMocks ?? [];
    const merged = [...existing, ...parsedMocks];

    try {
      await updateItem.mutateAsync({
        datasetId: selectedDatasetId,
        itemId: selectedItemId,
        toolMocks: merged,
      });
      toast.success(`已向数据项添加 ${parsedMocks.length} 个工具模拟`);
      onClose();
    } catch (error) {
      toast.error(`添加工具模拟失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="target-dataset">数据集 *</Label>
        <Select
          value={selectedDatasetId}
          onValueChange={handleDatasetChange}
          disabled={isDatasetsLoading}
        >
          <SelectTrigger id="target-dataset">
            <SelectValue placeholder={isDatasetsLoading ? "正在加载数据集..." : "选择数据集"} />
          </SelectTrigger>
          <SelectContent>
            {datasets.length === 0 ? (
              <div className="px-2 py-4 text-sm text-neutral4 text-center">暂无可用数据集</div>
            ) : (
              datasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="target-item">数据项 *</Label>
        <Select
          value={selectedItemId}
          onValueChange={setSelectedItemId}
          disabled={!selectedDatasetId || isItemsLoading}
        >
          <SelectTrigger id="target-item">
            <SelectValue placeholder={getItemPlaceholder(selectedDatasetId, isItemsLoading)} />
          </SelectTrigger>
          <SelectContent>
            {items.length === 0 ? (
              <div className="px-2 py-4 text-sm text-neutral4 text-center">暂无可用数据项</div>
            ) : (
              items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {itemLabel(item)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="derived-mocks">工具模拟（JSON）</Label>
        <CodeEditor
          value={mocksJson}
          onChange={setMocksJson}
          showCopyButton={false}
          className="min-h-[160px]"
        />
        <p className="text-xs text-neutral4">
          已根据追踪记录中的工具调用生成。追加前可编辑或移除条目。
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={
            updateItem.isPending ||
            isSelectedItemFetching ||
            !hasMocks ||
            !selectedDatasetId ||
            !selectedItemId ||
            selectedItem?.id !== selectedItemId
          }
        >
          {updateItem.isPending ? "正在添加..." : "追加工具模拟"}
        </Button>
      </div>
    </form>
  );
}

export function AddTraceMocksToItemDialog({
  traceId,
  isOpen,
  onClose,
  level = 2,
}: AddTraceMocksToItemDialogProps) {
  const client = useMastraClient();

  const { data: trajectory, isLoading: isTrajectoryLoading } = useQuery({
    enabled: isOpen && !!traceId,
    queryFn: () => {
      if (!traceId) {
        throw new Error("加载轨迹需要追踪 ID");
      }
      return client.getTraceTrajectory(traceId);
    },
    queryKey: ["trace-trajectory", traceId],
  });

  const derivedMocks: DatasetItemToolMock[] = trajectory?.steps
    ? collectToolMocks(trajectory.steps)
    : [];
  const initialMocksJson = derivedMocks.length > 0 ? JSON.stringify(derivedMocks, null, 2) : "";

  return (
    <SideDialog
      dialogTitle="将工具模拟添加到数据项"
      dialogDescription="将从追踪记录生成的工具模拟追加到现有数据项"
      isOpen={isOpen}
      onClose={onClose}
      level={level}
    >
      <SideDialog.Top>
        <TextAndIcon>
          <EyeIcon /> {getShortId(traceId)}
        </TextAndIcon>
        ›
        <TextAndIcon>
          <WrenchIcon /> 将工具模拟添加到数据项
        </TextAndIcon>
      </SideDialog.Top>

      <SideDialog.Content>
        <SideDialog.Header>
          <SideDialog.Heading>
            <WrenchIcon /> 将工具模拟添加到数据项
          </SideDialog.Heading>
        </SideDialog.Header>

        {isTrajectoryLoading ? (
          <div className="px-2 py-4 text-sm text-neutral4">正在从追踪记录加载工具调用...</div>
        ) : (
          // Remount when the source trace changes so the form's useState seeds
          // from the freshly derived mocks — no state-reset effect needed.
          <AddTraceMocksForm
            key={traceId ?? "no-trace"}
            initialMocksJson={initialMocksJson}
            onClose={onClose}
          />
        )}
      </SideDialog.Content>
    </SideDialog>
  );
}
