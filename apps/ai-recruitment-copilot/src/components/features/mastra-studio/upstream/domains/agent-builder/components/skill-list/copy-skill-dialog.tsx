import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Input } from "@mastra/playground-ui/components/Input";
import { useEffect, useState } from "react";

export interface CopySkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The original skill being copied. Used to suggest a default name. */
  sourceName: string;
  /** Names of the user's existing skills, to detect collisions before submit. */
  existingNames: string[];
  /** Whether a copy mutation is currently pending. */
  isPending?: boolean;
  /** Called with the chosen name when the user confirms. */
  onConfirm: (name: string) => void;
}

function suggestCopyName(sourceName: string, existingNames: string[]): string {
  const base = `${sourceName}-copy`;
  if (!existingNames.includes(base)) {
    return base;
  }
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${sourceName}-copy-${i}`;
    if (!existingNames.includes(candidate)) {
      return candidate;
    }
  }
  return base;
}

export function CopySkillDialog({
  open,
  onOpenChange,
  sourceName,
  existingNames,
  isPending,
  onConfirm,
}: CopySkillDialogProps) {
  const [name, setName] = useState("");

  // Re-seed the suggested name whenever the dialog opens for a different source.
  useEffect(() => {
    if (open) {
      setName(suggestCopyName(sourceName, existingNames));
    }
  }, [open, sourceName, existingNames]);

  const trimmed = name.trim();
  const collides = existingNames.includes(trimmed);
  const canSubmit = trimmed.length > 0 && !collides && !isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>复制“{sourceName}”</AlertDialog.Title>
          <AlertDialog.Description>
            在你的技能中创建一个可编辑的私有副本，原技能不会受到影响。
          </AlertDialog.Description>
        </AlertDialog.Header>
        <div className="px-6 py-2">
          <label className="block text-ui-sm text-neutral4 mb-1.5" htmlFor="copy-skill-name">
            新技能名称
          </label>
          <Input
            id="copy-skill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-skill-copy"
            autoFocus
            data-testid="copy-skill-name-input"
          />
          {collides && (
            <div className="mt-1.5 text-ui-xs text-red-400">你已有名为“{trimmed}”的技能。</div>
          )}
        </div>
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={isPending}>取消</AlertDialog.Cancel>
          <AlertDialog.Action
            disabled={!canSubmit}
            onClick={(e) => {
              if (!canSubmit) {
                e.preventDefault();
                return;
              }
              onConfirm(trimmed);
            }}
            data-testid="copy-skill-confirm"
          >
            {isPending ? "正在复制..." : "复制技能"}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
