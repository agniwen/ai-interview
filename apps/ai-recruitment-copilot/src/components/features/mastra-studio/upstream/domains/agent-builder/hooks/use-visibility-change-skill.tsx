import { useFormContext } from "react-hook-form";

import { useVisibilityChangeDialog } from "./use-visibility-change-dialog";
import type {
  UseVisibilityChangeDialogResult,
  VisibilityCopy,
} from "./use-visibility-change-dialog";
import type { SkillEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-autosave-skill";
import { useUpdateSkill } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-update-skill";

type Visibility = SkillEditFormValues["visibility"];

const COPY: Record<Visibility, VisibilityCopy> = {
  private: {
    description: "从库中移除此技能后，团队成员将无法再发现或使用它，只有你可以访问。",
    title: "从你的库中移除此技能？",
    toast: "已从库中移除技能",
  },
  public: {
    description: "将此技能添加到库后，团队成员将能够发现并使用它。",
    title: "将此技能添加到你的库？",
    toast: "已将技能添加到库",
  },
};

export type UseVisibilityChange = UseVisibilityChangeDialogResult<Visibility>;

export function useVisibilityChange(skillId: string): UseVisibilityChange {
  const formMethods = useFormContext<SkillEditFormValues>();
  const updateSkill = useUpdateSkill({ silent: true });

  return useVisibilityChangeDialog<Visibility>({
    copy: COPY,
    isPending: updateSkill.isPending,
    mutate: (visibility) => updateSkill.mutateAsync({ id: skillId, visibility }),
    onSuccess: (visibility) => {
      formMethods.setValue("visibility", visibility, { shouldDirty: false });
    },
    testIds: {
      cancel: "skill-builder-visibility-confirm-cancel",
      confirm: "skill-builder-visibility-confirm-yes",
      dialog: "skill-builder-visibility-confirm-dialog",
    },
  });
}
