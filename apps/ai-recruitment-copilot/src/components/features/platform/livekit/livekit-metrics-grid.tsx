"use client";

import { IconChartHistogram, IconTags } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  textColumn,
  useDataGridState,
} from "@/components/data-grid";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { DetailFields, JsonBlock } from "./detail-fields";
import type { LiveKitMetricRecord, PaginatedResult } from "./types";
import { z } from "zod";

const EMPTY_FILTERS = {};

interface MetricsResult extends PaginatedResult<LiveKitMetricRecord> {
  configured: boolean;
}

interface MetricsQuery {
  page: string;
  pageSize: string;
  search?: string;
}

const metricsResultMetadataSchema = z.object({ configured: z.boolean() });

export function LiveKitMetricsGrid() {
  const [selected, setSelected] = useState<LiveKitMetricRecord | null>(null);
  const fetchMetrics = useCallback((params: { page: number; pageSize: number; search: string }) => {
    const query: MetricsQuery = {
      page: String(params.page),
      pageSize: String(params.pageSize),
    };
    if (params.search) {
      query.search = params.search;
    }
    return rpcFetch<MetricsResult>(
      rpc.api.platform.livekit.metrics.$get({
        query,
      }),
      "加载 LiveKit Prometheus 指标失败",
    );
  }, []);
  const grid = useDataGridState<LiveKitMetricRecord, Record<string, never>>({
    defaultPageSize: 20,
    initialFilters: EMPTY_FILTERS,
    queryFn: fetchMetrics,
    queryKeyBase: ["platform-livekit-metrics"],
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  const openDetail = useCallback((metric: LiveKitMetricRecord) => setSelected(metric), []);
  const metadataResult = metricsResultMetadataSchema.safeParse(grid.data);
  const metricsConfigured = metadataResult.success && metadataResult.data.configured;
  const columns = useMemo(
    () => [
      textColumn<LiveKitMetricRecord>({
        key: "name",
        primary: true,
        secondary: (metric) => metric.help,
        title: "指标",
        truncate: "max-w-md",
      }),
      customColumn<LiveKitMetricRecord>({
        cell: (metric) => (metric.type ? <Badge variant="outline">{metric.type}</Badge> : "—"),
        key: "type",
        title: "类型",
      }),
      customColumn<LiveKitMetricRecord>({
        cell: (metric) => <span className="font-mono tabular-nums">{metric.value}</span>,
        key: "value",
        title: "当前值",
      }),
      customColumn<LiveKitMetricRecord>({
        cell: (metric) => (
          <Badge variant="secondary">
            <IconTags />
            {Object.keys(metric.labels).length}
          </Badge>
        ),
        key: "labels",
        title: "标签",
      }),
      actionsColumn<LiveKitMetricRecord>({
        inline: [{ label: "查看", onClick: openDetail }],
      }),
    ],
    [openDetail],
  );

  return (
    <div className="py-6">
      <DataGrid<LiveKitMetricRecord>
        {...grid.bind}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconChartHistogram />
              </EmptyMedia>
              <EmptyTitle>没有可展示的指标</EmptyTitle>
              <EmptyDescription>
                {metricsConfigured
                  ? "Prometheus 已配置，请调整当前搜索条件或检查采集端是否返回样本。"
                  : "请在服务端配置 LIVEKIT_PROMETHEUS_URL 后启用 6789 指标采集。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "search",
            minWidth: "20rem",
            placeholder: "搜索指标名称或说明",
            type: "search",
          },
        ]}
        getRowId={(metric) => `${metric.name}:${JSON.stringify(metric.labels)}`}
      />

      <Drawer
        direction="right"
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        open={selected !== null}
      >
        <DrawerContent className="sm:max-w-xl">
          <DrawerHeader>
            <DrawerTitle className="break-all">{selected?.name ?? "指标详情"}</DrawerTitle>
            <DrawerDescription>{selected?.help ?? "Prometheus 实时采样值"}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-5 overflow-y-auto p-4 pt-0">
            <DetailFields
              fields={[
                { label: "类型", value: selected?.type },
                { label: "当前值", value: selected?.value },
              ]}
            />
            <div className="flex flex-col gap-2">
              <p className="font-medium text-sm">Labels</p>
              <JsonBlock value={selected?.labels ?? {}} />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
