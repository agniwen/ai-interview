import type { ClientScoreRowData } from "@mastra/client-js";
import type { ExperimentStatus } from "@mastra/core/storage";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { ItemList } from "@mastra/playground-ui/components/ItemList";
import { GaugeIcon } from "lucide-react";
import { useMemo } from "react";

export interface ExperimentScorerSummaryProps {
  scoresByItemId?: Record<string, ClientScoreRowData[]>;
  experimentStatus?: ExperimentStatus;
}

const columns = [
  { label: "评分器", name: "scorer", size: "1fr" },
  { label: "平均得分", name: "avg", size: "1fr" },
  { label: "已评分数据项", name: "count", size: "1fr" },
];

export function ExperimentScorerSummary({
  scoresByItemId,
  experimentStatus,
}: ExperimentScorerSummaryProps) {
  const scorerSummaries = useMemo(() => {
    if (!scoresByItemId) {
      return [];
    }

    const scorerTotals: Record<string, { sum: number; count: number }> = {};

    for (const scores of Object.values(scoresByItemId)) {
      for (const score of scores) {
        if (!scorerTotals[score.scorerId]) {
          scorerTotals[score.scorerId] = { count: 0, sum: 0 };
        }
        scorerTotals[score.scorerId].sum += score.score;
        scorerTotals[score.scorerId].count += 1;
      }
    }

    return Object.entries(scorerTotals)
      .map(([scorerId, { sum, count }]) => ({
        avg: sum / count,
        count,
        scorerId,
      }))
      .toSorted((a, b) => a.scorerId.localeCompare(b.scorerId));
  }, [scoresByItemId]);

  if (scorerSummaries.length === 0) {
    const isRunning = experimentStatus === "running" || experimentStatus === "pending";
    const hasLoadedScores = scoresByItemId !== undefined;

    let title: string;
    let description: string;

    if (isRunning) {
      title = "实验正在运行";
      description = "实验完成后将在此显示汇总指标。";
    } else if (hasLoadedScores === false) {
      title = "正在加载得分";
      description = "正在获取评分器结果…";
    } else {
      title = "未配置评分器";
      description = "触发实验时添加评分器，即可评估结果并在此查看汇总指标。";
    }

    return (
      <div className="flex h-full items-center justify-center py-12">
        <EmptyState
          iconSlot={<GaugeIcon className="w-8 h-8 text-neutral3" />}
          titleSlot={title}
          descriptionSlot={description}
        />
      </div>
    );
  }

  return (
    <ItemList>
      <ItemList.Header columns={columns}>
        <ItemList.HeaderCol>评分器</ItemList.HeaderCol>
        <ItemList.HeaderCol>平均得分</ItemList.HeaderCol>
        <ItemList.HeaderCol>已评分数据项</ItemList.HeaderCol>
      </ItemList.Header>

      <ItemList.Scroller>
        <ItemList.Items>
          {scorerSummaries.map(({ scorerId, avg, count }) => (
            <ItemList.Row key={scorerId} columns={columns}>
              <ItemList.TextCell>{scorerId}</ItemList.TextCell>
              <ItemList.TextCell className="font-mono">{avg.toFixed(3)}</ItemList.TextCell>
              <ItemList.TextCell className="font-mono">{count}</ItemList.TextCell>
            </ItemList.Row>
          ))}
        </ItemList.Items>
      </ItemList.Scroller>
    </ItemList>
  );
}
