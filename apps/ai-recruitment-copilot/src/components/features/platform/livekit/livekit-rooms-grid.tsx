"use client";

import { listTextQuery } from "@arc/shared/list-text-filters";

import { IconMicrophone, IconRadio, IconUsers, IconVideo } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { DetailFields, JsonBlock } from "./detail-fields";
import type { LiveKitParticipantRecord, LiveKitRoomRecord, PaginatedResult } from "./types";

interface RoomDetailResult {
  metadata: string;
  participants: LiveKitParticipantRecord[];
  room: LiveKitRoomRecord;
}

interface LiveKitRoomsQuery {
  page: string;
  pageSize: string;
  search?: string;
}

const EMPTY_FILTERS = {};

function ParticipantCard({ participant }: { participant: LiveKitParticipantRecord }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{participant.name || participant.identity}</p>
          <p className="truncate text-muted-foreground text-xs">{participant.identity}</p>
        </div>
        <Badge variant={participant.state === "活跃" ? "default" : "secondary"}>
          {participant.state}
        </Badge>
      </div>
      <DetailFields
        fields={[
          { label: "类型", value: participant.kind },
          { label: "区域", value: participant.region },
          { label: "加入时间", value: participant.joinedAt },
          { label: "Participant SID", value: participant.sid },
        ]}
      />
      <div className="flex flex-col gap-2">
        <p className="font-medium text-sm">发布轨道</p>
        {participant.tracks.length === 0 ? (
          <p className="text-muted-foreground text-sm">未发布媒体轨道</p>
        ) : (
          participant.tracks.map((track) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3"
              key={track.sid}
            >
              <div className="flex min-w-0 items-center gap-2">
                {track.type === "视频" ? <IconVideo /> : <IconMicrophone />}
                <div className="min-w-0">
                  <p className="truncate text-sm">{track.name || track.source}</p>
                  <p className="truncate text-muted-foreground text-xs">{track.mimeType}</p>
                </div>
              </div>
              <Badge variant={track.muted ? "outline" : "secondary"}>
                {track.muted ? "静音" : "发送中"}
              </Badge>
            </div>
          ))
        )}
      </div>
      {Object.keys(participant.attributes).length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-sm">Attributes</p>
          <JsonBlock value={participant.attributes} />
        </div>
      ) : null}
    </div>
  );
}

function RoomDetailDrawer({
  onOpenChange,
  open,
  roomName,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  roomName: string | null;
}) {
  const query = useQuery({
    enabled: open && roomName !== null,
    queryFn: () =>
      rpcFetch<RoomDetailResult>(
        rpc.api.platform.livekit.rooms[":roomName"].$get({
          param: { roomName: roomName ?? "" },
        }),
        "加载房间详情失败",
      ),
    queryKey: ["platform-livekit-room", roomName],
  });

  return (
    <Drawer direction="right" onOpenChange={onOpenChange} open={open}>
      <DrawerContent className="sm:max-w-2xl">
        <DrawerHeader>
          <DrawerTitle>{roomName ?? "房间详情"}</DrawerTitle>
          <DrawerDescription>当前参与者、发布轨道与房间运行参数。</DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          {query.isLoading ? <Skeleton className="h-64 w-full" /> : null}
          {query.isError ? (
            <p className="text-destructive text-sm">
              {query.error instanceof Error ? query.error.message : "加载失败"}
            </p>
          ) : null}
          {query.data ? (
            <div className="flex flex-col gap-5">
              <DetailFields
                fields={[
                  { label: "Room SID", value: query.data.room.sid },
                  { label: "创建时间", value: query.data.room.createdAt },
                  { label: "参与者", value: query.data.room.numParticipants },
                  { label: "发布者", value: query.data.room.numPublishers },
                  { label: "空房超时", value: `${query.data.room.emptyTimeout} 秒` },
                  {
                    label: "最大参与者",
                    value: query.data.room.maxParticipants || "未限制",
                  },
                ]}
              />
              {query.data.metadata ? (
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-sm">Room Metadata</p>
                  <JsonBlock value={query.data.metadata} />
                </div>
              ) : null}
              <Separator />
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">参与者</p>
                <Badge variant="outline">{query.data.participants.length}</Badge>
              </div>
              {query.data.participants.length === 0 ? (
                <p className="text-muted-foreground text-sm">房间中暂无参与者。</p>
              ) : (
                query.data.participants.map((participant) => (
                  <ParticipantCard key={participant.sid} participant={participant} />
                ))
              )}
            </div>
          ) : null}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

export function LiveKitRoomsGrid() {
  const [detailRoomName, setDetailRoomName] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const fetchRooms = useCallback(
    (params: {
      page: number;
      pageSize: number;
      search: string;
      filters: Record<string, string>;
    }) => {
      const query: LiveKitRoomsQuery = {
        ...listTextQuery(params),
        page: String(params.page),
        pageSize: String(params.pageSize),
      };
      if (params.search) {
        query.search = params.search;
      }
      return rpcFetch<PaginatedResult<LiveKitRoomRecord>>(
        rpc.api.platform.livekit.rooms.$get({ query }),
        "加载 LiveKit 房间失败",
      );
    },
    [],
  );
  const grid = useDataGridState<LiveKitRoomRecord, Record<string, never>>({
    defaultPageSize: 20,
    initialFilters: EMPTY_FILTERS,
    queryFn: fetchRooms,
    queryKeyBase: ["platform-livekit-rooms"],
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });
  const openDetail = useCallback((room: LiveKitRoomRecord) => {
    setDetailRoomName(room.name);
    setDetailOpen(true);
  }, []);
  const columns = useMemo(
    () => [
      textColumn<LiveKitRoomRecord>({
        key: "name",
        primary: true,
        secondary: (room) => room.sid,
        title: "房间",
      }),
      customColumn<LiveKitRoomRecord>({
        cell: (room) => (
          <Badge variant="outline">
            <IconUsers />
            {room.numParticipants}
          </Badge>
        ),
        key: "numParticipants",
        title: "参与者",
      }),
      customColumn<LiveKitRoomRecord>({
        cell: (room) => room.numPublishers,
        key: "numPublishers",
        title: "发布者",
      }),
      customColumn<LiveKitRoomRecord>({
        cell: (room) => (
          <Badge variant={room.activeRecording ? "default" : "secondary"}>
            {room.activeRecording ? "录制中" : "未录制"}
          </Badge>
        ),
        key: "activeRecording",
        title: "录制",
      }),
      dateColumn<LiveKitRoomRecord>({ key: "createdAt", title: "创建时间" }),
      actionsColumn<LiveKitRoomRecord>({
        inline: [{ label: "查看", onClick: openDetail }],
      }),
    ],
    [openDetail],
  );

  return (
    <div className="py-6">
      <DataGrid<LiveKitRoomRecord>
        {...grid.bind}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconRadio />
              </EmptyMedia>
              <EmptyTitle>没有活跃房间</EmptyTitle>
              <EmptyDescription>
                房间在首位参与者加入后自动出现，关闭后从列表移除。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "textFilters" as const,
            resource: "rooms" as const,
            type: "text-filters" as const,
          },
        ]}
        getRowId={(room) => room.sid}
      />
      <RoomDetailDrawer onOpenChange={setDetailOpen} open={detailOpen} roomName={detailRoomName} />
    </div>
  );
}
