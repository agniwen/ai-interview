"use client";

import type {
  PlatformAnalyticsActivityEvent,
  PlatformAnalyticsSummary,
} from "@/lib/shared/platform-analytics";
import { PLATFORM_ANALYTICS_RANGE_DAYS } from "@/lib/shared/platform-analytics";
import { ActivityIcon, CheckCircle2Icon, CircleDotIcon, XCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { customColumn, DataGrid } from "@/components/data-grid";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "U";
  }
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function getEventTone(event: string) {
  if (event.includes("failed")) {
    return {
      icon: XCircleIcon,
    };
  }
  if (event.includes("completed") || event.includes("created") || event.includes("matched")) {
    return {
      icon: CheckCircle2Icon,
    };
  }
  return {
    icon: CircleDotIcon,
  };
}

const EVENT_LABELS: Record<string, string> = {
  interview_created: "创建面试",
  interviewer_created: "创建面试官",
  job_description_created: "创建在招岗位",
  job_description_updated: "更新在招岗位",
  job_interviewer_matched: "匹配岗位面试官",
  page_viewed: "访问页面",
  resume_parse_completed: "简历解析完成",
  resume_parse_failed: "简历解析失败",
  resume_parse_started: "开始简历解析",
  resume_upload_completed: "简历上传完成",
  resume_upload_started: "开始上传简历",
};

function getEventLabel(event: string) {
  return EVENT_LABELS[event] ?? "产品事件";
}

function StatStrip({ dashboard }: { dashboard: PlatformAnalyticsSummary }) {
  const items = [
    {
      description: "所有已追踪产品事件",
      id: "totalEvents",
      label: "Total events",
      value: dashboard.totals.totalEvents,
    },
    {
      description: "去重 user_id",
      id: "activeUsers",
      label: "Active users",
      value: dashboard.totals.activeUsers,
    },
    {
      description: "自定义 page_viewed 事件",
      id: "pageViews",
      label: "Page views",
      value: dashboard.totals.pageViews,
    },
    {
      description: "最近 100 条事件中的当前返回数",
      id: "recentActivity",
      label: "Recent activity",
      value: dashboard.activityEvents.length,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className="pb-2">
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {formatNumber(item.value)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground text-sm">{item.description}</div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function PropertyBadge({ label, value }: { label: string; value: number | string | null }) {
  if (value === null || value === "") {
    return null;
  }

  return (
    <Badge className="max-w-full justify-start" variant="outline">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono">{value}</span>
    </Badge>
  );
}

function ActivityEventDetails({ event }: { event: PlatformAnalyticsActivityEvent }) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span className="shrink-0 font-medium text-sm">{getEventLabel(event.event)}</span>
      <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
        {event.event}
      </span>
      {event.pageKey ? <Badge variant="secondary">{event.pageKey}</Badge> : null}
      <PropertyBadge label="status" value={event.properties.status} />
      <PropertyBadge label="source" value={event.properties.source} />
      <PropertyBadge label="file" value={event.properties.fileType} />
      <PropertyBadge label="size" value={event.properties.fileSize} />
      <PropertyBadge label="ms" value={event.properties.durationMs} />
    </div>
  );
}

function ActivityPathCell({ event }: { event: PlatformAnalyticsActivityEvent }) {
  if (!event.pagePath) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-sm">{event.pagePath}</p>
      {event.pageKey ? (
        <p className="truncate text-muted-foreground text-xs">{event.pageKey}</p>
      ) : null}
    </div>
  );
}

function ActivityUserCell({ event }: { event: PlatformAnalyticsActivityEvent }) {
  const displayName = event.user?.name || event.user?.email || event.userId;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8">
        <AvatarImage alt={displayName} src={event.user?.image ?? undefined} />
        <AvatarFallback>{getInitials(event.user?.name, event.user?.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{displayName}</p>
        <p className="truncate text-muted-foreground text-xs">
          {event.user?.email ?? event.userId}
        </p>
      </div>
    </div>
  );
}

function ActivityWorkspaceCell({ event }: { event: PlatformAnalyticsActivityEvent }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-sm">{event.workspace?.name ?? event.workspaceId}</p>
      <p className="truncate font-mono text-muted-foreground text-xs">
        {event.workspace?.slug ? `/w/${event.workspace.slug}` : event.workspaceId}
      </p>
    </div>
  );
}

function ActivityTable({ dashboard }: { dashboard: PlatformAnalyticsSummary }) {
  const router = useRouter();
  const events = dashboard.activityEvents;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const columns = useMemo(
    () => [
      customColumn<PlatformAnalyticsActivityEvent>({
        cell: (event) => {
          const tone = getEventTone(event.event);
          return (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <tone.icon className="size-4" />
              <TimeDisplay
                className="font-mono tabular-nums"
                options={DATE_TIME_DISPLAY_OPTIONS}
                value={event.timestamp}
              />
            </div>
          );
        },
        key: "timestamp",
        title: "时间",
      }),
      customColumn<PlatformAnalyticsActivityEvent>({
        cell: (event) => <ActivityEventDetails event={event} />,
        key: "event",
        title: "事件",
      }),
      customColumn<PlatformAnalyticsActivityEvent>({
        cell: (event) => <ActivityPathCell event={event} />,
        key: "path",
        title: "Path",
      }),
      customColumn<PlatformAnalyticsActivityEvent>({
        cell: (event) => <ActivityUserCell event={event} />,
        key: "user",
        title: "用户",
      }),
      customColumn<PlatformAnalyticsActivityEvent>({
        cell: (event) => <ActivityWorkspaceCell event={event} />,
        key: "workspace",
        title: "工作区",
      }),
    ],
    [],
  );
  const filters = useMemo(
    () => [
      {
        key: "rangeDays",
        options: PLATFORM_ANALYTICS_RANGE_DAYS.map((days) => ({
          label: `最近 ${days} 天`,
          value: String(days),
        })),
        placeholder: "时间范围",
        type: "select" as const,
      },
      {
        emptyMessage: "没有匹配的工作区",
        key: "workspaceId",
        options: Object.values(dashboard.directory.workspaces).map((workspace) => ({
          description: `/w/${workspace.slug}`,
          label: workspace.name,
          searchValue: `${workspace.name} ${workspace.slug} ${workspace.id}`,
          value: workspace.id,
        })),
        placeholder: "按工作区筛选",
        searchPlaceholder: "搜索工作区名称或 slug…",
        type: "select" as const,
      },
      {
        emptyMessage: "没有匹配的用户",
        key: "userId",
        options: Object.values(dashboard.directory.users).map((user) => ({
          description: user.email,
          label: user.name || user.email,
          searchValue: `${user.name} ${user.email} ${user.id}`,
          value: user.id,
        })),
        placeholder: "按用户筛选",
        searchPlaceholder: "搜索姓名或邮箱…",
        type: "select" as const,
      },
    ],
    [dashboard.directory.users, dashboard.directory.workspaces],
  );
  const filterValues = useMemo(
    () => ({
      rangeDays: String(dashboard.filters.rangeDays),
      userId: dashboard.filters.userId ?? "",
      workspaceId: dashboard.filters.workspaceId ?? "",
    }),
    [dashboard.filters.rangeDays, dashboard.filters.userId, dashboard.filters.workspaceId],
  );
  const canResetFilters =
    filterValues.rangeDays !== "30" ||
    filterValues.userId !== "" ||
    filterValues.workspaceId !== "";

  function replaceFilters(nextValues: Record<string, string>) {
    const params = new URLSearchParams();
    if (nextValues.rangeDays) {
      params.set("rangeDays", nextValues.rangeDays);
    }
    if (nextValues.workspaceId.trim()) {
      params.set("workspaceId", nextValues.workspaceId.trim());
    }
    if (nextValues.userId.trim()) {
      params.set("userId", nextValues.userId.trim());
    }
    const query = params.toString();
    router.replace(query ? `/platform/analytics?${query}` : "/platform/analytics");
  }

  return (
    <DataGrid<PlatformAnalyticsActivityEvent>
      canResetFilters={canResetFilters}
      columns={columns}
      columnPinning={{ left: ["timestamp"] }}
      data={pageRows}
      empty={
        <Empty className="border-border">
          <EmptyHeader>
            <EmptyTitle>暂无 activity</EmptyTitle>
            <EmptyDescription>
              有新的埋点事件进入 PostHog 后，这里会按时间倒序展示。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      filterValues={filterValues}
      filters={filters}
      getRowId={(event) => event.id}
      onFilterChange={(key, value) => {
        setPage(1);
        replaceFilters({
          ...filterValues,
          [key]: value,
        });
      }}
      onRefresh={() => router.refresh()}
      onResetFilters={() => {
        setPage(1);
        router.replace("/platform/analytics");
      }}
      pageSizeOptions={[10, 20, 50, 100]}
      pagination={{
        onPageChange: setPage,
        onPageSizeChange: (nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        },
        page: currentPage,
        pageSize,
      }}
      total={events.length}
      totalPages={totalPages}
    />
  );
}

export function AnalyticsDashboardPage({ dashboard }: { dashboard: PlatformAnalyticsSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-semibold text-2xl tracking-normal">Activity</h1>
            <Badge variant={dashboard.configured ? "success" : "outline"}>
              {dashboard.configured ? "PostHog connected" : "PostHog not configured"}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            实时事件流 · 最近 {dashboard.filters.rangeDays} 天 · 按 user_id 和 workspace_id
            追踪平台埋点
          </p>
        </div>
      </div>

      {dashboard.configured ? null : (
        <Alert>
          <ActivityIcon className="size-4" />
          <AlertTitle>缺少 PostHog 服务端配置</AlertTitle>
          <AlertDescription>
            请配置 POSTHOG_PERSONAL_API_KEY、POSTHOG_PROJECT_ID 和 POSTHOG_API_HOST 后重新部署。
          </AlertDescription>
        </Alert>
      )}

      {dashboard.error ? (
        <Alert variant="destructive">
          <ActivityIcon className="size-4" />
          <AlertTitle>PostHog 查询失败</AlertTitle>
          <AlertDescription>{dashboard.error}</AlertDescription>
        </Alert>
      ) : null}

      <StatStrip dashboard={dashboard} />

      <div className="min-w-0">
        <section className="min-w-0">
          <div className="mb-3">
            <h2 className="font-semibold text-base">Live activity</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              最近 100 条埋点事件，按 PostHog timestamp 倒序。
            </p>
          </div>
          <ActivityTable dashboard={dashboard} />
        </section>
      </div>
    </div>
  );
}
