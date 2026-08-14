import { Button } from "@mastra/playground-ui/components/Button";
import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@mastra/playground-ui/components/Dialog";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { toast } from "@mastra/playground-ui/utils/toast";
import { Sparkles, Trash2, Plus } from "lucide-react";
import { useState, useCallback, useRef } from "react";

import { useGenerationTasks } from "../context/generation-context";
import { useDatasetMutations } from "../hooks/use-dataset-mutations";
import { usePlaygroundModel } from "@/components/features/mastra-studio/upstream/domains/agents/context/playground-model-context";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";
import { cleanProviderId } from "@/components/features/mastra-studio/upstream/domains/llm/utils";

interface GeneratedItem {
  input: unknown;
  groundTruth?: unknown;
}

interface AgentContext {
  description?: string;
  instructions?: string;
  tools?: string[];
}

interface GenerateConfigDialogProps {
  datasetId: string;
  agentContext?: AgentContext;
  onDismiss: () => void;
}

function buildDefaultPrompt(agentContext?: AgentContext): string {
  const parts: string[] = [];
  if (agentContext?.description) {
    parts.push(`为具备以下描述的智能体生成多样化的测试输入：${agentContext.description}。`);
  } else {
    parts.push("为此智能体生成多样化的测试输入。");
  }
  if (agentContext?.instructions) {
    parts.push(`智能体指令：${agentContext.instructions}`);
  }
  if (agentContext?.tools?.length) {
    parts.push(`智能体拥有以下工具：${agentContext.tools.join("、")}。`);
  }
  parts.push("包含边界情况、典型用法和对抗性输入。");
  return parts.join(" ");
}

function formatItemPreview(input: unknown): string {
  if (typeof input === "string") {
    return input.slice(0, 80);
  }
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    const [first] = Object.values(obj);
    if (typeof first === "string") {
      return first.slice(0, 80);
    }
    return JSON.stringify(input).slice(0, 80);
  }
  return String(input).slice(0, 80);
}

/**
 * Config-only dialog for generating dataset items.
 * On Generate click, the dialog closes and generation runs in background via GenerationProvider.
 */
export function GenerateConfigDialog({
  datasetId,
  agentContext,
  onDismiss,
}: GenerateConfigDialogProps) {
  const { provider: ctxProvider, model: ctxModel } = usePlaygroundModel();
  const [localProvider, setLocalProvider] = useState(ctxProvider);
  const [localModel, setLocalModel] = useState(ctxModel);
  const modelId = localProvider && localModel ? `${localProvider}/${localModel}` : "";

  const [prompt, setPrompt] = useState(() => buildDefaultPrompt(agentContext));
  const [count, setCount] = useState(5);

  const configContentRef = useRef<HTMLDivElement>(null);
  const { generateItems } = useDatasetMutations();
  const { startGeneration } = useGenerationTasks();

  const handleGenerate = useCallback(() => {
    if (!modelId) {
      toast.error("请选择提供商和模型");
      return;
    }

    const effectivePrompt = prompt.trim() || buildDefaultPrompt(agentContext);

    startGeneration({
      agentContext,
      count,
      datasetId,
      generateFn: async (params) => {
        const result = (await generateItems.mutateAsync(params)) as { items: GeneratedItem[] };
        return { items: result.items ?? [] };
      },
      modelId,
      prompt: effectivePrompt,
    });

    onDismiss();
  }, [prompt, count, modelId, datasetId, generateItems, agentContext, onDismiss, startGeneration]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent ref={configContentRef} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>生成测试数据</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>模型</Label>
              <div className="flex items-center gap-1.5">
                <div className="w-[160px]">
                  <LLMProviders
                    value={localProvider}
                    onValueChange={(value) => {
                      const cleaned = cleanProviderId(value);
                      setLocalProvider(cleaned);
                      setLocalModel("");
                    }}
                    size="sm"
                    container={configContentRef}
                  />
                </div>
                <div className="flex-1">
                  <LLMModels
                    llmId={localProvider}
                    value={localModel}
                    onValueChange={setLocalModel}
                    size="sm"
                    container={configContentRef}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>指令（可选）</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：生成涵盖不同菜系、饮食限制和技能水平的多样化食谱查询..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>数据项数量</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) =>
                  setCount(Math.max(1, Math.min(50, Number.parseInt(e.target.value, 10) || 1)))
                }
              />
            </div>

            {!modelId && (
              <Txt variant="ui-xs" className="text-amber-400">
                请先在上方选择提供商和模型，再生成数据项。
              </Txt>
            )}
          </div>
        </DialogBody>
        <DialogFooter className="px-6">
          <div className="flex justify-end gap-2">
            <Button onClick={() => handleClose(false)}>取消</Button>
            <Button variant="primary" onClick={handleGenerate} disabled={!modelId}>
              <Icon>
                <Sparkles />
              </Icon>
              生成
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Review dialog for generated items.
 * Receives items directly and allows the user to select and add them to the dataset.
 */
export function GenerateReviewDialog({
  datasetId,
  items: initialItems,
  modelId,
  onDismiss,
  onStartOver,
}: {
  datasetId: string;
  items: GeneratedItem[];
  modelId: string;
  onDismiss: () => void;
  onStartOver?: () => void;
}) {
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>(initialItems);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(initialItems.map((_, i) => i)),
  );
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set([0]));
  const generatedItemCount = generatedItems.length;

  const { batchInsertItems } = useDatasetMutations();

  const handleAddSelected = useCallback(async () => {
    const items = generatedItems
      .filter((_, i) => selectedIndices.has(i))
      .map((item) => ({
        groundTruth: item.groundTruth,
        input: item.input,
        source: { referenceId: modelId, type: "llm" as const },
      }));

    if (items.length === 0) {
      toast.error("未选择数据项");
      return;
    }

    try {
      await batchInsertItems.mutateAsync({ datasetId, items });
      toast.success(`已向数据集添加 ${items.length} 个数据项`);
      onDismiss();
    } catch (error) {
      toast.error(`添加数据项失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [generatedItems, selectedIndices, modelId, datasetId, batchInsertItems, onDismiss]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  const toggleIndex = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIndices.size === generatedItemCount) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(Array.from({ length: generatedItemCount }, (_, i) => i)));
    }
  }, [selectedIndices.size, generatedItemCount]);

  const handleRemoveItem = useCallback((index: number) => {
    setGeneratedItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) {
          next.add(i);
        } else if (i > index) {
          next.add(i - 1);
        }
      }
      return next;
    });
    setExpandedIndices((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) {
          next.add(i);
        } else if (i > index) {
          next.add(i - 1);
        }
      }
      return next;
    });
  }, []);

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>检查已生成的数据项</DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] flex flex-col">
          <div className="flex flex-col flex-1 min-h-0 gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIndices.size === generatedItems.length}
                  onCheckedChange={toggleAll}
                />
                <Txt variant="ui-sm" className="text-neutral4">
                  已选择 {selectedIndices.size} / {generatedItems.length}
                </Txt>
              </div>
              {onStartOver && (
                <Button variant="ghost" size="sm" onClick={onStartOver}>
                  重新开始
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2">
                {generatedItems.map((item, index) => (
                  <div key={index} className="border border-border1 rounded-lg">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Checkbox
                        checked={selectedIndices.has(index)}
                        onCheckedChange={() => toggleIndex(index)}
                      />
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => toggleExpanded(index)}
                      >
                        <Txt variant="ui-sm" className="text-neutral5 truncate">
                          数据项 {index + 1}: {formatItemPreview(item.input)}
                        </Txt>
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(index)}>
                        <Icon size="sm">
                          <Trash2 />
                        </Icon>
                      </Button>
                    </div>

                    {expandedIndices.has(index) && (
                      <div className="border-t border-border1 px-3 py-2 space-y-2">
                        <div>
                          <Txt variant="ui-xs" className="text-neutral3 font-medium">
                            输入
                          </Txt>
                          <pre className="text-xs text-neutral5 bg-surface1 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-32 overflow-y-auto mt-1">
                            {JSON.stringify(item.input, null, 2)}
                          </pre>
                        </div>
                        {item.groundTruth !== undefined && (
                          <div>
                            <Txt variant="ui-xs" className="text-neutral3 font-medium">
                              标准答案
                            </Txt>
                            <pre className="text-xs text-neutral5 bg-surface1 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-32 overflow-y-auto mt-1">
                              {JSON.stringify(item.groundTruth, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogBody>
        <DialogFooter className="px-6">
          <div className="flex justify-end gap-2">
            <Button onClick={() => handleClose(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={handleAddSelected}
              disabled={selectedIndices.size === 0 || batchInsertItems.isPending}
            >
              {batchInsertItems.isPending ? (
                <>
                  <Spinner className="h-4 w-4" />
                  正在添加...
                </>
              ) : (
                <>
                  <Icon>
                    <Plus />
                  </Icon>
                  添加 {selectedIndices.size} 个数据项
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Keep the old export name as an alias for backward compat in agent-playground-datasets.tsx */
export { GenerateConfigDialog as GenerateItemsDialog };
