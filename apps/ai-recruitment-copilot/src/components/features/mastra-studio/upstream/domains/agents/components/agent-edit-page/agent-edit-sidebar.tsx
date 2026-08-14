import { Button } from "@mastra/playground-ui/components/Button";
import { Input } from "@mastra/playground-ui/components/Input";
import {
  JSONSchemaForm,
  jsonSchemaToFields,
} from "@mastra/playground-ui/components/JSONSchemaForm";
import type { SchemaField } from "@mastra/playground-ui/components/JSONSchemaForm";
import { Label } from "@mastra/playground-ui/components/Label";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Tabs, TabList, Tab, TabContent } from "@mastra/playground-ui/components/Tabs";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { VariablesIcon } from "@mastra/playground-ui/icons/VariablesIcon";
import type { JsonSchema } from "@mastra/playground-ui/utils/json-schema";
import { Check, PlusIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { RefObject } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";

import { AgentsSection } from "./sections/agents-section";
import { MemorySection } from "./sections/memory-section";
import { ScorersSection } from "./sections/scorers-section";
import { ToolsSection } from "./sections/tools-section";
import { WorkflowsSection } from "./sections/workflows-section";
import type { AgentFormValues } from "./utils/form-validation";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";
import { resolveConditional } from "../../utils/conditional";

function RecursiveFieldRenderer({
  field,
  parentPath,
  depth,
}: {
  field: SchemaField;
  parentPath: string[];
  depth: number;
}) {
  return (
    <div className="py-2 border-border1 border-l-4 border-b">
      <JSONSchemaForm.Field key={field.id} field={field} parentPath={parentPath} depth={depth}>
        <div className="space-y-2 px-2">
          <div className="flex flex-row gap-2 items-center">
            <JSONSchemaForm.FieldName
              labelIsHidden
              placeholder="变量名称"
              size="md"
              className="[&_input]:bg-surface3 w-full"
            />

            <JSONSchemaForm.FieldType
              placeholder="类型"
              size="md"
              className="[&_button]:bg-surface3 w-full"
            />
            <JSONSchemaForm.FieldRemove variant="default" className="shrink-0" />
          </div>

          <div className="flex flex-row gap-2 items-center">
            <JSONSchemaForm.FieldOptional />
            <JSONSchemaForm.FieldNullable />
          </div>
        </div>

        <JSONSchemaForm.NestedFields className="pl-2">
          <JSONSchemaForm.FieldList>
            {(nestedField, _idx, nestedContext) => (
              <RecursiveFieldRenderer
                key={nestedField.id}
                field={nestedField}
                parentPath={nestedContext.parentPath}
                depth={nestedContext.depth}
              />
            )}
          </JSONSchemaForm.FieldList>
          <JSONSchemaForm.AddField variant="ghost" size="sm" className="mt-2">
            <PlusIcon className="w-3 h-3 mr-1" />
            添加嵌套变量
          </JSONSchemaForm.AddField>
        </JSONSchemaForm.NestedFields>
      </JSONSchemaForm.Field>
    </div>
  );
}

interface AgentEditSidebarProps {
  form: UseFormReturn<AgentFormValues>;
  currentAgentId?: string;
  onPublish: () => void;
  isSubmitting?: boolean;
  formRef?: RefObject<HTMLFormElement | null>;
  mode?: "create" | "edit";
  readOnly?: boolean;
}

export function AgentEditSidebar({
  form,
  currentAgentId,
  onPublish,
  isSubmitting = false,
  formRef,
  mode = "create",
  readOnly = false,
}: AgentEditSidebarProps) {
  const {
    register,
    control,
    formState: { errors },
  } = form;

  const watchedVariables = useWatch({ control, name: "variables" });

  const handleVariablesChange = useCallback(
    (schema: JsonSchema) => {
      form.setValue("variables", schema, { shouldDirty: true });
    },
    [form],
  );

  const initialFields = useMemo(() => jsonSchemaToFields(watchedVariables), [watchedVariables]);

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultTab="identity" className="flex-1 min-h-0 flex flex-col">
        <TabList className="shrink-0">
          <Tab value="identity">
            <Icon size="sm">
              <AgentIcon />
            </Icon>
            身份
          </Tab>
          <Tab value="capabilities">
            <Icon size="sm">
              <ToolsIcon />
            </Icon>
            能力
          </Tab>

          <Tab value="variables">
            <Icon size="sm">
              <VariablesIcon />
            </Icon>
            变量
          </Tab>
        </TabList>

        <TabContent value="identity" className="flex-1 min-h-0 py-0 pb-3">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-6 p-4">
              <SectionHeader title="身份信息" subtitle="定义智能体的名称、描述和模型。" />

              {/* Agent Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="agent-name" className="text-xs text-icon5">
                  名称 <span className="text-accent2">*</span>
                </Label>
                <Input
                  id="agent-name"
                  placeholder="我的智能体"
                  className="bg-surface3"
                  {...register("name")}
                  error={!!errors.name}
                  disabled={readOnly}
                />
                {resolveConditional(
                  errors.name,
                  (conditionValue) => (
                    <span className="text-xs text-accent2">{conditionValue.message}</span>
                  ),
                  () => null,
                )}
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="agent-description" className="text-xs text-icon5">
                  描述
                </Label>
                <Textarea
                  id="agent-description"
                  placeholder="描述此智能体的用途"
                  className="bg-surface3"
                  {...register("description")}
                  error={!!errors.description}
                  disabled={readOnly}
                />
                {resolveConditional(
                  errors.description,
                  (conditionValue) => (
                    <span className="text-xs text-accent2">{conditionValue.message}</span>
                  ),
                  () => null,
                )}
              </div>

              {/* Provider */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-icon5">
                  提供商 <span className="text-accent2">*</span>
                </Label>
                <Controller
                  name="model.provider"
                  control={control}
                  render={({ field }) => (
                    <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                      <LLMProviders
                        value={field.value}
                        onValueChange={field.onChange}
                        container={formRef}
                      />
                    </div>
                  )}
                />
                {resolveConditional(
                  errors.model?.provider,
                  (providerError) => (
                    <span className="text-xs text-accent2">{providerError.message}</span>
                  ),
                  () => null,
                )}
              </div>

              {/* Model */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-icon5">
                  模型 <span className="text-accent2">*</span>
                </Label>
                <Controller
                  name="model.name"
                  control={control}
                  render={({ field }) => (
                    <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                      <LLMModels
                        value={field.value}
                        onValueChange={field.onChange}
                        llmId={form.watch("model.provider") || ""}
                        container={formRef}
                      />
                    </div>
                  )}
                />
                {resolveConditional(
                  errors.model?.name,
                  (nameError) => (
                    <span className="text-xs text-accent2">{nameError.message}</span>
                  ),
                  () => null,
                )}
              </div>
            </div>
          </ScrollArea>
        </TabContent>

        <TabContent value="capabilities" className="flex-1 min-h-0 py-0 pb-3">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-6 p-4">
              <SectionHeader title="能力" subtitle="使用工具、工作流和其他资源扩展智能体能力。" />

              <ToolsSection
                control={control}
                error={errors.tools?.root?.message}
                readOnly={readOnly}
              />
              <WorkflowsSection
                control={control}
                error={errors.workflows?.root?.message}
                readOnly={readOnly}
              />
              <AgentsSection
                control={control}
                error={errors.agents?.root?.message}
                currentAgentId={currentAgentId}
                readOnly={readOnly}
              />
              <ScorersSection control={control} readOnly={readOnly} />
              <MemorySection control={control} setValue={form.setValue} readOnly={readOnly} />
            </div>
          </ScrollArea>
        </TabContent>

        <TabContent value="variables" className="flex-1 min-h-0 py-0 pb-3">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-6 p-4 border-b border-border1">
              <SectionHeader
                title="变量"
                subtitle={
                  <>
                    变量是根据每次请求上下文动态变化的值。在智能体指令中使用
                    <code className="text-[#F59E0B] font-medium">{"{{variableName}}"}</code>
                    语法引用变量。
                  </>
                }
              />
            </div>

            <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
              <JSONSchemaForm.Root
                onChange={handleVariablesChange}
                defaultValue={initialFields}
                maxDepth={5}
              >
                <JSONSchemaForm.FieldList>
                  {(field, _index, { parentPath, depth }) => (
                    <RecursiveFieldRenderer
                      key={field.id}
                      field={field}
                      parentPath={parentPath}
                      depth={depth}
                    />
                  )}
                </JSONSchemaForm.FieldList>

                <div className="p-2">
                  <JSONSchemaForm.AddField variant="outline" size="sm">
                    <PlusIcon className="w-4 h-4 mr-2" />
                    添加变量
                  </JSONSchemaForm.AddField>
                </div>
              </JSONSchemaForm.Root>
            </div>
          </ScrollArea>
        </TabContent>
      </Tabs>

      {/* Sticky footer with Create/Update Agent button */}
      {resolveConditional(
        !readOnly,
        () => (
          <div className="shrink-0 p-4">
            <Button
              variant="primary"
              onClick={onPublish}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  {mode === "edit" ? "正在更新…" : "正在创建…"}
                </>
              ) : (
                <>
                  <Icon>
                    <Check />
                  </Icon>
                  {mode === "edit" ? "更新智能体" : "创建智能体"}
                </>
              )}
            </Button>
          </div>
        ),
        () => null,
      )}
    </div>
  );
}
