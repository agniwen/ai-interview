import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { useMergedRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";

export interface ScorerSummary {
  scorer: string;
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface ScoresOverTimePoint {
  time: string;
  [scorer: string]: string | number;
}

function getOrCreateValues(map: Map<string, number[]>, key: string): number[] {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const values: number[] = [];
  map.set(key, values);
  return values;
}

function getOrCreateScorerMap(
  map: Map<number, Map<string, number[]>>,
  bucket: number,
): Map<string, number[]> {
  const existing = map.get(bucket);
  if (existing) {
    return existing;
  }
  const scorerMap = new Map<string, number[]>();
  map.set(bucket, scorerMap);
  return scorerMap;
}

function getBucketSize(rangeMs: number): number {
  if (rangeMs < 3_600_000) {
    return 60_000;
  }
  if (rangeMs < 86_400_000) {
    return 3_600_000;
  }
  return 86_400_000;
}

function getTimeLabel(date: Date, isMultiDay: boolean): string {
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  return isMultiDay
    ? `${date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
      })} ${time}`
    : time;
}

export function useScoreMetrics() {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    queryFn: async () => {
      const scorersMap = await client.listScorers(requestContext);
      const scorerIds = Object.keys(scorersMap ?? {});

      if (scorerIds.length === 0) {
        return {
          avgScore: null,
          overTimeData: [],
          prevAvgScore: null,
          scorerNames: [],
          summaryData: [],
        };
      }

      // Fetch scores from the new observability scores API.
      // Fetch per-scorer to keep queries bounded.
      const allResults = await Promise.all(
        scorerIds.map((scorerId) =>
          client.listScores({
            filters: { scorerId },
            orderBy: { direction: "DESC", field: "timestamp" },
            pagination: { page: 0, perPage: 100 },
          }),
        ),
      );

      const allScores: { scorerId: string; score: number; timestamp: string }[] = [];
      for (let i = 0; i < scorerIds.length; i += 1) {
        const scores = allResults[i]?.scores ?? [];
        for (const s of scores) {
          allScores.push({
            score: s.score,
            scorerId: s.scorerId,
            timestamp:
              typeof s.timestamp === "string" ? s.timestamp : new Date(s.timestamp).toISOString(),
          });
        }
      }

      if (allScores.length === 0) {
        return {
          avgScore: null,
          overTimeData: [],
          prevAvgScore: null,
          scorerNames: [],
          summaryData: [],
        };
      }

      // Split scores into current period (recent half) and previous period (older half)
      const sorted = [...allScores].toSorted(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const midpoint = Math.floor(sorted.length / 2);
      const prevScores = sorted.slice(0, midpoint);

      // Group by scorer for summary (uses all scores)
      const byScorer = new Map<string, number[]>();
      for (const s of allScores) {
        getOrCreateValues(byScorer, s.scorerId).push(s.score);
      }

      const summaryData: ScorerSummary[] = [...byScorer.entries()].map(([scorer, vals]) => ({
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        count: vals.length,
        max: Math.max(...vals),
        min: Math.min(...vals),
        scorer,
      }));

      const scorerNames = summaryData.map((s) => s.scorer);
      const avgScore = summaryData.reduce((s, d) => s + d.avg, 0) / summaryData.length;

      // Compute previous period avg score
      let prevAvgScore: number | null = null;
      if (prevScores.length > 0) {
        const prevByScorer = new Map<string, number[]>();
        for (const s of prevScores) {
          getOrCreateValues(prevByScorer, s.scorerId).push(s.score);
        }
        const prevScorerAvgs = [...prevByScorer.values()].map(
          (vals) => vals.reduce((a, b) => a + b, 0) / vals.length,
        );
        prevAvgScore = prevScorerAvgs.reduce((a, b) => a + b, 0) / prevScorerAvgs.length;
        prevAvgScore = Math.round(prevAvgScore * 100) / 100;
      }

      // Group by time bucket + scorer for over-time chart
      // Pick bucket size based on data range: minutes, hours, or days
      const timestamps = allScores.map((s) => new Date(s.timestamp).getTime());
      const rangeMs = Math.max(...timestamps) - Math.min(...timestamps);
      const bucketMs = getBucketSize(rangeMs);

      const bucketMap = new Map<number, Map<string, number[]>>();
      for (const s of allScores) {
        const ts = new Date(s.timestamp);
        const bucket = Math.floor(ts.getTime() / bucketMs) * bucketMs;
        const scorerMap = getOrCreateScorerMap(bucketMap, bucket);
        getOrCreateValues(scorerMap, s.scorerId).push(s.score);
      }

      const sortedBuckets = [...bucketMap.entries()].toSorted(([a], [b]) => a - b);
      // Determine date range to decide label format
      const minTs = sortedBuckets[0]?.[0] ?? 0;
      const maxTs = sortedBuckets.at(-1)?.[0] ?? 0;
      const spanDays = (maxTs - minTs) / 86_400_000;

      const overTimeData: ScoresOverTimePoint[] = sortedBuckets.map(([bucket, scorerMap]) => {
        const d = new Date(bucket);
        const timeLabel = getTimeLabel(d, spanDays > 1);
        const point: ScoresOverTimePoint = { time: timeLabel };
        for (const name of scorerNames) {
          const vals = scorerMap.get(name);
          if (vals && vals.length > 0) {
            point[name] = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
          }
        }
        return point;
      });

      return {
        avgScore: Math.round(avgScore * 100) / 100,
        overTimeData,
        prevAvgScore,
        scorerNames,
        summaryData,
      };
    },
    queryKey: ["score-metrics", requestContext],
  });
}
