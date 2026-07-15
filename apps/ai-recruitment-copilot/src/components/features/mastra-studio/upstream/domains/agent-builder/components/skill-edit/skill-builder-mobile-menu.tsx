import { Button } from "@mastra/playground-ui/components/Button";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { Globe, LockIcon, MoreVerticalIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";

import { useVisibilityChange } from "../../hooks/use-visibility-change-skill";
import { DeleteSkillMenuItem } from "./delete-skill-action";
import type { Visibility } from "./visibility-select";
import type { SkillEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-autosave-skill";

export interface SkillBuilderMobileMenuProps {
  skillId: string;
  /** When true, includes the Add/Remove from library item. Owner-only. */
  showSetVisibility?: boolean;
  /** When true, includes the Delete skill item. Owner-only. */
  showDelete?: boolean;
  /** Current skill name, shown in the delete confirmation dialog. */
  skillName?: string;
  /** Disables all actions (e.g. during streaming). */
  disabled?: boolean;
}

interface VisibilityMenuItemProps {
  skillId: string;
  disabled: boolean;
}

function VisibilityMenuItem({ skillId, disabled }: VisibilityMenuItemProps) {
  const formMethods = useFormContext<SkillEditFormValues>();
  const value = (useWatch({ control: formMethods.control, name: "visibility" }) ??
    "private") as Visibility;
  const { requestChange, dialog } = useVisibilityChange(skillId);

  return (
    <>
      {value === "private" ? (
        <DropdownMenu.Item
          data-testid="skill-builder-mobile-menu-visibility-add"
          disabled={disabled}
          closeOnClick={false}
          onSelect={() => {
            requestChange("public");
          }}
        >
          <Globe />
          <span>添加到库</span>
        </DropdownMenu.Item>
      ) : (
        <DropdownMenu.Item
          data-testid="skill-builder-mobile-menu-visibility-remove"
          disabled={disabled}
          closeOnClick={false}
          onSelect={() => {
            requestChange("private");
          }}
        >
          <LockIcon />
          <span>从库中移除</span>
        </DropdownMenu.Item>
      )}
      {dialog}
    </>
  );
}

export function SkillBuilderMobileMenu({
  skillId,
  showSetVisibility = false,
  showDelete = false,
  skillName = "",
  disabled = false,
}: SkillBuilderMobileMenuProps) {
  if (!showSetVisibility && !showDelete) {
    return null;
  }

  return (
    <div className="lg:hidden" data-testid="skill-builder-mobile-menu">
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            tooltip="更多操作"
            data-testid="skill-builder-mobile-menu-trigger"
          >
            <MoreVerticalIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {showSetVisibility && <VisibilityMenuItem skillId={skillId} disabled={disabled} />}
          {showSetVisibility && showDelete && <DropdownMenu.Separator />}
          {showDelete && (
            <DeleteSkillMenuItem skillId={skillId} skillName={skillName} disabled={disabled} />
          )}
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
}
