"use client";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { Column } from "@mastra/playground-ui/components/Columns";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { SearchFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import {
  Plus,
  Upload,
  FileJson,
  Download,
  FolderPlus,
  FolderOutput,
  Trash2,
  ChevronDownIcon,
  MoveRightIcon,
  History,
  GitCompareIcon,
  AmpersandIcon,
} from "lucide-react";

interface ActionsMenuProps {
  onExportClick: () => void;
  onExportJsonClick: () => void;
  onCreateDatasetClick: () => void;
  onAddToDatasetClick: () => void;
  onDeleteClick: () => void;
  onCompareClick: () => void;
}

function ActionsMenu({
  onExportClick,
  onExportJsonClick,
  onCreateDatasetClick,
  onAddToDatasetClick,
  onDeleteClick,
  onCompareClick,
}: ActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button aria-label="Actions menu">
          Select <AmpersandIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="w-72">
        <DropdownMenu.Item onSelect={onCompareClick}>
          <GitCompareIcon />
          <span>Compare Items</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={onExportClick}>
          <Download />
          <span>Export Items as CSV</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={onExportJsonClick}>
          <Download />
          <span>Export Items as JSON</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={onCreateDatasetClick}>
          <FolderPlus />
          <span>Create Dataset from Items</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={onAddToDatasetClick}>
          <FolderOutput />
          <span>Copy Items to Dataset</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={onDeleteClick} className="text-red-500 focus:text-red-400">
          <Trash2 />
          <span>Delete Items</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

type SelectionMode =
  | "idle"
  | "export"
  | "export-json"
  | "create-dataset"
  | "add-to-dataset"
  | "delete"
  | "compare-items";

function getSelectionActionLabel(mode: SelectionMode): string {
  const labels: Partial<Record<SelectionMode, string>> = {
    "add-to-dataset": "Add Items to a Dataset",
    "compare-items": "Compare Items",
    "create-dataset": "Create a new Dataset with Items",
    delete: "Delete Items",
    export: "Export Items as CSV",
    "export-json": "Export Items as JSON",
  };
  return labels[mode] ?? "";
}

export interface DatasetItemsToolbarProps {
  // Normal mode actions
  onAddClick: () => void;
  onImportClick: () => void;
  onImportJsonClick: () => void;
  onExportClick: () => void;
  onExportJsonClick: () => void;
  onCreateDatasetClick: () => void;
  onAddToDatasetClick: () => void;
  onDeleteClick: () => void;
  onCompareClick: () => void;
  hasItems: boolean;

  // Search props
  searchQuery?: string;
  onSearchChange?: (query: string) => void;

  // Selection mode state
  isSelectionActive: boolean;
  selectedCount: number;
  onExecuteAction: () => void;
  onCancelSelection: () => void;
  selectionMode: SelectionMode;

  // Versions panel
  onVersionsClick: () => void;
  isItemPanelOpen?: boolean;
  isVersionsPanelOpen?: boolean;
  isViewingOldVersion?: boolean;
}

export function DatasetItemsToolbar({
  onAddClick,
  onImportClick,
  onImportJsonClick,
  onExportClick,
  onExportJsonClick,
  onCreateDatasetClick,
  onAddToDatasetClick,
  onDeleteClick,
  onCompareClick,
  hasItems,
  searchQuery,
  isSelectionActive,
  onSearchChange,
  selectedCount,
  onExecuteAction,
  onCancelSelection,
  selectionMode,
  onVersionsClick,
  isItemPanelOpen,
  isVersionsPanelOpen,
  isViewingOldVersion,
}: DatasetItemsToolbarProps) {
  let selectionTooltip: string | undefined;
  if (selectionMode === "compare-items" && selectedCount <= 2) {
    selectionTooltip = "Select 2 items to compare";
  } else if (selectedCount === 0) {
    selectionTooltip = "Select at least one item";
  }
  const isCompareMode = selectionMode === "compare-items";
  const isSelectionInvalid = isCompareMode ? selectedCount !== 2 : selectedCount === 0;
  const showSelectionTooltip = isCompareMode ? selectedCount < 2 : selectedCount === 0;
  const selectionLabel = isCompareMode ? "of 2 items selected" : "items selected";
  const selectionActionLabel = getSelectionActionLabel(selectionMode);
  const canShowAddActions = !isItemPanelOpen && !isViewingOldVersion;
  const canShowActionsMenu = hasItems && !isViewingOldVersion;
  const canShowVersions = !isItemPanelOpen && !isVersionsPanelOpen;

  if (isSelectionActive) {
    return (
      <Column.Toolbar className="">
        <SearchFieldBlock
          name="search-items"
          label="Search"
          labelIsHidden
          placeholder="Search items..."
          value={searchQuery ?? ""}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onReset={() => onSearchChange?.("")}
          disabled={!hasItems && !searchQuery}
        />

        <div className="flex gap-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-sm text-neutral3 flex items-center gap-2">
                <Chip size="large" color={showSelectionTooltip ? "red" : "green"}>
                  {selectedCount}
                </Chip>
                <span>{selectionLabel}</span>
                <MoveRightIcon />
              </div>
            </TooltipTrigger>
            {showSelectionTooltip && <TooltipContent>{selectionTooltip}</TooltipContent>}
          </Tooltip>
          <ButtonsGroup>
            <Button variant="primary" disabled={isSelectionInvalid} onClick={onExecuteAction}>
              {selectionActionLabel}
            </Button>
            <Button onClick={onCancelSelection}>Cancel</Button>
          </ButtonsGroup>
        </div>
      </Column.Toolbar>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 w-full">
      <SearchFieldBlock
        name="search-items"
        label="Search"
        labelIsHidden
        placeholder="Search items..."
        value={searchQuery ?? ""}
        onChange={(e) => onSearchChange?.(e.target.value)}
        onReset={() => onSearchChange?.("")}
        disabled={!hasItems && !searchQuery}
      />

      <ButtonsGroup>
        {canShowAddActions && (
          <ButtonsGroup spacing="close">
            <Button onClick={onAddClick}>
              <Plus /> Add Item
            </Button>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button aria-label="Dataset actions menu">
                  <ChevronDownIcon />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item onSelect={onImportClick}>
                  <Upload /> Import CSV
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onImportJsonClick}>
                  <FileJson /> Import JSON
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </ButtonsGroup>
        )}

        {canShowActionsMenu && (
          <ActionsMenu
            onExportClick={onExportClick}
            onExportJsonClick={onExportJsonClick}
            onCreateDatasetClick={onCreateDatasetClick}
            onAddToDatasetClick={onAddToDatasetClick}
            onDeleteClick={onDeleteClick}
            onCompareClick={onCompareClick}
          />
        )}

        {canShowVersions && (
          <Button onClick={onVersionsClick} aria-label="View versions">
            <History className="w-4 h-4" />
            Versions
          </Button>
        )}
      </ButtonsGroup>
    </div>
  );
}
