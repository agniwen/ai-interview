import type { DashboardActivityRow } from "@app/shared/studio-dashboard";
import { DASHBOARD_COLORS } from "./dashboard-colors";

export const ACTIVITY_SERIES = [
  { ...DASHBOARD_COLORS.resumes, key: "resumesAdded", label: "新增简历" },
  { ...DASHBOARD_COLORS.ai, key: "aiCompleted", label: "AI 完成" },
  { ...DASHBOARD_COLORS.human, key: "humanCompleted", label: "复面完成" },
  { ...DASHBOARD_COLORS.offer, key: "offersSent", label: "Offer 发出" },
] as const;

export function getActivityChartData(activity: DashboardActivityRow[]) {
  const domain = activity.map((row) => row.day);
  const data = activity.flatMap((row) =>
    ACTIVITY_SERIES.map((series) => ({
      ...row,
      color: series.fill,
      series: series.key,
      value: row[series.key],
    })),
  );
  const peak = Math.max(
    1,
    ...activity.map((row) => ACTIVITY_SERIES.reduce((total, series) => total + row[series.key], 0)),
  );
  const step = Math.max(1, Math.ceil(peak / 4));
  const maximum = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: maximum / step + 1 }, (_, index) => index * step);
  return { data, domain, maximum, ticks };
}

export function formatActivityTooltip(row: DashboardActivityRow) {
  return [row.day, ...ACTIVITY_SERIES.map((series) => `${series.label}：${row[series.key]}`)].join(
    "\n",
  );
}
