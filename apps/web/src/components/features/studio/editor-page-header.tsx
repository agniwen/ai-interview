import { IconArrowLeft } from "@tabler/icons-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useStudioHeaderOverride } from "./studio-header-context";

export function EditorPageHeader({ onBack, label }: { onBack: () => void; label: string }) {
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
  return null;
}
