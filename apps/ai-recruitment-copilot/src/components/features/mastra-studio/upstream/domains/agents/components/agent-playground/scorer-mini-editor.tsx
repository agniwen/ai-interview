import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import {
  ArrowLeft,
  Play,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";

import { useAgentEditFormContext } from "../../context/agent-edit-form-context";
import { usePlaygroundModel } from "../../context/playground-model-context";
import { useDatasetExperimentResults } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-experiments";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useStoredScorerMutations } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-stored-scorers";
import { resolveConditional } from "../../utils/conditional";
import { firstDefined } from "../../utils/presence";
import { allTruthy, isTruthy } from "../../utils/truthiness";
import {
  findLinkedDatasetId,
  getFallbackScorerValues,
  loadLinkedTestItems,
  resolveScorerModel,
  validateScorerFields,
} from "./scorer-mini-editor-helpers";
import type { ScorerMiniEditorProps, TestItem } from "./scorer-mini-editor-helpers";

export function ScorerMiniEditor({
  onBack,
  onSaved,
  initialItems,
  prefillTestItems,
  editScorerId,
  editScorerData,
}: ScorerMiniEditorProps) {
  const isEditing = !!editScorerId;
  const client = useMastraClient();

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [scoreMin, setScoreMin] = useState(0);
  const [scoreMax, setScoreMax] = useState(1);
  const [scorerModel, setScorerModel] = useState("");
  const [isLoadingScorer, setIsLoadingScorer] = useState(false);
  const [testItems, setTestItems] = useState<TestItem[]>(() => {
    if (initialItems) {
      return initialItems.map((item) => ({
        expectedDirection: item.error ? ("low" as const) : ("high" as const),
        input: item.input,
        label: item.itemId.slice(0, 8),
        output: item.error || item.output,
      }));
    }
    if (prefillTestItems) {
      return prefillTestItems.map((item, i) => ({
        expectedDirection: (item.expectedDirection === "high" ? "high" : "low") as "high" | "low",
        input: item.input,
        label: `失败-${i + 1}`,
        output: item.output,
      }));
    }
    return [];
  });
  const [isSaving, setIsSaving] = useState(false);

  // Scorer test run state
  const [savedScorerId, setSavedScorerId] = useState<string | null>(editScorerId || null);
  const [scorerDatasetId, setScorerDatasetId] = useState<string | null>(null);
  const [testExperimentId, setTestExperimentId] = useState<string | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Fetch stored scorer details and linked test items when editing
  useEffect(() => {
    if (!editScorerId) {
      return;
    }
    const loadScorer = async () => {
      setIsLoadingScorer(true);
      try {
        const data = await client
          .getStoredScorer(editScorerId)
          .details(undefined, { status: "draft" });
        setName(firstDefined(data.name, editScorerId) as string);
        setInstructions(firstDefined(data.instructions, "") as string);
        setScoreMin(firstDefined<number>(data.scoreRange?.min, 0) as number);
        setScoreMax(firstDefined<number>(data.scoreRange?.max, 1) as number);
        if (data.model) {
          setScorerModel(`${data.model.provider}/${data.model.name}`);
        }
        // Find linked dataset with targetType='scorer'
        const linkedDatasetId = await findLinkedDatasetId(client, editScorerId);

        if (linkedDatasetId) {
          setScorerDatasetId(linkedDatasetId);
          const linkedItems = await loadLinkedTestItems(client, linkedDatasetId);
          if (linkedItems) {
            setTestItems(linkedItems);
          }
        }
      } catch {
        // Fallback: try to extract from the list-scorers response data
        const fallback = getFallbackScorerValues(editScorerData, editScorerId);
        setName(fallback.name as string);
        setInstructions(fallback.instructions as string);
        if (fallback.model) {
          setScorerModel(fallback.model);
        }
      } finally {
        setIsLoadingScorer(false);
      }
    };
    void loadScorer();
  }, [client, editScorerData, editScorerId]);

  const { provider, model } = usePlaygroundModel();
  const { createStoredScorer, updateStoredScorer } = useStoredScorerMutations(
    editScorerId || savedScorerId || undefined,
  );
  const { form } = useAgentEditFormContext();
  const { createDataset, batchInsertItems, batchDeleteItems, triggerExperiment } =
    useDatasetMutations();

  // Fetch experiment results when we have a test experiment
  const { data: experimentResults = [] } = useDatasetExperimentResults({
    datasetId: scorerDatasetId ?? "",
    experimentId: testExperimentId ?? "",
    experimentStatus: isRunningTest ? "running" : "completed",
  });

  const addTestItem = () => {
    setTestItems((prev) => [...prev, { expectedDirection: "high", input: "", output: "" }]);
  };

  const removeTestItem = (index: number) => {
    setTestItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTestItem = (index: number, field: keyof TestItem, value: unknown) => {
    setTestItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const handleSave = useCallback(async () => {
    if (!validateScorerFields(name, instructions)) {
      return;
    }

    // Parse model: either from the scorer's own model field or the global playground model
    const { model: saveModelName, provider: saveProvider } = resolveScorerModel(
      scorerModel,
      provider,
      model,
    );
    if (!saveProvider || !saveModelName) {
      toast.error("请选择模型");
      return;
    }

    const existingId = firstDefined(editScorerId, savedScorerId);
    setIsSaving(true);
    try {
      if (existingId) {
        // Update existing scorer
        await updateStoredScorer.mutateAsync({
          instructions: instructions.trim(),
          model: { name: saveModelName, provider: saveProvider },
          scoreRange: { max: scoreMax, min: scoreMin },
        });

        // Sync test dataset items
        let datasetId = scorerDatasetId;
        if (allTruthy(!datasetId, testItems.length > 0)) {
          // Create dataset linked to this scorer
          const dataset = await createDataset.mutateAsync({
            description: `评分器“${name.trim()}”的测试数据集，包含已知正确和错误的示例，用于验证评分准确性。`,
            name: `${name.trim()} — 测试数据集`,
            targetIds: [existingId],
            targetType: "scorer",
          });
          datasetId = dataset.id;
          setScorerDatasetId(datasetId);
        }
        if (datasetId) {
          // Clear existing items, then re-insert current ones
          try {
            const { items: existingItems } = await client.listDatasetItems(datasetId, {
              perPage: 200,
            });
            if (existingItems.length > 0) {
              await batchDeleteItems.mutateAsync({
                datasetId,
                itemIds: existingItems.map((i) => i.id),
              });
            }
          } catch {
            // Dataset may have been deleted — continue with insert
          }
          if (testItems.length > 0) {
            await batchInsertItems.mutateAsync({
              datasetId,
              items: testItems.map((item) => ({
                groundTruth: { expectedDirection: item.expectedDirection },
                input: { input: item.input, output: item.output },
                metadata: { label: item.label },
                source: { referenceId: "scorer-editor", type: "llm" as const },
              })),
            });
          }
        }

        onSaved?.(existingId);
        toast.success("评分器已更新");
      } else {
        // 1. Create the stored scorer first
        const result = await createStoredScorer.mutateAsync({
          instructions: instructions.trim(),
          model: { name: saveModelName, provider: saveProvider },
          name: name.trim(),
          scoreRange: { max: scoreMax, min: scoreMin },
          type: "llm-judge",
        });

        const scorerId = (result as { id?: string })?.id;
        if (scorerId) {
          setSavedScorerId(scorerId);

          // 2. Create test dataset linked to the scorer
          if (testItems.length > 0) {
            const dataset = await createDataset.mutateAsync({
              description: `评分器“${name.trim()}”的测试数据集，包含已知正确和错误的示例，用于验证评分准确性。`,
              name: `${name.trim()} — 测试数据集`,
              targetIds: [scorerId],
              targetType: "scorer",
            });
            setScorerDatasetId(dataset.id);

            // 3. Add test items to the dataset
            await batchInsertItems.mutateAsync({
              datasetId: dataset.id,
              items: testItems.map((item) => ({
                groundTruth: { expectedDirection: item.expectedDirection },
                input: { input: item.input, output: item.output },
                metadata: { label: item.label },
                source: { referenceId: "scorer-editor", type: "llm" as const },
              })),
            });
          }

          // Attach to agent
          const current = form.getValues("scorers") || {};
          form.setValue(
            "scorers",
            {
              ...current,
              [scorerId]: { sampling: undefined },
            },
            { shouldDirty: true },
          );
          onSaved?.(scorerId);
        }

        toast.success(
          `评分器已保存${testItems.length > 0 ? "，并已创建测试数据集。点击“运行测试”验证评分。" : "。"}`,
        );
      }
    } catch (error) {
      toast.error(`保存评分器失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsSaving(false);
    }
  }, [
    name,
    instructions,
    provider,
    model,
    scorerModel,
    scoreMin,
    scoreMax,
    testItems,
    scorerDatasetId,
    editScorerId,
    savedScorerId,
    createStoredScorer,
    updateStoredScorer,
    createDataset,
    batchInsertItems,
    batchDeleteItems,
    client,
    form,
    onSaved,
  ]);

  const handleRunTest = useCallback(async () => {
    if (!savedScorerId) {
      toast.error("请先保存评分器，再运行测试");
      return;
    }
    if (!scorerDatasetId) {
      toast.error("尚无测试数据集，请先添加条目并保存");
      return;
    }

    setIsRunningTest(true);
    setTestExperimentId(null);
    try {
      const result = await triggerExperiment.mutateAsync({
        datasetId: scorerDatasetId,
        targetId: savedScorerId,
        targetType: "scorer",
      });
      const expId = (result as { experimentId?: string })?.experimentId;
      if (expId) {
        setTestExperimentId(expId);
        toast.success("评分器测试已启动，结果将显示在下方");
      }
    } catch (error) {
      toast.error(`运行测试失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsRunningTest(false);
    }
  }, [savedScorerId, scorerDatasetId, triggerExperiment]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border1">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <Icon>
            <ArrowLeft />
          </Icon>
          返回
        </Button>
        <Txt as="h3" variant="header-sm" className="ml-2">
          {resolveConditional(
            isEditing,
            (conditionValue) => conditionValue,
            () => savedScorerId,
          )
            ? "编辑评分器"
            : "新建评分器"}
        </Txt>
        {resolveConditional(
          isEditing,
          (conditionValue) => conditionValue,
          () =>
            savedScorerId && (
              <Badge variant="success" className="ml-2">
                已保存
              </Badge>
            ),
        )}
      </div>

      <ScrollArea className="flex-1">
        {isLoadingScorer ? (
          <div className="flex items-center justify-center p-8">
            <Spinner className="mr-2" /> 正在加载评分器...
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Scorer Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input
                  placeholder="例如：相关性评分器"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={resolveConditional(
                    isEditing,
                    (conditionValue) => conditionValue,
                    () => !!savedScorerId,
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>模型</Label>
                <Input
                  placeholder="例如 openai/gpt-4o-mini"
                  value={
                    resolveConditional(
                      scorerModel,
                      (conditionValue) => conditionValue,
                      () => provider && model,
                    )
                      ? `${provider}/${model}`
                      : ""
                  }
                  onChange={(e) => setScorerModel(e.target.value)}
                />
                <Txt variant="ui-sm" className="text-icon3">
                  格式：提供商/模型（例如 openai/gpt-4o-mini）
                </Txt>
              </div>

              <div className="space-y-2">
                <Label>指令</Label>
                <Textarea
                  placeholder="描述此评分器应评估的内容，并明确说明怎样的响应算好或差..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="flex gap-4">
                <div className="space-y-2 flex-1">
                  <Label>最低分</Label>
                  <Input
                    type="number"
                    min={-1000}
                    max={1000}
                    step="any"
                    value={scoreMin}
                    onChange={(e) => setScoreMin(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2 flex-1">
                  <Label>最高分</Label>
                  <Input
                    type="number"
                    min={-1000}
                    max={1000}
                    step="any"
                    value={scoreMax}
                    onChange={(e) => setScoreMax(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Test Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Txt variant="ui-md" className="font-medium">
                    测试条目
                  </Txt>
                  <Txt variant="ui-sm" className="text-icon3 mt-0.5">
                    添加已知正确和错误的示例，以验证评分器
                  </Txt>
                  {resolveConditional(
                    scorerDatasetId,
                    () => (
                      <Txt variant="ui-xs" className="text-icon3 mt-1">
                        已关联数据集 · {testItems.length} 个条目
                      </Txt>
                    ),
                    () => null,
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={addTestItem}>
                  <Icon>
                    <Plus />
                  </Icon>
                  添加条目
                </Button>
              </div>

              {resolveConditional(
                testItems.length === 0,
                () => (
                  <div className="border border-dashed border-border1 rounded-lg p-6 text-center">
                    <Txt variant="ui-sm" className="text-icon3">
                      尚无测试条目。添加带有预期评分方向的条目，以验证评分器是否正常工作。
                    </Txt>
                  </div>
                ),
                () => null,
              )}

              {testItems.map((item, index) => {
                // Find matching experiment result for this item
                const matchingResult = experimentResults[index];
                const resultScore = matchingResult?.output
                  ? (matchingResult.output as { score?: number })?.score
                  : null;
                const resultReason = matchingResult?.output
                  ? (matchingResult.output as { reason?: string })?.reason
                  : null;
                const resultError = matchingResult?.error;

                let isCorrectDirection: boolean | null = null;
                if (typeof resultScore === "number") {
                  isCorrectDirection =
                    item.expectedDirection === "high"
                      ? resultScore >= (scoreMax - scoreMin) / 2 + scoreMin
                      : resultScore < (scoreMax - scoreMin) / 2 + scoreMin;
                }
                const formattedScore =
                  typeof resultScore === "number" ? resultScore.toFixed(3) : "—";

                return (
                  <div
                    key={index}
                    className={cn(
                      "border border-border1 rounded-lg p-3 space-y-3",
                      resolveConditional(
                        isCorrectDirection === true,
                        () => "border-success/50 bg-success/5",
                        () => null,
                      ),
                      resolveConditional(
                        isCorrectDirection === false,
                        () => "border-error/50 bg-error/5",
                        () => null,
                      ),
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Txt variant="ui-sm" className="font-medium">
                          条目 {index + 1}
                        </Txt>
                        {resolveConditional(
                          item.label,
                          (conditionValue) => (
                            <Badge variant="default">{conditionValue}</Badge>
                          ),
                          () => null,
                        )}
                        <button
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                            item.expectedDirection === "high"
                              ? "bg-success/20 text-success"
                              : "bg-error/20 text-error",
                          )}
                          onClick={() =>
                            updateTestItem(
                              index,
                              "expectedDirection",
                              item.expectedDirection === "high" ? "low" : "high",
                            )
                          }
                        >
                          应获得{item.expectedDirection === "high" ? "高分" : "低分"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {resolveConditional(
                          isCorrectDirection !== null,
                          () => (
                            <Icon className={isCorrectDirection ? "text-success" : "text-error"}>
                              {isCorrectDirection ? <CheckCircle2 /> : <XCircle />}
                            </Icon>
                          ),
                          () => null,
                        )}
                        <Button variant="ghost" size="sm" onClick={() => removeTestItem(index)}>
                          <Icon>
                            <Trash2 />
                          </Icon>
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Txt variant="ui-xs" className="text-icon3 font-medium">
                          输入
                        </Txt>
                        <Textarea
                          placeholder="用户的问题或输入..."
                          value={
                            typeof item.input === "string"
                              ? item.input
                              : JSON.stringify(item.input, null, 2)
                          }
                          onChange={(e) => updateTestItem(index, "input", e.target.value)}
                          rows={3}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Txt variant="ui-xs" className="text-icon3 font-medium">
                          输出（智能体响应）
                        </Txt>
                        <Textarea
                          placeholder="智能体的响应..."
                          value={
                            typeof item.output === "string"
                              ? item.output
                              : JSON.stringify(item.output, null, 2)
                          }
                          onChange={(e) => updateTestItem(index, "output", e.target.value)}
                          rows={3}
                          className="text-sm"
                        />
                      </div>
                    </div>

                    {/* Test result for this item */}
                    {resolveConditional(
                      typeof resultScore === "number" || resultError,
                      () => (
                        <div className="flex items-center gap-3 pt-2 border-t border-border1">
                          {resultError ? (
                            <div className="flex items-center gap-1.5 text-error">
                              <Icon size="sm">
                                <AlertCircle />
                              </Icon>
                              <Txt variant="ui-xs">错误：{String(resultError)}</Txt>
                            </div>
                          ) : (
                            <>
                              <Txt variant="ui-sm" className="font-mono font-medium">
                                得分：{formattedScore}
                              </Txt>
                              {resultReason && (
                                <Txt variant="ui-xs" className="text-icon3 truncate flex-1">
                                  {resultReason}
                                </Txt>
                              )}
                            </>
                          )}
                        </div>
                      ),
                      () => null,
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary of test results */}
            {resolveConditional(
              experimentResults.length > 0,
              () => (
                <div className="border border-border1 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Txt variant="ui-sm" className="font-medium">
                      测试结果：
                    </Txt>
                    {(() => {
                      let correct = 0;
                      let incorrect = 0;
                      let errors = 0;
                      for (const [index, result] of experimentResults.entries()) {
                        const item = testItems[index];
                        if (!item) {
                          continue;
                        }
                        if (result.error) {
                          errors += 1;
                          continue;
                        }
                        const score = (result.output as { score?: number })?.score;
                        if (score === null || score === undefined) {
                          continue;
                        }
                        const mid = (scoreMax - scoreMin) / 2 + scoreMin;
                        const isCorrect =
                          item.expectedDirection === "high" ? score >= mid : score < mid;
                        if (isCorrect) {
                          correct += 1;
                        } else {
                          incorrect += 1;
                        }
                      }
                      return (
                        <>
                          {correct > 0 && <Badge variant="success">{correct} 个正确</Badge>}
                          {incorrect > 0 && <Badge variant="error">{incorrect} 个错误</Badge>}
                          {errors > 0 && <Badge variant="default">{errors} 个异常</Badge>}
                        </>
                      );
                    })()}
                  </div>
                  <Txt variant="ui-xs" className="text-icon3 mt-1">
                    {experimentResults.length < testItems.length
                      ? "仍在处理中..."
                      : "所有条目均已评分。可调整指令并重新运行，以提高准确性。"}
                  </Txt>
                </div>
              ),
              () => null,
            )}
          </div>
        )}
      </ScrollArea>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border1">
        {resolveConditional(
          isEditing,
          () => (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !instructions.trim()}
              >
                {isSaving ? (
                  <Spinner className="mr-1.5" />
                ) : (
                  <Icon>
                    <Save />
                  </Icon>
                )}
                保存更改
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleRunTest}
                disabled={isRunningTest || testItems.length === 0}
              >
                {isRunningTest ? (
                  <Spinner className="mr-1.5" />
                ) : (
                  <Icon>
                    <Play />
                  </Icon>
                )}
                运行测试
              </Button>
            </>
          ),
          () =>
            isTruthy(!savedScorerId) ? (
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !name.trim() || !instructions.trim()}
              >
                {isSaving ? (
                  <Spinner className="mr-1.5" />
                ) : (
                  <Icon>
                    <Save />
                  </Icon>
                )}
                {testItems.length > 0 ? "保存并创建测试数据集" : "保存并关联"}
              </Button>
            ) : (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleRunTest}
                  disabled={isRunningTest || testItems.length === 0}
                >
                  {isRunningTest ? (
                    <Spinner className="mr-1.5" />
                  ) : (
                    <Icon>
                      <Play />
                    </Icon>
                  )}
                  运行测试
                </Button>
                <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Spinner className="mr-1.5" /> : null}
                  更新并重新保存
                </Button>
              </>
            ),
        )}
        <Button variant="ghost" size="sm" onClick={onBack} className="ml-auto">
          {resolveConditional(
            isEditing,
            (conditionValue) => conditionValue,
            () => savedScorerId,
          )
            ? "完成"
            : "取消"}
        </Button>
      </div>
    </div>
  );
}
