import { IconArrowLeft } from "@tabler/icons-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useStudioHeaderActions, useStudioHeaderOverride } from "./studio-header-context";

export function EditorPageHeader({
  actions = null,
  label,
  onBack,
}: {
  /** 页面级顶栏操作，显示在顶栏右侧。Page-level actions shown on the right of the header. */
  actions?: ReactNode;
  label: string;
  onBack: () => void;
}) {
  const header = useMemo(
    () => (
      <Button onClick={onBack} size="sm" variant="ghost">
        <IconArrowLeft className="size-4" />
        {label}
      </Button>
    ),
    [label, onBack],
  );
  useStudioHeaderOverride(header);
  useStudioHeaderActions(actions);
  return null;
}
