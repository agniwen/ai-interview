"use client";

import {
  IconActivityHeartbeat,
  IconAntennaBars5,
  IconDeviceDesktopAnalytics,
  IconRadio,
  IconServer,
  IconUsers,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { LIVEKIT_DEPLOYMENT_COMPONENTS } from "./deployment-components";
import type { DeploymentComponent } from "./deployment-components";
import { DetailFields } from "./detail-fields";

interface OverviewResult {
  endpoint: string | null;
  error?: string;
  latencyMs: number;
  metricsConfigured: boolean;
  status: "offline" | "online";
  totals: {
    activeRecordings: number;
    participants: number;
    publishers: number;
    rooms: number;
  };
}

const EMPTY_OVERVIEW: OverviewResult = {
  endpoint: null,
  latencyMs: 0,
  metricsConfigured: false,
  status: "offline",
  totals: { activeRecordings: 0, participants: 0, publishers: 0, rooms: 0 },
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IconRadio;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <Icon className="text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardPanel>
        <p className="font-semibold text-2xl tabular-nums">{value}</p>
      </CardPanel>
    </Card>
  );
}

function ServiceStatusCard({ data }: { data: OverviewResult }) {
  const online = data.status === "online";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconActivityHeartbeat />
          自部署服务状态
        </CardTitle>
        <CardAction>
          <Badge variant={online ? "default" : "destructive"}>{online ? "在线" : "不可用"}</Badge>
        </CardAction>
      </CardHeader>
      <CardPanel className="flex flex-col gap-2 text-sm">
        <p className="break-all">{data.endpoint ?? "未配置 LIVEKIT_URL"}</p>
        <p className="text-muted-foreground">
          探测耗时 {data.latencyMs} ms{data.error ? ` · ${data.error}` : ""}
        </p>
      </CardPanel>
    </Card>
  );
}

function DeploymentCards({
  metricsConfigured,
  onSelect,
}: {
  metricsConfigured: boolean;
  onSelect: (value: DeploymentComponent) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>部署组件</CardTitle>
      </CardHeader>
      <CardPanel className="grid gap-3 sm:grid-cols-2">
        {LIVEKIT_DEPLOYMENT_COMPONENTS.map((component) => (
          <Card key={component.id}>
            <CardHeader>
              <CardTitle className="text-base">{component.name}</CardTitle>
              <CardDescription>{component.role}</CardDescription>
              <CardAction>
                {component.id === "prometheus" ? (
                  <Badge variant={metricsConfigured ? "default" : "outline"}>
                    {metricsConfigured ? "已配置" : "未配置"}
                  </Badge>
                ) : null}
              </CardAction>
            </CardHeader>
            <CardPanel className="flex items-center justify-between gap-3">
              <code className="truncate text-xs">{component.endpoint}</code>
              <Button onClick={() => onSelect(component)} size="sm" variant="ghost">
                查看
              </Button>
            </CardPanel>
          </Card>
        ))}
      </CardPanel>
    </Card>
  );
}

export function LiveKitOverview() {
  const [selected, setSelected] = useState<DeploymentComponent | null>(null);
  const query = useQuery({
    queryFn: () => rpcFetch(rpc.api.platform.livekit.overview.$get(), "加载 LiveKit 服务概览失败"),
    queryKey: ["platform-livekit-overview"],
    refetchInterval: 15_000,
  });

  if (query.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  const data = query.data ?? EMPTY_OVERVIEW;
  return (
    <div className="flex flex-col gap-6 py-6">
      <ServiceStatusCard data={data} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IconRadio} label="活跃房间" value={data.totals.rooms} />
        <StatCard icon={IconUsers} label="在线参与者" value={data.totals.participants} />
        <StatCard icon={IconAntennaBars5} label="发布者" value={data.totals.publishers} />
        <StatCard
          icon={IconDeviceDesktopAnalytics}
          label="正在录制"
          value={data.totals.activeRecordings}
        />
      </div>

      <DeploymentCards metricsConfigured={data.metricsConfigured} onSelect={setSelected} />

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
            <DrawerTitle className="flex items-center gap-2">
              <IconServer />
              {selected?.name ?? "组件详情"}
            </DrawerTitle>
            <DrawerDescription>{selected?.role}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto p-4 pt-0">
            <DetailFields fields={selected?.details ?? []} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
