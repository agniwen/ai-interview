import type { ListScoresResponse, ScoreRowData } from "@mastra/core/evals";
import { DataList, DataListSkeleton } from "@mastra/playground-ui/components/DataList";
import { getShortId } from "@mastra/playground-ui/components/Text";
import { isToday, format } from "date-fns";

const COLUMNS = "auto auto auto auto 1fr";

interface SpanScoresListProps {
  scoresData?: ListScoresResponse | null;
  isLoadingScoresData?: boolean;
  onPageChange?: (page: number) => void;
  onScoreSelect?: (score: ScoreRowData) => void;
}

export function SpanScoresList({
  scoresData,
  isLoadingScoresData,
  onPageChange,
  onScoreSelect,
}: SpanScoresListProps) {
  if (isLoadingScoresData) {
    return <DataListSkeleton columns={COLUMNS} />;
  }

  return (
    <div className="grid gap-2">
      <DataList columns={COLUMNS} className="min-w-0">
        <DataList.Top>
          <DataList.TopCell>ID</DataList.TopCell>
          <DataList.TopCell>日期</DataList.TopCell>
          <DataList.TopCell>时间</DataList.TopCell>
          <DataList.TopCell>得分</DataList.TopCell>
          <DataList.TopCell>评分器</DataList.TopCell>
        </DataList.Top>

        {scoresData?.scores && scoresData.scores.length > 0 ? (
          scoresData.scores.map((score: ScoreRowData) => {
            const createdAtDate = new Date(score.createdAt);
            const isTodayDate = isToday(createdAtDate);

            return (
              <DataList.RowButton key={score.id} onClick={() => onScoreSelect?.(score)}>
                <DataList.Cell height="compact" className="font-mono text-neutral3 text-ui-smd">
                  {getShortId(score?.id) || "不适用"}
                </DataList.Cell>
                <DataList.Cell height="compact" className="text-neutral2 text-ui-smd">
                  {isTodayDate ? "今天" : format(createdAtDate, "MM/dd")}
                </DataList.Cell>
                <DataList.Cell height="compact" className="font-mono text-neutral3 text-ui-smd">
                  {format(createdAtDate, "HH:mm:ss")}
                </DataList.Cell>
                <DataList.Cell height="compact" className="text-ui-smd">
                  {String(score?.score ?? "")}
                </DataList.Cell>
                <DataList.Cell height="compact" className="text-ui-smd">
                  {String(score?.scorer?.name || score?.scorer?.id || "")}
                </DataList.Cell>
              </DataList.RowButton>
            );
          })
        ) : (
          <DataList.NoMatch message="未找到得分" />
        )}
      </DataList>

      <DataList.Pagination
        currentPage={scoresData?.pagination?.page || 0}
        hasMore={scoresData?.pagination?.hasMore}
        onNextPage={() => onPageChange?.((scoresData?.pagination?.page || 0) + 1)}
        onPrevPage={() => onPageChange?.((scoresData?.pagination?.page || 0) - 1)}
      />
    </div>
  );
}
