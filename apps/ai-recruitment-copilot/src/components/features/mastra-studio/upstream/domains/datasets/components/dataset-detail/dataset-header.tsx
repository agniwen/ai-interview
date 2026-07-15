"use client";
import type { DatasetRecord } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { MainHeader } from "@mastra/playground-ui/components/MainHeader";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { Tooltip, TooltipTrigger, TooltipContent } from "@mastra/playground-ui/components/Tooltip";
import { format } from "date-fns/format";
import {
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Play,
  DatabaseIcon,
  Calendar1Icon,
  HistoryIcon,
} from "lucide-react";

export interface DatasetHeaderProps {
  dataset?: DatasetRecord;
  isLoading?: boolean;
  onEditClick?: () => void;
  onDuplicateClick?: () => void;
  onDeleteClick?: () => void;
  experimentTriggerSlot?: React.ReactNode;
  disableExperimentTrigger?: boolean;
  onExperimentClick?: () => void;
  className?: string;
}

/**
 * Dataset header with name, description, actions menu, and run button.
 * Edit/Delete/Duplicate in three-dot menu.
 * Schema Settings moved to Edit Dataset dialog.
 */
export function DatasetHeader({
  dataset,
  isLoading = false,
  onEditClick,
  onDuplicateClick,
  onDeleteClick,
  experimentTriggerSlot,
  disableExperimentTrigger = false,
  onExperimentClick,
  className,
}: DatasetHeaderProps) {
  let experimentAction: React.ReactNode = null;
  if (experimentTriggerSlot) {
    experimentAction = disableExperimentTrigger ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-not-allowed">
            <div className="pointer-events-none opacity-50" inert aria-disabled="true">
              {experimentTriggerSlot}
            </div>
          </span>
        </TooltipTrigger>
        <TooltipContent>请先向数据集添加数据项，再运行实验</TooltipContent>
      </Tooltip>
    ) : (
      experimentTriggerSlot
    );
  } else if (onExperimentClick) {
    experimentAction = disableExperimentTrigger ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-not-allowed">
            <Button disabled tabIndex={-1}>
              <Play />
              运行实验
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>请先向数据集添加数据项，再运行实验</TooltipContent>
      </Tooltip>
    ) : (
      <Button onClick={onExperimentClick}>
        <Play />
        运行实验
      </Button>
    );
  }

  return (
    <MainHeader className={className}>
      <MainHeader.Column>
        <MainHeader.Title isLoading={isLoading}>
          <DatabaseIcon /> {dataset?.name}
        </MainHeader.Title>
        <MainHeader.Description isLoading={isLoading}>
          {dataset?.description}
        </MainHeader.Description>
        <MainHeader.Description isLoading={isLoading}>
          <TextAndIcon>
            <Calendar1Icon /> 创建时间{" "}
            {dataset?.createdAt ? format(new Date(dataset.createdAt), "yyyy/MM/dd") : ""}
          </TextAndIcon>
          <TextAndIcon>
            <HistoryIcon /> 最新版本 v{dataset?.version ?? ""}
          </TextAndIcon>
        </MainHeader.Description>
      </MainHeader.Column>
      <MainHeader.Column>
        <ButtonsGroup>
          {experimentAction}
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button size="lg" aria-label="数据集操作菜单">
                <MoreVertical />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" className="w-48">
              <DropdownMenu.Item onSelect={onEditClick}>
                <Pencil /> 编辑数据集
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onDuplicateClick}>
                <Copy /> 复制数据集
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={onDeleteClick}
                className="text-red-500 focus:text-red-400"
              >
                <Trash2 /> 删除数据集
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </ButtonsGroup>
      </MainHeader.Column>
    </MainHeader>
  );
}
