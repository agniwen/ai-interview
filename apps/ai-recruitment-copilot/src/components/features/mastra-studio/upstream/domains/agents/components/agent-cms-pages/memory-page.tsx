import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import {
  Entity,
  EntityContent,
  EntityName,
  EntityDescription,
} from "@mastra/playground-ui/components/Entity";
import { Input } from "@mastra/playground-ui/components/Input";
import { Label } from "@mastra/playground-ui/components/Label";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import { Switch } from "@mastra/playground-ui/components/Switch";
import { MemoryIcon } from "@mastra/playground-ui/icons/MemoryIcon";
import { Controller, useWatch } from "react-hook-form";

import { useAgentEditFormContext } from "../../context/agent-edit-form-context";
import {
  SectionHeader,
  SubSectionHeader,
} from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";
import { useEmbedders } from "@/components/features/mastra-studio/upstream/domains/embedders/hooks/use-embedders";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";
import { useVectors } from "@/components/features/mastra-studio/upstream/domains/vectors/hooks/use-vectors";

function ReflectorFields({ reflectorProvider }: { reflectorProvider: string }) {
  const { form, readOnly } = useAgentEditFormContext();
  const { control, setValue } = form;

  return (
    <div className="flex flex-col gap-4">
      <SubSectionHeader title="反思器" />
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">提供商覆盖</Label>
          <span className="text-xs text-neutral2">覆盖反思器的默认模型提供商</span>
          <Controller
            name="memory.observationalMemory.reflection.model.provider"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                <LLMProviders
                  value={field.value ?? ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setValue("memory.observationalMemory.reflection.model.name", "", {
                      shouldDirty: true,
                    });
                  }}
                />
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">模型覆盖</Label>
          <span className="text-xs text-neutral2">覆盖反思器的默认模型</span>
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
              <Label htmlFor="memory-om-ref-obs-tokens" className="text-sm text-neutral5">
                观测内容 Token 数
              </Label>
              <span className="text-xs text-neutral2">
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
              <Label htmlFor="memory-om-ref-block" className="text-sm text-neutral5">
                阻塞阈值
              </Label>
              <span className="text-xs text-neutral2">
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
              <Label htmlFor="memory-om-ref-buf-act" className="text-sm text-neutral5">
                缓冲区激活比例
              </Label>
              <span className="text-xs text-neutral2">控制异步反思缓冲何时开始的比例（0–1）</span>
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
    </div>
  );
}

function ObserverFields({ observerProvider }: { observerProvider: string }) {
  const { form, readOnly } = useAgentEditFormContext();
  const { control, setValue } = form;

  return (
    <div className="flex flex-col gap-4">
      <SubSectionHeader title="观测器" />
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">提供商覆盖</Label>
          <span className="text-xs text-neutral2">覆盖观测器的默认模型提供商</span>
          <Controller
            name="memory.observationalMemory.observation.model.provider"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                <LLMProviders
                  value={field.value ?? ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setValue("memory.observationalMemory.observation.model.name", "", {
                      shouldDirty: true,
                    });
                  }}
                />
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">模型覆盖</Label>
          <span className="text-xs text-neutral2">覆盖观测器的默认模型</span>
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
              <Label htmlFor="memory-om-obs-msg-tokens" className="text-sm text-neutral5">
                消息 Token 数
              </Label>
              <span className="text-xs text-neutral2">
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
              <Label htmlFor="memory-om-obs-batch" className="text-sm text-neutral5">
                每批最大 Token 数
              </Label>
              <span className="text-xs text-neutral2">
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
              <Label htmlFor="memory-om-obs-buffer" className="text-sm text-neutral5">
                缓冲 Token 数
              </Label>
              <span className="text-xs text-neutral2">
                异步缓冲的 Token 间隔（messageTokens 的比例或绝对数量；留空使用默认值 0.2， 设为 0
                则停用）
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
              <Label htmlFor="memory-om-obs-buf-act" className="text-sm text-neutral5">
                缓冲区激活比例
              </Label>
              <span className="text-xs text-neutral2">
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
              <Label htmlFor="memory-om-obs-block" className="text-sm text-neutral5">
                阻塞阈值
              </Label>
              <span className="text-xs text-neutral2">
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
    </div>
  );
}

function ObservationalMemoryFields() {
  const { form, readOnly } = useAgentEditFormContext();
  const { control, setValue } = form;
  const omProvider = useWatch({ control, name: "memory.observationalMemory.model.provider" }) ?? "";
  const observerProvider =
    useWatch({ control, name: "memory.observationalMemory.observation.model.provider" }) ?? "";
  const reflectorProvider =
    useWatch({ control, name: "memory.observationalMemory.reflection.model.provider" }) ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">提供商</Label>
          <span className="text-xs text-neutral2">观测器和反思器智能体使用的提供商</span>
          <Controller
            name="memory.observationalMemory.model.provider"
            control={control}
            render={({ field }) => (
              <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                <LLMProviders
                  value={field.value ?? ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setValue("memory.observationalMemory.model.name", "", { shouldDirty: true });
                  }}
                />
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm text-neutral5">模型</Label>
          <span className="text-xs text-neutral2">观测器和反思器智能体使用的模型</span>
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
              <Label htmlFor="memory-om-scope" className="text-sm text-neutral5">
                作用域
              </Label>
              <span className="text-xs text-neutral2">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-om-share-budget" className="text-sm text-neutral5">
                共享 Token 预算
              </Label>
              <span className="text-xs text-neutral2">在观测和反思之间共享 Token 预算</span>
              <Switch
                id="memory-om-share-budget"
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                disabled={readOnly}
              />
            </div>
          )}
        />
      </div>

      <div className="border-t border-border1 pt-4 mt-2">
        <ObserverFields observerProvider={observerProvider} />
      </div>
      <div className="border-t border-border1 pt-4 mt-2">
        <ReflectorFields reflectorProvider={reflectorProvider} />
      </div>
    </div>
  );
}

function ObservationalMemoryEntity() {
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const observationalMemoryEnabled =
    useWatch({ control, name: "memory.observationalMemory.enabled" }) ?? false;

  return (
    <Entity className="flex-col gap-0 p-0 overflow-hidden">
      <div className="flex gap-3 py-3 px-4">
        <EntityContent>
          <EntityName>观测记忆</EntityName>
          <EntityDescription>自动观测并反思对话，以建立长期记忆</EntityDescription>
        </EntityContent>

        {!readOnly && (
          <Controller
            name="memory.observationalMemory.enabled"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value ?? false}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  if (checked) {
                    form.setValue("memory.lastMessages", false, { shouldDirty: true });
                  }
                }}
              />
            )}
          />
        )}
      </div>

      {observationalMemoryEnabled && (
        <div className="bg-surface2 border-t border-border1 p-4">
          <ObservationalMemoryFields />
        </div>
      )}
    </Entity>
  );
}

function ReadOnlyEntity() {
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;

  return (
    <Entity>
      <EntityContent>
        <EntityName>只读</EntityName>
        <EntityDescription>记忆为只读状态（不会存储新消息）</EntityDescription>
      </EntityContent>

      {!readOnly && (
        <Controller
          name="memory.readOnly"
          control={control}
          render={({ field }) => (
            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
          )}
        />
      )}
    </Entity>
  );
}

function SemanticRecallEntity() {
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const semanticRecallEnabled = useWatch({ control, name: "memory.semanticRecall" }) ?? false;

  const { data: vectorsData } = useVectors();
  const { data: embeddersData } = useEmbedders();
  const vectors = vectorsData?.vectors ?? [];
  const embedders = embeddersData?.embedders ?? [];

  return (
    <Entity className="flex-col gap-0 p-0 overflow-hidden">
      <div className="flex gap-3 py-3 px-4">
        <EntityContent>
          <EntityName>语义召回</EntityName>
          <EntityDescription>在记忆中启用语义搜索</EntityDescription>
        </EntityContent>

        {!readOnly && (
          <Controller
            name="memory.semanticRecall"
            control={control}
            render={({ field }) => (
              <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
            )}
          />
        )}
      </div>

      {semanticRecallEnabled && (
        <div className="bg-surface2 border-t border-border1 p-4 grid grid-cols-2 gap-4">
          <Controller
            name="memory.vector"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="memory-vector" className="text-sm text-neutral5">
                  向量存储
                </Label>
                <span className="text-xs text-neutral2">选择用于语义搜索的向量存储</span>
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
                <Label htmlFor="memory-embedder" className="text-sm text-neutral5">
                  嵌入模型
                </Label>
                <span className="text-xs text-neutral2">选择用于语义搜索的嵌入模型</span>
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
        </div>
      )}
    </Entity>
  );
}

function LastMessagesEntity() {
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const lastMessages = useWatch({ control, name: "memory.lastMessages" });
  const lastMessagesEnabled = lastMessages !== false;

  return (
    <Entity className="flex-col gap-0 p-0 overflow-hidden">
      <div className="flex gap-3 py-3 px-4">
        <EntityContent>
          <EntityName>消息历史</EntityName>
          <EntityDescription>要包含在上下文中的最近消息数量</EntityDescription>
        </EntityContent>

        {!readOnly && (
          <Controller
            name="memory.lastMessages"
            control={control}
            render={({ field }) => (
              <Switch
                checked={lastMessagesEnabled}
                onCheckedChange={(checked) => {
                  field.onChange(checked ? 40 : false);
                  if (checked) {
                    form.setValue("memory.observationalMemory.enabled", false, {
                      shouldDirty: true,
                    });
                  }
                }}
              />
            )}
          />
        )}
      </div>

      {lastMessagesEnabled && (
        <div className="bg-surface2 border-t border-border1 p-4">
          <Controller
            name="memory.lastMessages"
            control={control}
            render={({ field }) => (
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
            )}
          />
        </div>
      )}
    </Entity>
  );
}

export function MemoryPage() {
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;
  const isEnabled = useWatch({ control, name: "memory.enabled" }) ?? false;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <SectionHeader title="记忆" subtitle="配置用于保存对话和语义召回的记忆设置。" />
          {!readOnly && isEnabled && (
            <Controller
              name="memory.enabled"
              control={control}
              render={({ field }) => (
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              )}
            />
          )}
        </div>

        {!isEnabled && (
          <div className="py-12">
            <EmptyState
              iconSlot={<MemoryIcon height={40} width={40} />}
              titleSlot="未启用记忆"
              descriptionSlot="启用记忆以存储对话历史；可添加语义召回来检索相关内容，或使用观测记忆进行长期学习。"
              actionSlot={
                !readOnly && (
                  <Controller
                    name="memory.enabled"
                    control={control}
                    render={({ field }) => (
                      <Button variant="default" size="sm" onClick={() => field.onChange(true)}>
                        启用记忆
                      </Button>
                    )}
                  />
                )
              }
            />
          </div>
        )}

        {isEnabled && (
          <div className="flex flex-col gap-2">
            <ObservationalMemoryEntity />
            <LastMessagesEntity />
            <SemanticRecallEntity />
            <ReadOnlyEntity />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
