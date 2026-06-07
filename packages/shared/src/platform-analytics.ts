export const PLATFORM_ANALYTICS_RANGE_DAYS = [7, 30, 90] as const;
export const DEFAULT_PLATFORM_ANALYTICS_RANGE_DAYS = 7;
export const PLATFORM_ANALYTICS_ACTIVITY_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE = 1;
export const DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE_SIZE = 10;

export type PlatformAnalyticsRangeDays = (typeof PLATFORM_ANALYTICS_RANGE_DAYS)[number];
export type PlatformAnalyticsActivityPageSize =
  (typeof PLATFORM_ANALYTICS_ACTIVITY_PAGE_SIZE_OPTIONS)[number];

export interface PlatformAnalyticsTotals {
  activeUsers: number;
  activeWorkspaces: number;
  interviewsCreated: number;
  pageViews: number;
  resumesParsed: number;
  resumesUploaded: number;
  totalEvents: number;
}

export interface PlatformAnalyticsDailyTrendItem {
  date: string;
  interviewsCreated: number;
  pageViews: number;
  resumesParsed: number;
  totalEvents: number;
}

export interface PlatformAnalyticsEventBreakdownItem {
  count: number;
  event: string;
}

export interface PlatformAnalyticsTopPageItem {
  pageKey: string;
  pagePath: string;
  views: number;
}

export interface PlatformAnalyticsTopWorkspaceItem {
  activeUsers: number;
  eventCount: number;
  workspaceId: string;
}

export interface PlatformAnalyticsTopUserItem {
  activeWorkspaces: number;
  eventCount: number;
  userId: string;
}

export interface PlatformAnalyticsDirectoryUser {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

export interface PlatformAnalyticsDirectoryWorkspace {
  id: string;
  name: string;
  slug: string;
}

export interface PlatformAnalyticsDirectory {
  users: Record<string, PlatformAnalyticsDirectoryUser>;
  workspaces: Record<string, PlatformAnalyticsDirectoryWorkspace>;
}

export interface PlatformAnalyticsActivityEvent {
  event: string;
  id: string;
  pageKey: string;
  pagePath: string;
  properties: {
    durationMs: number | null;
    fileSize: number | null;
    fileType: string | null;
    source: string | null;
    status: string | null;
  };
  timestamp: string;
  user: PlatformAnalyticsDirectoryUser | null;
  userId: string;
  workspace: PlatformAnalyticsDirectoryWorkspace | null;
  workspaceId: string;
}

export interface PlatformAnalyticsActivityPagination {
  page: number;
  pageSize: PlatformAnalyticsActivityPageSize;
  total: number;
  totalPages: number;
}

export interface PlatformAnalyticsSummary {
  activityEvents: PlatformAnalyticsActivityEvent[];
  activityPagination: PlatformAnalyticsActivityPagination;
  configured: boolean;
  dailyTrend: PlatformAnalyticsDailyTrendItem[];
  directory: PlatformAnalyticsDirectory;
  error: string | null;
  eventBreakdown: PlatformAnalyticsEventBreakdownItem[];
  filters: {
    rangeDays: PlatformAnalyticsRangeDays;
    userId: string | null;
    workspaceId: string | null;
  };
  topPages: PlatformAnalyticsTopPageItem[];
  topUsers: PlatformAnalyticsTopUserItem[];
  topWorkspaces: PlatformAnalyticsTopWorkspaceItem[];
  totals: PlatformAnalyticsTotals;
}

export const EMPTY_PLATFORM_ANALYTICS_TOTALS: PlatformAnalyticsTotals = {
  activeUsers: 0,
  activeWorkspaces: 0,
  interviewsCreated: 0,
  pageViews: 0,
  resumesParsed: 0,
  resumesUploaded: 0,
  totalEvents: 0,
};

export function normalizePlatformAnalyticsRangeDays(
  value: number | string | null | undefined,
): PlatformAnalyticsRangeDays {
  const numeric = Number(value);
  return PLATFORM_ANALYTICS_RANGE_DAYS.includes(numeric as PlatformAnalyticsRangeDays)
    ? (numeric as PlatformAnalyticsRangeDays)
    : DEFAULT_PLATFORM_ANALYTICS_RANGE_DAYS;
}

export function normalizePlatformAnalyticsActivityPage(value: number | string | null | undefined) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0
    ? numeric
    : DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE;
}

export function normalizePlatformAnalyticsActivityPageSize(
  value: number | string | null | undefined,
): PlatformAnalyticsActivityPageSize {
  const numeric = Number(value);
  return PLATFORM_ANALYTICS_ACTIVITY_PAGE_SIZE_OPTIONS.includes(
    numeric as PlatformAnalyticsActivityPageSize,
  )
    ? (numeric as PlatformAnalyticsActivityPageSize)
    : DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE_SIZE;
}
