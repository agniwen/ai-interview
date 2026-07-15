import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import type { JsonSchema } from "@mastra/playground-ui/utils/json-schema";
import type { RuleGroup } from "@mastra/playground-ui/utils/rule-engine";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";

import type { PromptBlockFormValues } from "./utils/form-validation";
import { DisplayConditionsDialog } from "@/components/features/mastra-studio/upstream/domains/cms/components/display-conditions/display-conditions-dialog";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";

interface PromptBlockEditMainProps {
  form: UseFormReturn<PromptBlockFormValues>;
  /** Key that changes when form is reset with new data, forces CodeEditor to remount */
  formResetKey?: number;
}

export function PromptBlockEditMain({ form, formResetKey = 0 }: PromptBlockEditMainProps) {
  const { control, setValue } = form;

  const schema = useWatch({ control, name: "variables" }) as JsonSchema | undefined;
  const rules = useWatch({ control, name: "rules" }) as RuleGroup | undefined;

  const handleRulesChange = (ruleGroup: RuleGroup | undefined) => {
    setValue("rules", ruleGroup, { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-3 h-full px-4">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="内容"
          subtitle="编写提示词块内容。使用 {{variableName}} 表示模板变量。"
        />
        <DisplayConditionsDialog
          entityName="提示词块"
          schema={schema}
          rules={rules}
          onRulesChange={handleRulesChange}
        />
      </div>
      <Controller
        name="content"
        control={control}
        render={({ field }) => (
          <div className="flex-1 flex flex-col">
            <CodeEditor
              key={formResetKey}
              value={field.value ?? ""}
              onChange={field.onChange}
              language="markdown"
              showCopyButton
              placeholder="输入提示词块内容..."
              highlightVariables
              schema={schema}
              className="flex-1 min-h-[200px]"
            />
          </div>
        )}
      />
    </div>
  );
}
