import { Badge } from "@mastra/playground-ui/components/Badge";
import { DataList } from "@mastra/playground-ui/components/DataList";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { GaugeIcon, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReviewItem } from "./review-item-card";

function truncateInput(value: unknown, max: number): string {
  if (typeof value === "string") {
    return value.length > max ? `${value.slice(0, max)}...` : value;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > max ? `${serialized.slice(0, max)}...` : serialized;
  } catch {
    return String(value);
  }
}

function ReviewRowCells({ item }: { item: ReviewItem }) {
  const scoreEntries = item.scores ? Object.entries(item.scores) : [];
  return (
    <>
      <DataList.Cell height="compact" className="min-w-0 text-neutral4">
        <span className="block truncate">{truncateInput(item.input, 200)}</span>
      </DataList.Cell>
      <DataList.Cell height="compact" className="min-w-0">
        <Txt variant="ui-xs" className={item.comment ? "text-neutral3 truncate" : "text-neutral2"}>
          {item.comment || "—"}
        </Txt>
      </DataList.Cell>
      <DataList.Cell height="compact" className="min-w-0">
        <Txt
          variant="ui-xs"
          className={item.tags.length > 0 ? "text-neutral4 truncate" : "text-neutral2"}
        >
          {item.tags.length > 0 ? item.tags.join(", ") : "—"}
        </Txt>
      </DataList.Cell>
      <DataList.Cell height="compact">
        {item.rating === "positive" && (
          <Icon size="sm" className="text-positive1">
            <ThumbsUp />
          </Icon>
        )}
        {item.rating === "negative" && (
          <Icon size="sm" className="text-negative1">
            <ThumbsDown />
          </Icon>
        )}
        {!item.rating && (
          <Txt variant="ui-xs" className="text-neutral2">
            —
          </Txt>
        )}
      </DataList.Cell>
      <DataList.Cell height="compact">
        {scoreEntries.length > 0 ? (
          <div className="flex items-center gap-1">
            <Icon size="sm" className="text-neutral3">
              <GaugeIcon />
            </Icon>
            <Txt variant="ui-xs" className="text-neutral4 font-mono">
              {scoreEntries[0][1].toFixed(2)}
            </Txt>
            {scoreEntries.length > 1 && <Badge variant="default">+{scoreEntries.length - 1}</Badge>}
          </div>
        ) : (
          <Txt variant="ui-xs" className="text-neutral2">
            —
          </Txt>
        )}
      </DataList.Cell>
    </>
  );
}

function getSelectAllState(allSelected: boolean, someSelected: boolean): boolean | "indeterminate" {
  if (allSelected) {
    return true;
  }
  return someSelected ? "indeterminate" : false;
}

export function DatasetReviewList({
  displayItems,
  featuredItemId,
  gridColumns,
  isAllSelected,
  isLoading,
  isSomeSelected,
  onRowClick,
  onToggleSelect,
  onToggleSelectAll,
  selectedItemIds,
  showCompleted,
}: {
  displayItems: ReviewItem[];
  featuredItemId: string | null;
  gridColumns: string;
  isAllSelected: boolean;
  isLoading: boolean;
  isSomeSelected: boolean;
  onRowClick: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
  onToggleSelectAll: () => void;
  selectedItemIds: Set<string>;
  showCompleted: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }
  if (displayItems.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-8">
          <Txt variant="ui-sm" className="text-neutral3 block">
            {showCompleted ? "No completed reviews yet" : "No items to review"}
          </Txt>
          <Txt variant="ui-xs" className="text-neutral3 mt-2 block">
            {showCompleted
              ? "Items marked as complete will appear here for auditing."
              : "When experiment results are flagged for review, they will appear here."}
          </Txt>
        </div>
      </div>
    );
  }
  return (
    <DataList columns={gridColumns} className="min-w-0">
      <DataList.Top hasLeadingCell>
        {showCompleted ? (
          <DataList.TopCell>&nbsp;</DataList.TopCell>
        ) : (
          <DataList.TopSelectCell
            checked={getSelectAllState(isAllSelected, isSomeSelected)}
            onToggle={onToggleSelectAll}
            aria-label="Select all"
          />
        )}
        <DataList.TopCells colStart={2}>
          <DataList.TopCell>Input</DataList.TopCell>
          <DataList.TopCell>Comment</DataList.TopCell>
          <DataList.TopCell>Tags</DataList.TopCell>
          <DataList.TopCell>Rating</DataList.TopCell>
          <DataList.TopCell>Scores</DataList.TopCell>
        </DataList.TopCells>
      </DataList.Top>
      {displayItems.map((item) => (
        <DataList.RowWrapper key={item.id}>
          {showCompleted ? (
            <DataList.Cell height="compact" className="justify-items-center px-4">
              <span
                aria-label={item.error ? "Error" : "Success"}
                title={item.error ? "Error" : "Success"}
                className={cn("w-2 h-2 rounded-full", item.error ? "bg-red-700" : "bg-green-600")}
              />
            </DataList.Cell>
          ) : (
            <DataList.SelectCell
              checked={selectedItemIds.has(item.id)}
              onToggle={() => onToggleSelect(item.id)}
              aria-label={`Select item ${item.id}`}
            />
          )}
          <DataList.RowButton
            flushLeft
            colStart={2}
            featured={featuredItemId === item.id}
            onClick={() => onRowClick(item.id)}
          >
            <ReviewRowCells item={item} />
          </DataList.RowButton>
        </DataList.RowWrapper>
      ))}
    </DataList>
  );
}
