import type { Metadata } from "next";
import {
  normalizePlatformAnalyticsActivityPage,
  normalizePlatformAnalyticsActivityPageSize,
  normalizePlatformAnalyticsRangeDays,
} from "@/lib/shared/platform-analytics";
import { loadPlatformAnalyticsSummary } from "@/server/routes/platform/analytics";
import { loadPlatformAnalyticsDirectory } from "@/server/routes/platform/directory";
import { AnalyticsDashboardPage } from "./_components/analytics-dashboard-page";

export const metadata: Metadata = {
  title: "平台 · 埋点数据",
};

export default async function PlatformAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    rangeDays?: string;
    userId?: string;
    workspaceId?: string;
  }>;
}) {
  const params = await searchParams;
  const directory = await loadPlatformAnalyticsDirectory();
  const dashboard = await loadPlatformAnalyticsSummary({
    directory,
    page: normalizePlatformAnalyticsActivityPage(params.page),
    pageSize: normalizePlatformAnalyticsActivityPageSize(params.pageSize),
    rangeDays: normalizePlatformAnalyticsRangeDays(params.rangeDays),
    userId: params.userId || null,
    workspaceId: params.workspaceId || null,
  });

  return <AnalyticsDashboardPage dashboard={dashboard} />;
}
