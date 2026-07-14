import { Badge } from "@mastra/playground-ui/components/Badge";
import { DataList } from "@mastra/playground-ui/components/DataList";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { GaugeIcon, ThumbsDown, ThumbsUp } from "lucide-react";
import type { useReviewQueue } from "../../context/review-queue-context";
import { isTruthy } from "../../utils/truthiness";
import { truncateInput } from "./agent-playground-review-helpers";

type ReviewItem = ReturnType<typeof useReviewQueue>["items"][number];

interface ReviewItemRowsProps {
  featuredItemId: string | null;
  handleRowClick: (itemId: string) => void;
  items: ReviewItem[];
  selectedItemIds: Set<string>;
  showCompleted: boolean;
  toggleSelect: (itemId: string) => void;
}

export function ReviewItemRows({
  featuredItemId,
  handleRowClick,
  items,
  selectedItemIds,
  showCompleted,
  toggleSelect,
}: ReviewItemRowsProps) {
  return (
    <>
      {items.map((item) => {
        const scoreEntries = item.scores ? Object.entries(item.scores) : [];
        const isFeatured = featuredItemId === item.id;

        const rowCells = (
          <>
            {/* Input preview */}
            <DataList.Cell height="compact" className="min-w-0 text-neutral4">
              <span className="block truncate">{truncateInput(item.input, 80)}</span>
            </DataList.Cell>

            {/* Comment preview */}
            <DataList.Cell height="compact" className="min-w-0">
              {item.comment ? (
                <Txt variant="ui-xs" className="text-neutral3 truncate">
                  {item.comment}
                </Txt>
              ) : (
                <Txt variant="ui-xs" className="text-neutral2">
                  —
                </Txt>
              )}
            </DataList.Cell>

            {/* Tags */}
            <DataList.Cell height="compact" className="min-w-0">
              {item.tags.length > 0 ? (
                <Txt variant="ui-xs" className="text-neutral4 truncate">
                  {item.tags.join(", ")}
                </Txt>
              ) : (
                <Txt variant="ui-xs" className="text-neutral2">
                  —
                </Txt>
              )}
            </DataList.Cell>

            {/* Rating */}
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

            {/* Scores */}
            <DataList.Cell height="compact">
              {scoreEntries.length > 0 ? (
                <span className="flex items-center gap-1">
                  <Icon size="sm" className="text-neutral3">
                    <GaugeIcon />
                  </Icon>
                  <Txt variant="ui-xs" className="text-neutral4 font-mono">
                    {scoreEntries[0][1].toFixed(2)}
                  </Txt>
                  {scoreEntries.length > 1 && (
                    <Badge variant="default">+{scoreEntries.length - 1}</Badge>
                  )}
                </span>
              ) : (
                <Txt variant="ui-xs" className="text-neutral2">
                  —
                </Txt>
              )}
            </DataList.Cell>
          </>
        );

        return (
          <DataList.RowWrapper key={item.id}>
            {isTruthy(!showCompleted) ? (
              <DataList.SelectCell
                checked={selectedItemIds.has(item.id)}
                onToggle={() => toggleSelect(item.id)}
                aria-label={`Select item ${item.id}`}
              />
            ) : (
              <DataList.Cell height="compact" className="justify-items-center px-4">
                <span className="sr-only">{item.error ? "Error" : "Success"}</span>
                <span
                  aria-hidden="true"
                  title={item.error ? "Error" : "Success"}
                  className={cn("w-2 h-2 rounded-full", item.error ? "bg-red-700" : "bg-green-600")}
                />
              </DataList.Cell>
            )}
            <DataList.RowButton
              flushLeft
              colStart={2}
              featured={isFeatured}
              onClick={() => handleRowClick(item.id)}
            >
              {rowCells}
            </DataList.RowButton>
          </DataList.RowWrapper>
        );
      })}
    </>
  );
}
