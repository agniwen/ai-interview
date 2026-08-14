import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@mastra/playground-ui/components/Collapsible";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import { Switch } from "@mastra/playground-ui/components/Switch";
import { MemoryIcon } from "@mastra/playground-ui/icons/MemoryIcon";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormSetValue, Control } from "react-hook-form";

import type { AgentFormValues } from "../utils/form-validation";
import { SectionTitle } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-title";
import { useEmbedders } from "@/components/features/mastra-studio/upstream/domains/embedders/hooks/use-embedders";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";
import { useVectors } from "@/components/features/mastra-studio/upstream/domains/vectors/hooks/use-vectors";
import { resolveConditional } from "../../../utils/conditional";

interface MemorySectionProps {
  control: Control<AgentFormValues>;
  setValue: UseFormSetValue<AgentFormValues>;
  readOnly?: boolean;
}

export function MemorySection({ control, setValue, readOnly = false }: MemorySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isObserverOpen, setIsObserverOpen] = useState(false);
  const [isReflectorOpen, setIsReflectorOpen] = useState(false);
  const memoryConfig = useWatch({ control, name: "memory" });
  const isEnabled = memoryConfig?.enabled ?? false;
  const semanticRecallEnabled = memoryConfig?.semanticRecall ?? false;
  const observationalMemoryEnabled = memoryConfig?.observationalMemory?.enabled ?? false;
  const omProvider = useWatch({ control, name: "memory.observationalMemory.model.provider" }) ?? "";
  const observerProvider =
    useWatch({ control, name: "memory.observationalMemory.observation.model.provider" }) ?? "";
  const reflectorProvider =
    useWatch({ control, name: "memory.observationalMemory.reflection.model.provider" }) ?? "";

  const { data: vectorsData } = useVectors();
  const { data: embeddersData } = useEmbedders();
  const vectors = vectorsData?.vectors ?? [];
  const embedders = embeddersData?.embedders ?? [];

  return (
    <div className="rounded-md border border-border1 bg-surface2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 w-full p-3 bg-surface3">
          <ChevronRight className="h-4 w-4 text-neutral3" />
          <SectionTitle icon={<MemoryIcon className="text-neutral3" />}>
            记忆
            {resolveConditional(
              isEnabled,
              () => (
                <span className="text-accent1 font-normal">（已启用）</span>
              ),
              () => null,
            )}
          </SectionTitle>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 border-t border-border1 flex flex-col gap-4">
            <Controller
              name="memory.enabled"
              control={control}
              render={({ field }) => (
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="memory-enabled" className="text-sm text-neutral5">
                      启用记忆
                    </Label>
                    <span className="text-xs text-neutral3">存储和检索对话历史</span>
                  </div>
                  <Switch
                    id="memory-enabled"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                  />
                </div>
              )}
            />

            {resolveConditional(
              isEnabled,
              () => (
                <>
                  <Controller
                    name="memory.lastMessages"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="memory-last-messages" className="text-xs text-neutral4">
                          最近消息
                        </Label>
                        <span className="text-xs text-neutral3">
                          要包含在上下文中的最近消息数量
                        </span>
                        <Input
                          id="memory-last-messages"
                          type="number"
                          min="1"
                          step="1"
                          value={field.value === false ? "" : (field.value ?? 40)}
                          onChange={(e) => {
                            const { value } = e.target;
                            field.onChange(value === "" ? false : Number.parseInt(value, 10));
                          }}
                          placeholder="40"
                          className="bg-surface3"
                          disabled={readOnly}
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="memory.semanticRecall"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <Label htmlFor="memory-semantic-recall" className="text-sm text-neutral5">
                            语义召回
                          </Label>
                          <span className="text-xs text-neutral3">在记忆中启用语义搜索</span>
                        </div>
                        <Switch
                          id="memory-semantic-recall"
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          disabled={readOnly}
                        />
                      </div>
                    )}
                  />

                  {semanticRecallEnabled && (
                    <>
                      <Controller
                        name="memory.vector"
                        control={control}
                        render={({ field }) => (
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="memory-vector" className="text-xs text-neutral4">
                              向量存储
                            </Label>
                            <span className="text-xs text-neutral3">
                              选择用于语义搜索的向量存储
                            </span>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                              disabled={readOnly}
                            >
                              <SelectTrigger id="memory-vector" className="bg-surface3">
                                <SelectValue placeholder="选择向量存储" />
                              </SelectTrigger>
                              <SelectContent>
                                {vectors.map((vector) => (
                                  <SelectItem key={vector.id} value={vector.id}>
                                    {vector.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      />

                      <Controller
                        name="memory.embedder"
                        control={control}
                        render={({ field }) => (
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="memory-embedder" className="text-xs text-neutral4">
                              嵌入模型
                            </Label>
                            <span className="text-xs text-neutral3">
                              选择用于语义搜索的嵌入模型
                            </span>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                              disabled={readOnly}
                            >
                              <SelectTrigger id="memory-embedder" className="bg-surface3">
                                <SelectValue placeholder="选择嵌入模型" />
                              </SelectTrigger>
                              <SelectContent>
                                {embedders.map((embedder) => (
                                  <SelectItem key={embedder.id} value={embedder.id}>
                                    {embedder.name} ({embedder.provider})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      />
                    </>
                  )}

                  <Controller
                    name="memory.readOnly"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <Label htmlFor="memory-read-only" className="text-sm text-neutral5">
                            只读
                          </Label>
                          <span className="text-xs text-neutral3">
                            记忆为只读（不会存储新消息）
                          </span>
                        </div>
                        <Switch
                          id="memory-read-only"
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          disabled={readOnly}
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="memory.observationalMemory.enabled"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <Label htmlFor="memory-observational" className="text-sm text-neutral5">
                            观测记忆
                          </Label>
                          <span className="text-xs text-neutral3">
                            自动观测并反思对话，以建立长期记忆
                          </span>
                        </div>
                        <Switch
                          id="memory-observational"
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          disabled={readOnly}
                        />
                      </div>
                    )}
                  />

                  {observationalMemoryEnabled && (
                    <div className="ml-2 pl-3 border-l-2 border-border1 flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-neutral4">提供商</Label>
                        <span className="text-xs text-neutral3">
                          观测器和反思器智能体使用的提供商
                        </span>
                        <Controller
                          name="memory.observationalMemory.model.provider"
                          control={control}
                          render={({ field }) => (
                            <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                              <LLMProviders
                                value={field.value ?? ""}
                                onValueChange={(v) => {
                                  field.onChange(v);
                                  setValue("memory.observationalMemory.model.name", "");
                                }}
                              />
                            </div>
                          )}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-neutral4">模型</Label>
                        <span className="text-xs text-neutral3">
                          观测器和反思器智能体使用的模型
                        </span>
                        <Controller
                          name="memory.observationalMemory.model.name"
                          control={control}
                          render={({ field }) => (
                            <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                              <LLMModels
                                value={field.value ?? ""}
                                onValueChange={field.onChange}
                                llmId={omProvider}
                              />
                            </div>
                          )}
                        />
                      </div>

                      <Controller
                        name="memory.observationalMemory.scope"
                        control={control}
                        render={({ field }) => (
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="memory-om-scope" className="text-xs text-neutral4">
                              作用域
                            </Label>
                            <span className="text-xs text-neutral3">
                              观测内容是按会话隔离，还是在同一资源的所有会话间共享
                            </span>
                            <Select
                              value={field.value ?? "thread"}
                              onValueChange={field.onChange}
                              disabled={readOnly}
                            >
                              <SelectTrigger id="memory-om-scope" className="bg-surface3">
                                <SelectValue placeholder="选择作用域" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="thread">会话</SelectItem>
                                <SelectItem value="resource">资源</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      />

                      <Controller
                        name="memory.observationalMemory.shareTokenBudget"
                        control={control}
                        render={({ field }) => (
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                              <Label
                                htmlFor="memory-om-share-budget"
                                className="text-sm text-neutral5"
                              >
                                共享 Token 预算
                              </Label>
                              <span className="text-xs text-neutral3">
                                在观测和反思之间共享 Token 预算
                              </span>
                            </div>
                            <Switch
                              id="memory-om-share-budget"
                              checked={field.value ?? false}
                              onCheckedChange={field.onChange}
                              disabled={readOnly}
                            />
                          </div>
                        )}
                      />

                      {/* Observer Configuration */}
                      <Collapsible open={isObserverOpen} onOpenChange={setIsObserverOpen}>
                        <CollapsibleTrigger className="flex items-center gap-1 w-full">
                          <ChevronRight
                            className={`h-3 w-3 text-neutral3 transition-transform ${isObserverOpen ? "rotate-90" : ""}`}
                          />
                          <Label className="text-sm text-neutral5 cursor-pointer">观测器</Label>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-2 pl-3 border-l-2 border-border1 mt-2 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs text-neutral4">提供商覆盖</Label>
                              <span className="text-xs text-neutral3">
                                覆盖观测器的默认模型提供商
                              </span>
                              <Controller
                                name="memory.observationalMemory.observation.model.provider"
                                control={control}
                                render={({ field }) => (
                                  <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                                    <LLMProviders
                                      value={field.value ?? ""}
                                      onValueChange={(v) => {
                                        field.onChange(v);
                                        setValue(
                                          "memory.observationalMemory.observation.model.name",
                                          "",
                                        );
                                      }}
                                    />
                                  </div>
                                )}
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs text-neutral4">模型覆盖</Label>
                              <span className="text-xs text-neutral3">覆盖观测器的默认模型</span>
                              <Controller
                                name="memory.observationalMemory.observation.model.name"
                                control={control}
                                render={({ field }) => (
                                  <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                                    <LLMModels
                                      value={field.value ?? ""}
                                      onValueChange={field.onChange}
                                      llmId={observerProvider}
                                    />
                                  </div>
                                )}
                              />
                            </div>

                            <Controller
                              name="memory.observationalMemory.observation.messageTokens"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-obs-msg-tokens"
                                    className="text-xs text-neutral4"
                                  >
                                    消息 Token 数
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    触发观测的未观测消息 Token 数（默认：30000）
                                  </span>
                                  <Input
                                    id="memory-om-obs-msg-tokens"
                                    type="number"
                                    min="1"
                                    step="1000"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? undefined : Number.parseInt(v, 10));
                                    }}
                                    placeholder="30000"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />

                            <Controller
                              name="memory.observationalMemory.observation.maxTokensPerBatch"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-obs-batch"
                                    className="text-xs text-neutral4"
                                  >
                                    每批最大 Token 数
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    观测多个会话时每批的最大 Token 数（默认：10000）
                                  </span>
                                  <Input
                                    id="memory-om-obs-batch"
                                    type="number"
                                    min="1"
                                    step="1000"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? undefined : Number.parseInt(v, 10));
                                    }}
                                    placeholder="10000"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />

                            <Controller
                              name="memory.observationalMemory.observation.bufferTokens"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-obs-buffer"
                                    className="text-xs text-neutral4"
                                  >
                                    缓冲 Token 数
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    异步缓冲的 Token 间隔（messageTokens 的比例或绝对数量；
                                    留空使用默认值 0.2，设为 0 则停用）
                                  </span>
                                  <Input
                                    id="memory-om-obs-buffer"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={field.value === false ? "0" : (field.value ?? "")}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v === "" || v === undefined) {
                                        field.onChange();
                                      } else {
                                        const n = Number.parseFloat(v);
                                        field.onChange(n === 0 ? false : n);
                                      }
                                    }}
                                    placeholder="0.2"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />

                            <Controller
                              name="memory.observationalMemory.observation.bufferActivation"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-obs-buf-act"
                                    className="text-xs text-neutral4"
                                  >
                                    缓冲区激活比例
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    激活缓冲观测内容的比例（0–1，默认：0.8）
                                  </span>
                                  <Input
                                    id="memory-om-obs-buf-act"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? undefined : Number.parseFloat(v));
                                    }}
                                    placeholder="0.8"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />

                            <Controller
                              name="memory.observationalMemory.observation.blockAfter"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-obs-block"
                                    className="text-xs text-neutral4"
                                  >
                                    阻塞阈值
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    同步阻塞的倍数或绝对 Token 数（默认：1.2）
                                  </span>
                                  <Input
                                    id="memory-om-obs-block"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? undefined : Number.parseFloat(v));
                                    }}
                                    placeholder="1.2"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Reflector Configuration */}
                      <Collapsible open={isReflectorOpen} onOpenChange={setIsReflectorOpen}>
                        <CollapsibleTrigger className="flex items-center gap-1 w-full">
                          <ChevronRight
                            className={`h-3 w-3 text-neutral3 transition-transform ${isReflectorOpen ? "rotate-90" : ""}`}
                          />
                          <Label className="text-sm text-neutral5 cursor-pointer">反思器</Label>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-2 pl-3 border-l-2 border-border1 mt-2 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs text-neutral4">提供商覆盖</Label>
                              <span className="text-xs text-neutral3">
                                覆盖反思器的默认模型提供商
                              </span>
                              <Controller
                                name="memory.observationalMemory.reflection.model.provider"
                                control={control}
                                render={({ field }) => (
                                  <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                                    <LLMProviders
                                      value={field.value ?? ""}
                                      onValueChange={(v) => {
                                        field.onChange(v);
                                        setValue(
                                          "memory.observationalMemory.reflection.model.name",
                                          "",
                                        );
                                      }}
                                    />
                                  </div>
                                )}
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs text-neutral4">模型覆盖</Label>
                              <span className="text-xs text-neutral3">覆盖反思器的默认模型</span>
                              <Controller
                                name="memory.observationalMemory.reflection.model.name"
                                control={control}
                                render={({ field }) => (
                                  <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                                    <LLMModels
                                      value={field.value ?? ""}
                                      onValueChange={field.onChange}
                                      llmId={reflectorProvider}
                                    />
                                  </div>
                                )}
                              />
                            </div>

                            <Controller
                              name="memory.observationalMemory.reflection.observationTokens"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-ref-obs-tokens"
                                    className="text-xs text-neutral4"
                                  >
                                    观测内容 Token 数
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    触发反思的观测内容 Token 数（默认：40000）
                                  </span>
                                  <Input
                                    id="memory-om-ref-obs-tokens"
                                    type="number"
                                    min="1"
                                    step="1000"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? undefined : Number.parseInt(v, 10));
                                    }}
                                    placeholder="40000"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />

                            <Controller
                              name="memory.observationalMemory.reflection.blockAfter"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-ref-block"
                                    className="text-xs text-neutral4"
                                  >
                                    阻塞阈值
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    同步阻塞的倍数或绝对 Token 数（默认：1.2）
                                  </span>
                                  <Input
                                    id="memory-om-ref-block"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? undefined : Number.parseFloat(v));
                                    }}
                                    placeholder="1.2"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />

                            <Controller
                              name="memory.observationalMemory.reflection.bufferActivation"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col gap-1.5">
                                  <Label
                                    htmlFor="memory-om-ref-buf-act"
                                    className="text-xs text-neutral4"
                                  >
                                    缓冲区激活比例
                                  </Label>
                                  <span className="text-xs text-neutral3">
                                    控制异步反思缓冲何时开始的比例（0–1）
                                  </span>
                                  <Input
                                    id="memory-om-ref-buf-act"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      field.onChange(v === "" ? undefined : Number.parseFloat(v));
                                    }}
                                    placeholder="0.8"
                                    className="bg-surface3"
                                    disabled={readOnly}
                                  />
                                </div>
                              )}
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                </>
              ),
              () => null,
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
