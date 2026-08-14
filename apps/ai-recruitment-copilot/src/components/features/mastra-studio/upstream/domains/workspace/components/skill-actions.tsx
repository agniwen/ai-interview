import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Button } from "@mastra/playground-ui/components/Button";
import { Trash2, Loader2, Download } from "lucide-react";

export interface SkillUpdateButtonProps {
  skillName: string;
  onUpdate: () => void;
  isUpdating?: boolean;
}

/**
 * Update button for a single skill
 */
export function SkillUpdateButton({ skillName, onUpdate, isUpdating }: SkillUpdateButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-md"
      disabled={isUpdating}
      tooltip={`更新 ${skillName}`}
      onClick={onUpdate}
    >
      {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </Button>
  );
}

export interface SkillRemoveButtonProps {
  skillName: string;
  onRemove: () => void;
  isRemoving?: boolean;
}

/**
 * Remove button with confirmation dialog for a single skill
 */
export function SkillRemoveButton({ skillName, onRemove, isRemoving }: SkillRemoveButtonProps) {
  return (
    <AlertDialog>
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" size="icon-md" disabled={isRemoving} tooltip={`移除 ${skillName}`}>
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>移除技能</AlertDialog.Title>
          <AlertDialog.Description>
            确定要移除技能“{skillName}”吗？此操作无法撤销。
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>取消</AlertDialog.Cancel>
          <AlertDialog.Action onClick={onRemove}>移除</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
