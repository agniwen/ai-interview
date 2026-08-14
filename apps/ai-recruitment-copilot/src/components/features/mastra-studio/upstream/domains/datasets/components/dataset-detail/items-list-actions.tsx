"use client";
import { Button } from "@mastra/playground-ui/components/Button";
import { Popover, PopoverTrigger, PopoverContent } from "@mastra/playground-ui/components/Popover";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { MoreVertical, Download, FolderPlus, Trash2 } from "lucide-react";
import { useState } from "react";

export interface ActionsMenuProps {
  onExportClick: () => void;
  onCreateDatasetClick: () => void;
  onDeleteClick: () => void;
  disabled?: boolean;
}

/**
 * Three-dot actions menu for bulk operations on dataset items.
 * Options: Export, Create Dataset from selection, Delete selected
 */
export function ActionsMenu({
  onExportClick,
  onCreateDatasetClick,
  onDeleteClick,
  disabled = false,
}: ActionsMenuProps) {
  const [open, setOpen] = useState(false);

  const handleExport = () => {
    onExportClick();
    setOpen(false);
  };
  const handleCreateDataset = () => {
    onCreateDatasetClick();
    setOpen(false);
  };
  const handleDelete = () => {
    onDeleteClick();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label="操作菜单">
          <Icon>
            <MoreVertical className="w-4 h-4" />
          </Icon>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleExport}
          >
            <Icon>
              <Download className="w-4 h-4" />
            </Icon>
            导出
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleCreateDataset}
          >
            <Icon>
              <FolderPlus className="w-4 h-4" />
            </Icon>
            创建数据集
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-red-500 hover:text-red-400"
            onClick={handleDelete}
          >
            <Icon>
              <Trash2 className="w-4 h-4" />
            </Icon>
            删除
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
