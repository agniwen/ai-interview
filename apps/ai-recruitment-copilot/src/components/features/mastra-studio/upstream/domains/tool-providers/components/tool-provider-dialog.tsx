import { Button } from "@mastra/playground-ui/components/Button";
import { SideDialog } from "@mastra/playground-ui/components/SideDialog";
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";

import { SelectedToolList } from "./selected-tool-list";
import { ToolList } from "./tool-list";
import { SELECTED_TOOLKIT_SENTINEL, ToolkitList } from "./toolkit-list";

interface ToolProviderDialogProps {
  provider: { id: string; name: string; description?: string } | null;
  onClose: () => void;
  selectedToolIds?: Record<string, { description?: string }>;
  onSubmit?: (providerId: string, tools: Map<string, string>) => void;
}

export function ToolProviderDialog({
  provider,
  onClose,
  selectedToolIds,
  onSubmit,
}: ToolProviderDialogProps) {
  const [selectedToolkit, setSelectedToolkit] = useState<string | undefined>();
  const [localSelection, setLocalSelection] = useState<Map<string, string>>(new Map());

  const resetSelection = useEffectEvent(() => {
    setSelectedToolkit(undefined);

    if (provider && selectedToolIds) {
      const initial = new Map<string, string>();
      for (const [id, config] of Object.entries(selectedToolIds)) {
        if (id.startsWith(`${provider.id}:`)) {
          initial.set(id, config.description || "");
        }
      }
      setLocalSelection(initial);
    } else {
      setLocalSelection(new Map());
    }
  });

  useEffect(() => {
    resetSelection();
  }, [provider?.id]);

  const handleToggle = useCallback((toolId: string, description: string) => {
    setLocalSelection((prev) => {
      const next = new Map(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.set(toolId, description);
      }
      return next;
    });
  }, []);

  const handleSubmit = () => {
    if (provider && onSubmit) {
      onSubmit(provider.id, localSelection);
      onClose();
    }
  };

  const selectedIdSet = useMemo(
    () => (onSubmit ? new Set(localSelection.keys()) : undefined),
    [onSubmit, localSelection],
  );

  const selectionCount = localSelection.size;
  const selectionLabel =
    selectionCount === 0
      ? "Add tools"
      : `Add ${selectionCount} tool${selectionCount === 1 ? "" : "s"}`;

  return (
    <SideDialog
      isOpen={!!provider}
      onClose={onClose}
      dialogTitle={provider?.name ?? ""}
      dialogDescription={provider?.description ?? "Browse tools from this provider"}
      level={1}
    >
      <SideDialog.Header className="px-9 pt-6">
        <SideDialog.Heading>{provider?.name}</SideDialog.Heading>
        {onSubmit && (
          <Button variant="primary" size="sm" onClick={handleSubmit}>
            {selectionLabel}
          </Button>
        )}
      </SideDialog.Header>

      <div className="grid grid-cols-[220px_1fr] h-full overflow-hidden">
        <div className="border-r border-border1 overflow-hidden">
          {provider && (
            <ToolkitList
              providerId={provider.id}
              selectedToolkit={selectedToolkit}
              onSelectToolkit={setSelectedToolkit}
              selectedCount={localSelection.size}
            />
          )}
        </div>

        <div className="overflow-hidden">
          {provider && selectedToolkit === SELECTED_TOOLKIT_SENTINEL ? (
            <SelectedToolList
              providerId={provider.id}
              selectedTools={localSelection}
              onToggle={onSubmit ? handleToggle : undefined}
            />
          ) : (
            provider && (
              <ToolList
                providerId={provider.id}
                toolkit={selectedToolkit}
                selectedIds={selectedIdSet}
                onToggle={onSubmit ? handleToggle : undefined}
              />
            )
          )}
        </div>
      </div>
    </SideDialog>
  );
}
