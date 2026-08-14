import { Blocks } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

import { AgentCMSBlocks } from "../agent-cms-blocks/agent-cms-blocks";
import type { AgentFormValues } from "./utils/form-validation";
import { SectionHeader } from "@/components/features/mastra-studio/upstream/domains/cms/components/section/section-header";

interface AgentEditMainProps {
  form: UseFormReturn<AgentFormValues>;
  readOnly?: boolean;
}

export function AgentEditMainContentBlocks({
  form,
  readOnly: _readOnly = false,
}: AgentEditMainProps) {
  const schema = form.watch("variables");

  return (
    <div className="grid grid-rows-[auto_1fr] gap-6 h-full px-4 pb-4">
      <SectionHeader title="指令块" subtitle="为智能体添加指令块。" icon={<Blocks />} />

      <div className="h-full overflow-y-auto">
        <Controller
          name="instructionBlocks"
          control={form.control}
          defaultValue={[]}
          render={({ field }) => (
            <AgentCMSBlocks
              items={field.value ?? []}
              onChange={field.onChange}
              placeholder="输入内容…"
              schema={schema}
            />
          )}
        />
      </div>
    </div>
  );
}
