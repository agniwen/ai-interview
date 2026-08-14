import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

import type { ScorerFormValues } from "./utils/form-validation";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";

interface ScorerEditMainProps {
  form: UseFormReturn<ScorerFormValues>;
}

export function ScorerEditMain({ form }: ScorerEditMainProps) {
  const { control } = form;

  return (
    <div className="flex flex-col gap-3 h-full px-4">
      <SectionHeader title="指令" subtitle="编写评分器的系统提示词。" />
      <Controller
        name="instructions"
        control={control}
        render={({ field }) => (
          <div className="flex-1 flex flex-col">
            <CodeEditor
              value={field.value ?? ""}
              onChange={field.onChange}
              language="markdown"
              showCopyButton={false}
              placeholder="输入评分器指令..."
              className="flex-1 min-h-[200px]"
            />
          </div>
        )}
      />
    </div>
  );
}
