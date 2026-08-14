"use client";

import type { DatasetItemToolMock } from "@mastra/client-js";
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
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { toast } from "@mastra/playground-ui/utils/toast";
import { DatabaseIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useDatasets } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";

interface SaveAsDatasetItemDialogProps {
  initialInput: string;
  initialGroundTruth: string;
  /** JSON string of the expected trajectory */
  initialTrajectory?: string;
  /** Whether the trajectory is still being fetched */
  trajectoryLoading?: boolean;
  /** JSON string of the tool mocks (array of { toolName, args, output }) */
  initialToolMocks?: string;
  breadcrumb: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  level?: SideDialogRootProps["level"];
  source?: {
    type: "csv" | "json" | "trace" | "llm" | "experiment-result" | "candidate-screener";
    referenceId?: string;
  };
}

export function SaveAsDatasetItemDialog({
  initialInput,
  initialGroundTruth,
  initialTrajectory,
  trajectoryLoading,
  initialToolMocks,
  breadcrumb,
  isOpen,
  onClose,
  level = 2,
  source,
}: SaveAsDatasetItemDialogProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [input, setInput] = useState("");
  const [groundTruth, setGroundTruth] = useState("");
  const [expectedTrajectory, setExpectedTrajectory] = useState("");
  const [toolMocks, setToolMocks] = useState("");
  // source is passed through — not editable in the UI

  const { data, isLoading: isDatasetsLoading } = useDatasets();
  const { addItem } = useDatasetMutations();

  const datasets = data?.datasets ?? [];

  const prevOpenRef = useRef(false);
  const trajectorySeededRef = useRef(false);
  const inputSeededRef = useRef(false);
  const groundTruthSeededRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setInput(initialInput);
      setGroundTruth(initialGroundTruth);
      setExpectedTrajectory(initialTrajectory ?? "");
      setToolMocks(initialToolMocks ?? "");
      trajectorySeededRef.current = !!initialTrajectory;
      inputSeededRef.current = initialInput !== "{}";
      groundTruthSeededRef.current = !!initialGroundTruth;
    }
    prevOpenRef.current = isOpen;
    if (!isOpen) {
      trajectorySeededRef.current = false;
      inputSeededRef.current = false;
      groundTruthSeededRef.current = false;
    }
  }, [isOpen, initialInput, initialGroundTruth, initialTrajectory, initialToolMocks]);

  // Mark fields as user-edited so async seeding won't overwrite them.
  const handleInputChange = (value: string) => {
    inputSeededRef.current = true;
    setInput(value);
  };

  const handleGroundTruthChange = (value: string) => {
    groundTruthSeededRef.current = true;
    setGroundTruth(value);
  };

  const handleExpectedTrajectoryChange = (value: string) => {
    trajectorySeededRef.current = true;
    setExpectedTrajectory(value);
  };

  const handleToolMocksChange = (value: string) => {
    setToolMocks(value);
  };

  // Seed input when it arrives asynchronously after the dialog is already open
  useEffect(() => {
    if (isOpen && initialInput !== "{}" && !inputSeededRef.current) {
      setInput(initialInput);
      inputSeededRef.current = true;
    }
  }, [isOpen, initialInput]);

  // Seed groundTruth when it arrives asynchronously after the dialog is already open
  useEffect(() => {
    if (isOpen && initialGroundTruth && !groundTruthSeededRef.current) {
      setGroundTruth(initialGroundTruth);
      groundTruthSeededRef.current = true;
    }
  }, [isOpen, initialGroundTruth]);

  // Seed trajectory when it arrives asynchronously after the dialog is already open
  useEffect(() => {
    if (isOpen && initialTrajectory && !trajectorySeededRef.current) {
      setExpectedTrajectory(initialTrajectory);
      trajectorySeededRef.current = true;
    }
  }, [isOpen, initialTrajectory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDatasetId) {
      toast.error("请选择数据集");
      return;
    }

    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(input);
    } catch {
      toast.error("输入必须是有效的 JSON");
      return;
    }

    let parsedGroundTruth: unknown | undefined;
    if (groundTruth.trim()) {
      try {
        parsedGroundTruth = JSON.parse(groundTruth);
      } catch {
        toast.error("标准答案必须是有效的 JSON");
        return;
      }
    }

    let parsedTrajectory: unknown | undefined;
    if (expectedTrajectory.trim()) {
      try {
        parsedTrajectory = JSON.parse(expectedTrajectory);
      } catch {
        toast.error("预期轨迹必须是有效的 JSON");
        return;
      }
    }

    let parsedToolMocks: DatasetItemToolMock[] | undefined;
    if (toolMocks.trim()) {
      try {
        const parsed = JSON.parse(toolMocks);
        if (!Array.isArray(parsed)) {
          toast.error("工具模拟必须是 JSON 数组");
          return;
        }
        parsedToolMocks = parsed as DatasetItemToolMock[];
      } catch {
        toast.error("工具模拟必须是有效的 JSON");
        return;
      }
    }

    try {
      await addItem.mutateAsync({
        datasetId: selectedDatasetId,
        expectedTrajectory: parsedTrajectory,
        groundTruth: parsedGroundTruth,
        input: parsedInput,
        toolMocks: parsedToolMocks,
        ...(source ? { source } : {}),
      });

      const targetDataset = datasets.find((d) => d.id === selectedDatasetId);
      toast.success(`数据项已保存到“${targetDataset?.name}”`);

      setSelectedDatasetId("");
      setInput("{}");
      setGroundTruth("");
      setExpectedTrajectory("");
      setToolMocks("");
      onClose();
    } catch (error) {
      toast.error(`保存数据项失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const handleCancel = () => {
    setSelectedDatasetId("");
    onClose();
  };

  let saveButtonLabel = "保存数据项";
  if (addItem.isPending) {
    saveButtonLabel = "正在保存...";
  } else if (trajectoryLoading) {
    saveButtonLabel = "正在加载...";
  }

  return (
    <SideDialog
      dialogTitle="保存为数据项"
      dialogDescription="将数据保存为数据项"
      isOpen={isOpen}
      onClose={onClose}
      level={level}
    >
      <SideDialog.Top>
        {breadcrumb}›
        <TextAndIcon>
          <DatabaseIcon /> 保存为数据项
        </TextAndIcon>
      </SideDialog.Top>

      <SideDialog.Content>
        <SideDialog.Header>
          <SideDialog.Heading>
            <DatabaseIcon /> 保存为数据项
          </SideDialog.Heading>
        </SideDialog.Header>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="target-dataset">数据集 *</Label>
            <Select
              value={selectedDatasetId}
              onValueChange={setSelectedDatasetId}
              disabled={addItem.isPending || isDatasetsLoading}
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
            <Label htmlFor="item-input">输入（JSON）*</Label>
            <CodeEditor
              value={input}
              onChange={handleInputChange}
              showCopyButton={false}
              className="min-h-[120px]"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item-ground-truth">标准答案（JSON，可选）</Label>
            <CodeEditor
              value={groundTruth}
              onChange={handleGroundTruthChange}
              showCopyButton={false}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item-trajectory">预期轨迹（JSON，可选）</Label>
            <CodeEditor
              value={expectedTrajectory}
              onChange={handleExpectedTrajectoryChange}
              showCopyButton={false}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item-tool-mocks">工具模拟（JSON，可选）</Label>
            <CodeEditor
              value={toolMocks}
              onChange={handleToolMocksChange}
              showCopyButton={false}
              className="min-h-[80px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleCancel}>
              取消
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={
                addItem.isPending ||
                trajectoryLoading ||
                !selectedDatasetId ||
                datasets.length === 0
              }
            >
              {saveButtonLabel}
            </Button>
          </div>
        </form>
      </SideDialog.Content>
    </SideDialog>
  );
}
