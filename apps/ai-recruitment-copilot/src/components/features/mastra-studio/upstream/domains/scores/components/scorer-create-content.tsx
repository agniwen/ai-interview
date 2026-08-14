import type { CreateStoredScorerParams } from "@mastra/client-js";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useRef } from "react";

import { useStoredScorerMutations } from "../hooks/use-stored-scorers";
import { ScorerEditMain } from "./scorer-edit-page/scorer-edit-main";
import { ScorerEditSidebar } from "./scorer-edit-page/scorer-edit-sidebar";
import { useScorerEditForm } from "./scorer-edit-page/use-scorer-edit-form";
import { AgentEditLayout } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-edit-page/agent-edit-layout";

interface ScorerCreateContentProps {
  onSuccess?: (scorer: { id: string }) => void;
}

export function ScorerCreateContent({ onSuccess }: ScorerCreateContentProps) {
  const { createStoredScorer } = useStoredScorerMutations();
  const formRef = useRef<HTMLFormElement | null>(null);
  const { form } = useScorerEditForm();

  const handlePublish = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("请填写所有必填项");
      return;
    }

    const values = form.getValues();

    try {
      const createParams: CreateStoredScorerParams = {
        defaultSampling:
          values.defaultSampling?.type === "ratio" &&
          typeof values.defaultSampling.rate === "number"
            ? values.defaultSampling
            : { type: "none" as const },
        description: values.description || undefined,
        instructions: values.instructions || undefined,
        model: values.model,
        name: values.name,
        scoreRange: values.scoreRange,
        type: values.type,
      };

      const created = await createStoredScorer.mutateAsync(createParams);
      toast.success("评分器创建成功");
      onSuccess?.(created);
    } catch (error) {
      toast.error(`创建评分器失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  return (
    <AgentEditLayout
      leftSlot={
        <ScorerEditSidebar
          form={form}
          onPublish={handlePublish}
          isSubmitting={createStoredScorer.isPending}
          formRef={formRef}
        />
      }
    >
      <form ref={formRef} className="h-full">
        <ScorerEditMain form={form} />
      </form>
    </AgentEditLayout>
  );
}
