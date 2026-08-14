import { DataList } from "@mastra/playground-ui/components/DataList";
import { MetricsCard } from "@mastra/playground-ui/components/MetricsCard";
import { MetricsLineChart } from "@mastra/playground-ui/components/MetricsLineChart";
import { Tabs, TabList, Tab, TabContent } from "@mastra/playground-ui/components/Tabs";
import { useMemo } from "react";
import type { ScorerSummary, ScoresOverTimePoint } from "../hooks/use-score-metrics";

const SERIES_COLORS = ["#22c55e", "#4f83f1", "#8b5cf6", "#fb923c", "#f472b6", "#facc15"];

interface ScoresOverTimeCardProps {
  summaryData: ScorerSummary[];
  overTimeData: ScoresOverTimePoint[];
  scorerNames: string[];
  avgScore: number | null;
  isLoading: boolean;
  isError: boolean;
}

interface ScoresCardContentProps {
  hasData: boolean;
  isError: boolean;
  isLoading: boolean;
  overTimeData: ScoresOverTimePoint[];
  series: {
    aggregate: (points: Record<string, unknown>[]) => { suffix: string; value: string };
    color: string;
    dataKey: string;
    label: string;
  }[];
  summaryData: ScorerSummary[];
}

function ScoresCardContent({
  hasData,
  isError,
  isLoading,
  overTimeData,
  series,
  summaryData,
}: ScoresCardContentProps) {
  if (isLoading) {
    return <MetricsCard.Loading />;
  }
  if (isError) {
    return <MetricsCard.Error message="加载得分数据失败" />;
  }
  if (!hasData) {
    return (
      <MetricsCard.Content>
        <MetricsCard.NoData message="暂无得分数据" />
      </MetricsCard.Content>
    );
  }

  return (
    <MetricsCard.Content>
      <Tabs defaultTab="over-time" className="overflow-visible">
        <TabList>
          <Tab value="over-time">随时间变化</Tab>
          <Tab value="summary">概览</Tab>
        </TabList>
        <TabContent value="over-time">
          {overTimeData.length > 0 ? (
            <MetricsLineChart data={overTimeData} series={series} yDomain={[0, 1]} />
          ) : (
            <MetricsCard.NoData message="暂无时间序列数据" />
          )}
        </TabContent>
        <TabContent value="summary">
          <DataList
            columns="auto auto auto auto auto"
            className="max-h-80"
            mask={{ left: false }}
            stickyHeaderBackground="tinted"
          >
            <DataList.Top>
              <DataList.TopCell sticky="start">评分器</DataList.TopCell>
              <DataList.TopCell className="justify-end text-right">平均值</DataList.TopCell>
              <DataList.TopCell className="justify-end text-right">最小值</DataList.TopCell>
              <DataList.TopCell className="justify-end text-right">最大值</DataList.TopCell>
              <DataList.TopCell className="justify-end text-right">数量</DataList.TopCell>
            </DataList.Top>
            {summaryData.map((row) => (
              <DataList.RowStatic key={row.scorer}>
                <DataList.RowHeaderCell height="compact" className="text-ui-sm">
                  {row.scorer}
                </DataList.RowHeaderCell>
                <DataList.NumberCell highlight>{row.avg.toFixed(2)}</DataList.NumberCell>
                <DataList.NumberCell>{row.min.toFixed(2)}</DataList.NumberCell>
                <DataList.NumberCell>{row.max.toFixed(2)}</DataList.NumberCell>
                <DataList.NumberCell>{row.count.toLocaleString()}</DataList.NumberCell>
              </DataList.RowStatic>
            ))}
          </DataList>
        </TabContent>
      </Tabs>
    </MetricsCard.Content>
  );
}

export function ScoresOverTimeCard({
  summaryData,
  overTimeData,
  scorerNames,
  avgScore,
  isLoading,
  isError,
}: ScoresOverTimeCardProps) {
  const hasData = summaryData.length > 0;

  const series = useMemo(
    () =>
      scorerNames.map((name, i) => ({
        aggregate: (points: Record<string, unknown>[]) => ({
          suffix: "avg",
          value:
            points.length > 0
              ? (
                  points.reduce((s, d) => s + ((d[name] as number) ?? 0), 0) / points.length
                ).toFixed(2)
              : "0",
        }),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        dataKey: name,
        label: name,
      })),
    [scorerNames],
  );

  return (
    <MetricsCard>
      <MetricsCard.TopBar>
        <MetricsCard.TitleAndDescription title="得分" description="所有评分器的评估表现。" />
        {hasData && (
          <MetricsCard.Summary
            value={avgScore === null ? "—" : `平均 ${avgScore}`}
            label="所有评分器"
          />
        )}
      </MetricsCard.TopBar>
      <ScoresCardContent
        hasData={hasData}
        isError={isError}
        isLoading={isLoading}
        overTimeData={overTimeData}
        series={series}
        summaryData={summaryData}
      />
    </MetricsCard>
  );
}
