import type { CreateStoredPromptBlockParams } from "@mastra/client-js";
import { toast } from "@mastra/playground-ui/utils/toast";

import { useStoredPromptBlockMutations } from "../hooks/use-stored-prompt-blocks";
import { PromptBlockEditMain } from "./prompt-block-edit-page/prompt-block-edit-main";
import { PromptBlockEditSidebar } from "./prompt-block-edit-page/prompt-block-edit-sidebar";
import { usePromptBlockEditForm } from "./prompt-block-edit-page/use-prompt-block-edit-form";
import { AgentEditLayout } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-edit-page/agent-edit-layout";

interface PromptBlockCreateContentProps {
  onSuccess?: (block: { id: string }) => void;
}

export function PromptBlockCreateContent({ onSuccess }: PromptBlockCreateContentProps) {
  const { createStoredPromptBlock } = useStoredPromptBlockMutations();
  const { form } = usePromptBlockEditForm();

  const handlePublish = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("请填写所有必填项");
      return;
    }

    const values = form.getValues();

    try {
      const createParams: CreateStoredPromptBlockParams = {
        content: values.content,
        description: values.description || undefined,
        name: values.name,
        requestContextSchema: (values.variables as Record<string, unknown>) || undefined,
        rules: values.rules || undefined,
      };

      const created = await createStoredPromptBlock.mutateAsync(createParams);
      toast.success("提示词块创建成功");
      onSuccess?.(created);
    } catch (error) {
      toast.error(`创建提示词块失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  return (
    <AgentEditLayout
      leftSlot={
        <PromptBlockEditSidebar
          form={form}
          onPublish={handlePublish}
          isSubmitting={createStoredPromptBlock.isPending}
        />
      }
    >
      <form className="h-full">
        <PromptBlockEditMain form={form} />
      </form>
    </AgentEditLayout>
  );
}
