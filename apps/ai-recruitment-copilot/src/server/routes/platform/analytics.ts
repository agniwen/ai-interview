import type {
  PlatformAnalyticsActivityEvent,
  PlatformAnalyticsActivityPageSize,
  PlatformAnalyticsDirectory,
  PlatformAnalyticsDailyTrendItem,
  PlatformAnalyticsEventBreakdownItem,
  PlatformAnalyticsRangeDays,
  PlatformAnalyticsSummary,
  PlatformAnalyticsTopPageItem,
  PlatformAnalyticsTopUserItem,
  PlatformAnalyticsTopWorkspaceItem,
  PlatformAnalyticsTotals,
} from "@/lib/shared/platform-analytics";
import {
  DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE,
  DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE_SIZE,
  EMPTY_PLATFORM_ANALYTICS_TOTALS,
  normalizePlatformAnalyticsActivityPage,
  normalizePlatformAnalyticsActivityPageSize,
} from "@/lib/shared/platform-analytics";

export interface PostHogAnalyticsConfig {
  apiHost: string;
  personalApiKey: string;
  projectId: string;
}

interface LoadPlatformAnalyticsSummaryOptions {
  config?: PostHogAnalyticsConfig | null;
  directory?: PlatformAnalyticsDirectory;
  fetchImpl?: typeof fetch;
  page?: number;
  pageSize?: number;
  rangeDays: PlatformAnalyticsRangeDays;
  userId?: string | null;
  workspaceId?: string | null;
}

const POSTHOG_QUERY_TIMEOUT_MS = 15_000;

const EMPTY_DIRECTORY: PlatformAnalyticsDirectory = {
  users: {},
  workspaces: {},
};

const TRACKED_EVENTS = [
  "page_viewed",
  "resume_parse_started",
  "resume_parse_completed",
  "resume_parse_failed",
  "resume_upload_started",
  "resume_upload_completed",
  "interview_created",
  "interviewer_created",
  "job_description_created",
  "job_description_updated",
  "job_interviewer_matched",
];

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function readPostHogAnalyticsConfig(): PostHogAnalyticsConfig | null {
  const personalApiKey = readEnv("POSTHOG_PERSONAL_API_KEY");
  const projectId = readEnv("POSTHOG_PROJECT_ID");
  if (!personalApiKey || !projectId) {
    return null;
  }

  return {
    apiHost: readEnv("POSTHOG_API_HOST") ?? "https://us.posthog.com",
    personalApiKey,
    projectId,
  };
}

function emptySummary(
  rangeDays: PlatformAnalyticsRangeDays,
  workspaceId?: string | null,
  userId?: string | null,
  error: string | null = null,
  page = DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE,
  pageSize: PlatformAnalyticsActivityPageSize = DEFAULT_PLATFORM_ANALYTICS_ACTIVITY_PAGE_SIZE,
): PlatformAnalyticsSummary {
  return {
    activityEvents: [],
    activityPagination: {
      page: Math.min(page, 1),
      pageSize,
      total: 0,
      totalPages: 1,
    },
    configured: false,
    dailyTrend: [],
    directory: EMPTY_DIRECTORY,
    error,
    eventBreakdown: [],
    filters: {
      rangeDays,
      userId: userId ?? null,
      workspaceId: workspaceId ?? null,
    },
    topPages: [],
    topUsers: [],
    topWorkspaces: [],
    totals: EMPTY_PLATFORM_ANALYTICS_TOTALS,
  };
}

function emptyConfiguredSummary({
  error,
  page,
  pageSize,
  rangeDays,
  userId,
  workspaceId,
}: {
  error: string;
  page?: number;
  pageSize?: PlatformAnalyticsActivityPageSize;
  rangeDays: PlatformAnalyticsRangeDays;
  userId?: string | null;
  workspaceId?: string | null;
}): PlatformAnalyticsSummary {
  return {
    ...emptySummary(rangeDays, workspaceId, userId, error, page, pageSize),
    configured: true,
  };
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildBaseWhere({
  rangeDays,
  userId,
  workspaceId,
}: {
  rangeDays: PlatformAnalyticsRangeDays;
  userId?: string | null;
  workspaceId?: string | null;
}) {
  const clauses = [
    `timestamp >= now() - INTERVAL ${rangeDays} DAY`,
    `event IN (${TRACKED_EVENTS.map(sqlString).join(", ")})`,
    "properties.workspace_id IS NOT NULL",
    "properties.workspace_id != ''",
    "properties.user_id IS NOT NULL",
    "properties.user_id != ''",
  ];
  if (workspaceId?.trim()) {
    clauses.push(`properties.workspace_id = ${sqlString(workspaceId.trim())}`);
  }
  if (userId?.trim()) {
    clauses.push(`properties.user_id = ${sqlString(userId.trim())}`);
  }
  return clauses.join("\n  AND ");
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

async function executeHogQL(
  query: string,
  config: PostHogAnalyticsConfig,
  fetchImpl: typeof fetch,
): Promise<unknown[][]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POSTHOG_QUERY_TIMEOUT_MS);

  try {
    const response = await fetchImpl(
      `${config.apiHost.replace(/\/+$/, "")}/api/projects/${encodeURIComponent(config.projectId)}/query/`,
      {
        body: JSON.stringify({
          name: "AI Recruitment Copilot platform analytics",
          query: {
            kind: "HogQLQuery",
            query,
          },
        }),
        headers: {
          Authorization: `Bearer ${config.personalApiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`PostHog query failed with status ${response.status}`);
    }

    const payload = (await response.json().catch(() => null)) as { results?: unknown[][] } | null;
    return Array.isArray(payload?.results) ? payload.results : [];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("PostHog 查询超时，请检查服务器到 PostHog API 的网络连接。", {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildActivityPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: PlatformAnalyticsActivityPageSize;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page: Math.min(page, totalPages),
    pageSize,
    total,
    totalPages,
  };
}

function buildQueries(
  where: string,
  activityPagination: {
    page: number;
    pageSize: PlatformAnalyticsActivityPageSize;
  },
) {
  const activityOffset = (activityPagination.page - 1) * activityPagination.pageSize;

  return {
    activityEvents: `
SELECT
  uuid,
  timestamp,
  event,
  properties.user_id AS user_id,
  properties.workspace_id AS workspace_id,
  properties.page_path AS page_path,
  properties.page_key AS page_key,
  properties.status AS status,
  properties.source AS source,
  properties.file_type AS file_type,
  properties.file_size AS file_size,
  properties.duration_ms AS duration_ms
FROM events
WHERE ${where}
ORDER BY timestamp DESC
LIMIT ${activityPagination.pageSize}
OFFSET ${activityOffset}
`,
    dailyTrend: `
SELECT
  toDate(timestamp) AS date,
  count() AS total_events,
  countIf(event = 'page_viewed') AS page_views,
  countIf(event = 'resume_parse_completed') AS resumes_parsed,
  countIf(event = 'interview_created') AS interviews_created
FROM events
WHERE ${where}
GROUP BY date
ORDER BY date ASC
`,
    eventBreakdown: `
SELECT event, count() AS event_count
FROM events
WHERE ${where}
GROUP BY event
ORDER BY event_count DESC
LIMIT 20
`,
    topPages: `
SELECT
  properties.page_path AS page_path,
  properties.page_key AS page_key,
  count() AS views
FROM events
WHERE ${where}
  AND event = 'page_viewed'
GROUP BY page_path, page_key
ORDER BY views DESC
LIMIT 10
`,
    topUsers: `
SELECT
  properties.user_id AS user_id,
  count() AS event_count,
  count(DISTINCT properties.workspace_id) AS active_workspaces
FROM events
WHERE ${where}
  AND properties.user_id IS NOT NULL
  AND properties.user_id != ''
GROUP BY user_id
ORDER BY event_count DESC
LIMIT 10
`,
    topWorkspaces: `
SELECT
  properties.workspace_id AS workspace_id,
  count() AS event_count,
  count(DISTINCT properties.user_id) AS active_users
FROM events
WHERE ${where}
  AND properties.workspace_id IS NOT NULL
  AND properties.workspace_id != ''
GROUP BY workspace_id
ORDER BY event_count DESC
LIMIT 10
`,
    totals: `
SELECT
  count() AS total_events,
  count(DISTINCT properties.user_id) AS active_users,
  count(DISTINCT properties.workspace_id) AS active_workspaces,
  countIf(event = 'page_viewed') AS page_views,
  countIf(event = 'resume_parse_completed') AS resumes_parsed,
  countIf(event = 'resume_upload_completed') AS resumes_uploaded,
  countIf(event = 'interview_created') AS interviews_created
FROM events
WHERE ${where}
`,
  };
}

function mapTotals(rows: unknown[][]): PlatformAnalyticsTotals {
  const row = rows[0] ?? [];
  return {
    activeUsers: toNumber(row[1]),
    activeWorkspaces: toNumber(row[2]),
    interviewsCreated: toNumber(row[6]),
    pageViews: toNumber(row[3]),
    resumesParsed: toNumber(row[4]),
    resumesUploaded: toNumber(row[5]),
    totalEvents: toNumber(row[0]),
  };
}

function mapDailyTrend(rows: unknown[][]): PlatformAnalyticsDailyTrendItem[] {
  return rows.map((row) => ({
    date: toStringValue(row[0]),
    interviewsCreated: toNumber(row[4]),
    pageViews: toNumber(row[2]),
    resumesParsed: toNumber(row[3]),
    totalEvents: toNumber(row[1]),
  }));
}

function mapEventBreakdown(rows: unknown[][]): PlatformAnalyticsEventBreakdownItem[] {
  return rows.map((row) => ({
    count: toNumber(row[1]),
    event: toStringValue(row[0]),
  }));
}

function mapTopPages(rows: unknown[][]): PlatformAnalyticsTopPageItem[] {
  return rows.map((row) => ({
    pageKey: toStringValue(row[1]),
    pagePath: toStringValue(row[0]),
    views: toNumber(row[2]),
  }));
}

function mapTopWorkspaces(rows: unknown[][]): PlatformAnalyticsTopWorkspaceItem[] {
  return rows.map((row) => ({
    activeUsers: toNumber(row[2]),
    eventCount: toNumber(row[1]),
    workspaceId: toStringValue(row[0]),
  }));
}

function mapTopUsers(rows: unknown[][]): PlatformAnalyticsTopUserItem[] {
  return rows.map((row) => ({
    activeWorkspaces: toNumber(row[2]),
    eventCount: toNumber(row[1]),
    userId: toStringValue(row[0]),
  }));
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return toStringValue(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return toNumber(value);
}

function mapActivityEvents(
  rows: unknown[][],
  directory: PlatformAnalyticsDirectory,
): PlatformAnalyticsActivityEvent[] {
  return rows.map((row, index) => ({
    event: toStringValue(row[2]),
    id: toStringValue(row[0]) || `${toStringValue(row[1])}-${index}`,
    pageKey: toStringValue(row[6]),
    pagePath: toStringValue(row[5]),
    properties: {
      durationMs: nullableNumber(row[11]),
      fileSize: nullableNumber(row[10]),
      fileType: nullableString(row[9]),
      source: nullableString(row[8]),
      status: nullableString(row[7]),
    },
    timestamp: toStringValue(row[1]),
    user: directory.users[toStringValue(row[3])] ?? null,
    userId: toStringValue(row[3]),
    workspace: directory.workspaces[toStringValue(row[4])] ?? null,
    workspaceId: toStringValue(row[4]),
  }));
}

export async function loadPlatformAnalyticsSummary({
  config = readPostHogAnalyticsConfig(),
  directory = EMPTY_DIRECTORY,
  fetchImpl = fetch,
  page,
  pageSize,
  rangeDays,
  userId,
  workspaceId,
}: LoadPlatformAnalyticsSummaryOptions): Promise<PlatformAnalyticsSummary> {
  const activityPage = normalizePlatformAnalyticsActivityPage(page);
  const activityPageSize = normalizePlatformAnalyticsActivityPageSize(pageSize);

  if (!config) {
    return emptySummary(rangeDays, workspaceId, userId, null, activityPage, activityPageSize);
  }

  const where = buildBaseWhere({ rangeDays, userId, workspaceId });
  let activityPagination = buildActivityPagination({
    page: activityPage,
    pageSize: activityPageSize,
    total: 0,
  });
  let queries = buildQueries(where, activityPagination);
  let totals: unknown[][];
  let dailyTrend: unknown[][];
  let eventBreakdown: unknown[][];
  let topPages: unknown[][];
  let topWorkspaces: unknown[][];
  let topUsers: unknown[][];
  let activityEvents: unknown[][];
  let mappedTotals: PlatformAnalyticsTotals;
  try {
    totals = await executeHogQL(queries.totals, config, fetchImpl);
    mappedTotals = mapTotals(totals);
    activityPagination = buildActivityPagination({
      page: activityPage,
      pageSize: activityPageSize,
      total: mappedTotals.totalEvents,
    });
    queries = buildQueries(where, activityPagination);
    activityEvents = await executeHogQL(queries.activityEvents, config, fetchImpl);
    dailyTrend = await executeHogQL(queries.dailyTrend, config, fetchImpl);
    eventBreakdown = await executeHogQL(queries.eventBreakdown, config, fetchImpl);
    topPages = await executeHogQL(queries.topPages, config, fetchImpl);
    topWorkspaces = await executeHogQL(queries.topWorkspaces, config, fetchImpl);
    topUsers = await executeHogQL(queries.topUsers, config, fetchImpl);
  } catch (error) {
    return emptyConfiguredSummary({
      error: error instanceof Error ? error.message : "PostHog 查询失败，请稍后重试。",
      page: activityPage,
      pageSize: activityPageSize,
      rangeDays,
      userId,
      workspaceId,
    });
  }

  return {
    activityEvents: mapActivityEvents(activityEvents, directory),
    activityPagination,
    configured: true,
    dailyTrend: mapDailyTrend(dailyTrend),
    directory,
    error: null,
    eventBreakdown: mapEventBreakdown(eventBreakdown),
    filters: {
      rangeDays,
      userId: userId ?? null,
      workspaceId: workspaceId ?? null,
    },
    topPages: mapTopPages(topPages),
    topUsers: mapTopUsers(topUsers),
    topWorkspaces: mapTopWorkspaces(topWorkspaces),
    totals: mappedTotals,
  };
}
