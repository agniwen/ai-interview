import { DialogBody } from "@mastra/playground-ui/components/Dialog";
import { useFormContext } from "react-hook-form";

import { AgentImpactWarnings } from "../components/agent-edit/agent-impact-warnings";
import type { AgentBuilderEditFormValues } from "../schemas";
import { useVisibilityChangeDialog } from "./use-visibility-change-dialog";
import type {
  UseVisibilityChangeDialogResult,
  VisibilityCopy,
} from "./use-visibility-change-dialog";
import {
  useStoredAgentDependents,
  useStoredAgentMutations,
} from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";

type Visibility = NonNullable<AgentBuilderEditFormValues["visibility"]>;

const COPY: Record<Visibility, VisibilityCopy> = {
  private: {
    description: "从库中移除此智能体后，团队成员将无法再发现、查看或与其对话，只有你可以访问。",
    title: "从你的库中移除此智能体？",
    toast: "已从库中移除智能体",
  },
  public: {
    description: "将此智能体添加到库后，团队成员将能够发现、查看并与其对话。",
    title: "将此智能体添加到你的库？",
    toast: "已将智能体添加到库",
  },
};

export type UseVisibilityChange = UseVisibilityChangeDialogResult<Visibility>;

export function useVisibilityChange(agentId: string): UseVisibilityChange {
  const formMethods = useFormContext<AgentBuilderEditFormValues>();
  const { updateStoredAgent } = useStoredAgentMutations(agentId);
  const { isLoading: isDependentsLoading } = useStoredAgentDependents(agentId);

  return useVisibilityChangeDialog<Visibility>({
    confirmDisabled: (pending) => pending === "private" && isDependentsLoading,
    copy: COPY,
    isPending: updateStoredAgent.isPending,
    mutate: (visibility) => updateStoredAgent.mutateAsync({ visibility }),
    onSuccess: (visibility) => {
      formMethods.setValue("visibility", visibility, { shouldDirty: false });
    },
    renderExtraContent: (pending) =>
      pending === "private" ? (
        <DialogBody className="pt-0">
          <AgentImpactWarnings agentId={agentId} variant="make-private" />
        </DialogBody>
      ) : null,
    testIds: {
      cancel: "agent-builder-visibility-confirm-cancel",
      confirm: "agent-builder-visibility-confirm-yes",
      dialog: "agent-builder-visibility-confirm-dialog",
    },
  });
}
