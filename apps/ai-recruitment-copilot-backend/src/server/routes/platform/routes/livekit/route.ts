import { zValidator } from "@hono/zod-validator";
import { RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  parsePrometheusMetrics,
  safeEndpoint,
  toLiveKitHttpUrl,
  toParticipantRecord,
  toRoomRecord,
} from "./utils";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

function getRoomServiceClient(): RoomServiceClient {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!(url && apiKey && apiSecret)) {
    throw new Error("LiveKit 服务端连接未配置完整");
  }
  return new RoomServiceClient(toLiveKitHttpUrl(url), apiKey, apiSecret, {
    requestTimeout: 5000,
  });
}

function paginate<T>(records: T[], page: number, pageSize: number) {
  const total = records.length;
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    records: records.slice(offset, offset + pageSize),
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

async function fetchPrometheusText(urlValue: string): Promise<string> {
  const url = new URL(urlValue);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("LIVEKIT_PROMETHEUS_URL 必须使用 http 或 https 协议");
  }
  if (url.pathname === "/") {
    url.pathname = "/metrics";
  }
  const response = await fetch(url, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Prometheus 返回 HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.length > 2_000_000) {
    throw new Error("Prometheus 响应超过 2 MB 限制");
  }
  return text;
}

export const platformLiveKitRouter = factory
  .createApp()
  .get("/overview", async (c) => {
    const startedAt = performance.now();
    try {
      const rooms = await getRoomServiceClient().listRooms();
      return c.json(
        {
          endpoint: safeEndpoint(process.env.LIVEKIT_URL),
          latencyMs: Math.round(performance.now() - startedAt),
          metricsConfigured: Boolean(process.env.LIVEKIT_PROMETHEUS_URL),
          status: "online" as const,
          totals: {
            activeRecordings: rooms.filter((room) => room.activeRecording).length,
            participants: rooms.reduce((sum, room) => sum + room.numParticipants, 0),
            publishers: rooms.reduce((sum, room) => sum + room.numPublishers, 0),
            rooms: rooms.length,
          },
        },
        200,
      );
    } catch (error) {
      return c.json(
        {
          endpoint: safeEndpoint(process.env.LIVEKIT_URL),
          error: error instanceof Error ? error.message : "LiveKit 连接失败",
          latencyMs: Math.round(performance.now() - startedAt),
          metricsConfigured: Boolean(process.env.LIVEKIT_PROMETHEUS_URL),
          status: "offline" as const,
          totals: { activeRecordings: 0, participants: 0, publishers: 0, rooms: 0 },
        },
        200,
      );
    }
  })
  .get(
    "/rooms",
    zValidator("query", listQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => {
      const { page, pageSize, search } = c.req.valid("query");
      try {
        const rooms = await getRoomServiceClient().listRooms();
        const keyword = search?.trim().toLocaleLowerCase();
        const records = rooms
          .map(toRoomRecord)
          .filter(
            (room) =>
              !keyword ||
              room.name.toLocaleLowerCase().includes(keyword) ||
              room.sid.toLocaleLowerCase().includes(keyword),
          )
          .toSorted((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        return c.json(paginate(records, page, pageSize), 200);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "加载 LiveKit 房间失败" },
          502,
        );
      }
    },
  )
  .get("/rooms/:roomName", async (c) => {
    const roomName = c.req.param("roomName");
    try {
      const client = getRoomServiceClient();
      const rooms = await client.listRooms([roomName]);
      const [room] = rooms;
      if (!room) {
        return c.json({ error: "房间不存在或已关闭" }, 404);
      }
      let participants: Awaited<ReturnType<RoomServiceClient["listParticipants"]>>;
      try {
        participants = await client.listParticipants(roomName);
      } catch (error) {
        const roomsAfterFailure = await client.listRooms([roomName]);
        if (roomsAfterFailure.length === 0) {
          return c.json({ error: "房间不存在或已关闭" }, 404);
        }
        throw error;
      }
      return c.json(
        {
          metadata: room.metadata,
          participants: participants.map(toParticipantRecord),
          room: toRoomRecord(room),
        },
        200,
      );
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "加载 LiveKit 房间详情失败" },
        502,
      );
    }
  })
  .get(
    "/metrics",
    zValidator("query", listQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => {
      const { page, pageSize, search } = c.req.valid("query");
      const metricsUrl = process.env.LIVEKIT_PROMETHEUS_URL;
      if (!metricsUrl) {
        return c.json({ configured: false as const, ...paginate([], page, pageSize) }, 200);
      }
      try {
        const text = await fetchPrometheusText(metricsUrl);
        const keyword = search?.trim().toLocaleLowerCase();
        const records = parsePrometheusMetrics(text).filter(
          (metric) =>
            !keyword ||
            metric.name.toLocaleLowerCase().includes(keyword) ||
            metric.help?.toLocaleLowerCase().includes(keyword) === true,
        );
        return c.json({ configured: true as const, ...paginate(records, page, pageSize) }, 200);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "加载 Prometheus 指标失败" },
          502,
        );
      }
    },
  );
