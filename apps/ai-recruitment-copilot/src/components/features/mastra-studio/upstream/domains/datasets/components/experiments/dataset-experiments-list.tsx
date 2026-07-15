import type { DatasetExperiment } from "@mastra/client-js";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { DataList } from "@mastra/playground-ui/components/DataList";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import { cn } from "@mastra/playground-ui/utils/cn";
import { format, isThisYear, isToday } from "date-fns";
import { Play } from "lucide-react";
import {
  getExperimentStatusLabel,
  getExperimentTargetTypeLabel,
} from "@/components/features/mastra-studio/upstream/domains/experiments/components/experiments-list-options";

const experimentsListColumns = [
  { label: "ID", name: "experimentId", size: "7rem" },
  { label: "状态", name: "status", size: "5rem" },
  { label: "类型", name: "targetType", size: "6rem" },
  { label: "目标", name: "target", size: "minmax(0,1fr)" },
  { label: "数量", name: "counts", size: "7rem" },
  { label: "创建时间", name: "date", size: "10rem" },
];

export interface DatasetExperimentsListProps {
  experiments: DatasetExperiment[];
  isSelectionActive: boolean;
  selectedExperimentIds: string[];
  onRowClick: (experimentId: string) => void;
  onToggleSelection: (experimentId: string) => void;
}

function formatDate(date: Date): string {
  const dayMonth = isToday(date) ? "今天" : format(date, "MM/dd");
  const year = isThisYear(date) ? "" : format(date, "yyyy");
  const time = format(date, "HH:mm");
  return `${dayMonth} ${year} ${time}`.replaceAll(/\s+/g, " ").trim();
}

function EmptyDatasetExperimentsList() {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <EmptyState
        iconSlot={<Play className="w-8 h-8 text-neutral3" />}
        titleSlot="暂无实验"
        descriptionSlot="触发实验，使用智能体、工作流或评分器评估数据集。"
      />
    </div>
  );
}

export function DatasetExperimentsList({
  experiments,
  isSelectionActive,
  selectedExperimentIds,
  onRowClick,
  onToggleSelection,
}: DatasetExperimentsListProps) {
  if (experiments.length === 0) {
    return <EmptyDatasetExperimentsList />;
  }

  const gridColumns = [
    isSelectionActive ? "auto" : "",
    ...experimentsListColumns.map((c) => c.size),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <DataList columns={gridColumns}>
      <DataList.Top hasLeadingCell={isSelectionActive}>
        {isSelectionActive && <DataList.TopCell>&nbsp;</DataList.TopCell>}
        {isSelectionActive ? (
          <DataList.TopCells colStart={2}>
            {experimentsListColumns.map((col) => (
              <DataList.TopCell key={col.name}>{col.label}</DataList.TopCell>
            ))}
          </DataList.TopCells>
        ) : (
          experimentsListColumns.map((col) => (
            <DataList.TopCell key={col.name}>{col.label}</DataList.TopCell>
          ))
        )}
      </DataList.Top>

      {experiments.map((experiment) => {
        const isSelected = selectedExperimentIds.includes(experiment.id);
        const createdAtDate = new Date(experiment.createdAt);

        const rowCells = (
          <>
            <DataList.IdCell id={experiment.id} />
            <DataList.Cell height="compact">
              {experiment.status && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-center w-10 relative bg-transparent h-full">
                      <div
                        className={cn("w-2 h-2 rounded-full", {
                          "bg-green-600": ["success", "completed"].includes(experiment.status),
                          "bg-red-700": ["error", "failed"].includes(experiment.status),
                          "bg-yellow-500": ["pending", "running"].includes(experiment.status),
                        })}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{getExperimentStatusLabel(experiment.status)}</TooltipContent>
                </Tooltip>
              )}
            </DataList.Cell>
            <DataList.Cell height="compact">
              {getExperimentTargetTypeLabel(experiment.targetType)}
            </DataList.Cell>
            <DataList.Cell height="compact" className="min-w-0">
              <span className="block truncate">{experiment.targetId}</span>
            </DataList.Cell>
            <DataList.Cell height="compact">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex gap-1">
                    {experiment.succeededCount > 0 && (
                      <Chip color="green">{experiment.succeededCount}</Chip>
                    )}
                    {experiment.failedCount > 0 && (
                      <Chip color="red">{experiment.failedCount}</Chip>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {experiment.succeededCount} 成功
                  <br />
                  {experiment.failedCount} 失败
                </TooltipContent>
              </Tooltip>
            </DataList.Cell>
            <DataList.Cell height="compact" className="min-w-0">
              <span className="block text-ui-smd text-neutral2 truncate">
                {formatDate(createdAtDate)}
              </span>
            </DataList.Cell>
          </>
        );

        const handleRowClick = () =>
          isSelectionActive ? onToggleSelection(experiment.id) : onRowClick(experiment.id);

        if (!isSelectionActive) {
          return (
            <DataList.RowButton key={experiment.id} onClick={handleRowClick}>
              {rowCells}
            </DataList.RowButton>
          );
        }

        return (
          <DataList.RowWrapper key={experiment.id}>
            <DataList.SelectCell
              checked={isSelected}
              onToggle={() => onToggleSelection(experiment.id)}
              aria-label={`选择实验 ${experiment.id}`}
            />
            <DataList.RowButton
              flushLeft
              colStart={2}
              featured={isSelected}
              onClick={handleRowClick}
            >
              {rowCells}
            </DataList.RowButton>
          </DataList.RowWrapper>
        );
      })}
    </DataList>
  );
}
