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
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import type { JsonSchema } from "@mastra/playground-ui/utils/json-schema";
import { Check, Plus, PlusIcon, Save } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";

import type { PromptBlockFormValues } from "./utils/form-validation";
import { useStoredAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

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
    <div className={"py-2"} style={{ paddingLeft: depth * 8 }}>
      <JSONSchemaForm.Field key={field.id} field={field} parentPath={parentPath} depth={depth}>
        <div className="space-y-2 px-2">
          <div className="flex flex-row gap-4 items-center">
            <JSONSchemaForm.FieldName
              labelIsHidden
              placeholder="变量名称"
              size="md"
              className="[&_input]:bg-surface3 w-full"
            />

            <JSONSchemaForm.FieldType placeholder="类型" />
            <JSONSchemaForm.FieldOptional />
            <JSONSchemaForm.FieldNullable />
            <JSONSchemaForm.FieldRemove variant="outline" />
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
          <JSONSchemaForm.AddField className="mt-2" size="sm">
            <PlusIcon />
            添加嵌套变量
          </JSONSchemaForm.AddField>
        </JSONSchemaForm.NestedFields>
      </JSONSchemaForm.Field>
    </div>
  );
}

interface PromptBlockEditSidebarProps {
  form: UseFormReturn<PromptBlockFormValues>;
  onPublish: () => void;
  onSaveDraft?: () => void;
  isSubmitting?: boolean;
  isSavingDraft?: boolean;
  isDirty?: boolean;
  hasDraft?: boolean;
  mode?: "create" | "edit";
  /** Key that changes when form is reset with new data, forces JSONSchemaForm to remount */
  formResetKey?: number;
  /** Block ID, used to show "Used by" agents section in edit mode */
  blockId?: string;
}

function normalizeSidebarProps(props: PromptBlockEditSidebarProps) {
  return {
    ...props,
    formResetKey: props.formResetKey ?? 0,
    hasDraft: props.hasDraft ?? false,
    isDirty: props.isDirty ?? false,
    isSavingDraft: props.isSavingDraft ?? false,
    isSubmitting: props.isSubmitting ?? false,
    mode: props.mode ?? "create",
  };
}

export function PromptBlockEditSidebar(props: PromptBlockEditSidebarProps) {
  const {
    form,
    onPublish,
    onSaveDraft,
    isSubmitting,
    isSavingDraft,
    isDirty,
    hasDraft,
    mode,
    formResetKey,
    blockId,
  } = normalizeSidebarProps(props);
  const {
    register,
    control,
    formState: { errors },
  } = form;

  const watchedVariables = useWatch({ control, name: "variables" });

  const handleVariablesChange = useCallback(
    (newSchema: JsonSchema) => {
      form.setValue("variables", newSchema, { shouldDirty: true });
    },
    [form],
  );

  const initialFields = useMemo(() => jsonSchemaToFields(watchedVariables), [watchedVariables]);

  const { data: storedAgentsData } = useStoredAgents();
  const { navigate, paths } = useLinkComponent();

  const usedByAgents = useMemo(() => {
    if (!blockId || !storedAgentsData?.agents) {
      return [];
    }
    return storedAgentsData.agents.filter((agent) => {
      if (!Array.isArray(agent.instructions)) {
        return false;
      }
      return agent.instructions.some(
        (instr) => instr.type === "prompt_block_ref" && instr.id === blockId,
      );
    });
  }, [blockId, storedAgentsData]);

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-6 p-4">
          <SectionHeader title="配置" subtitle="定义提示词块的名称和描述。" />

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt-block-name" className="text-xs text-neutral5">
              名称 <span className="text-accent2">*</span>
            </Label>
            <Input
              id="prompt-block-name"
              placeholder="我的提示词块"
              variant="outline"
              {...register("name")}
              error={!!errors.name}
            />
            {errors.name && <span className="text-xs text-accent2">{errors.name.message}</span>}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt-block-description" className="text-xs text-neutral5">
              描述
            </Label>
            <Textarea
              id="prompt-block-description"
              placeholder="描述此提示词块的用途"
              variant="outline"
              {...register("description")}
              error={!!errors.description}
            />
            {errors.description && (
              <span className="text-xs text-accent2">{errors.description.message}</span>
            )}
          </div>
        </div>

        {/* Variables */}
        <div className="flex flex-col gap-4 p-4 border-t border-border1">
          <SectionHeader
            title="变量"
            subtitle={
              <>
                定义此提示词块的变量。请在内容中使用{" "}
                <code className="text-accent1 font-medium">{"{{variableName}}"}</code> 语法。
              </>
            }
          />

          <JSONSchemaForm.Root
            key={formResetKey}
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
              <JSONSchemaForm.AddField>
                <Plus />
                添加变量
              </JSONSchemaForm.AddField>
            </div>
          </JSONSchemaForm.Root>
        </div>

        {/* Used by */}
        {mode === "edit" && blockId && (
          <div className="flex flex-col gap-3 p-4 border-t border-border1">
            <SectionHeader title="引用方" subtitle="引用此提示词块的智能体。" />
            {usedByAgents.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {usedByAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => navigate(paths.agentLink(agent.id))}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-surface3 transition-colors"
                  >
                    <Txt variant="ui-sm" className="text-neutral5 truncate">
                      {agent.name || agent.id}
                    </Txt>
                  </button>
                ))}
              </div>
            ) : (
              <Txt variant="ui-sm" className="text-neutral3">
                尚未被任何智能体引用。
              </Txt>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Sticky footer */}
      <div className="shrink-0 p-4">
        {mode === "edit" && onSaveDraft ? (
          <div className="flex gap-2">
            <Button
              onClick={onSaveDraft}
              disabled={!isDirty || isSavingDraft || isSubmitting}
              className="flex-1"
            >
              {isSavingDraft ? (
                <>
                  <Spinner className="h-4 w-4" />
                  正在保存...
                </>
              ) : (
                <>
                  <Save />
                  保存
                </>
              )}
            </Button>
            <Button
              variant="primary"
              onClick={onPublish}
              disabled={(!hasDraft && !isDirty) || isSubmitting || isSavingDraft}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  正在发布...
                </>
              ) : (
                <>
                  <Check />
                  发布
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={onPublish} disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4" />
                正在创建...
              </>
            ) : (
              <>
                <Check />
                创建提示词块
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
