import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createPlatformLiveKitRouter } from "../route";

const roomServiceMocks = {
  listParticipants: vi.fn(),
  listRooms: vi.fn(),
};

const app = factory.createApp().route(
  "/livekit",
  createPlatformLiveKitRouter({
    fetchPrometheusText: async (url) => {
      const response = await fetch(url);
      return response.text();
    },
    getRoomServiceClient: () => {
      if (
        !(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
      ) {
        throw new Error("LiveKit 服务端连接未配置完整");
      }
      return roomServiceMocks;
    },
  }),
);

function configureLiveKit() {
  vi.stubEnv("LIVEKIT_URL", "wss://livekit.example.com");
  vi.stubEnv("LIVEKIT_API_KEY", "test-key");
  vi.stubEnv("LIVEKIT_API_SECRET", "test-secret");
}

beforeEach(() => {
  roomServiceMocks.listParticipants.mockReset();
  roomServiceMocks.listRooms.mockReset();
  vi.stubEnv("LIVEKIT_URL", "");
  vi.stubEnv("LIVEKIT_API_KEY", "");
  vi.stubEnv("LIVEKIT_API_SECRET", "");
  vi.stubEnv("LIVEKIT_PROMETHEUS_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("platform LiveKit routes", () => {
  it("rejects unknown or malformed atomic conditions before loading records", async () => {
    for (const textFilters of ['{"company":"Tencent"}', '{"name":[]}', "null", "not-json"]) {
      const response = await app.request(
        `/livekit/rooms?textFilters=${encodeURIComponent(textFilters)}`,
      );
      expect(response.status).toBe(400);
    }
    expect(roomServiceMocks.listRooms).not.toHaveBeenCalled();
  });

  it("combines room name and SID before counting and paginating", async () => {
    configureLiveKit();
    roomServiceMocks.listRooms.mockResolvedValue([
      { creationTime: 1_720_000_000n, name: "room-a", sid: "RM_a" },
      { creationTime: 1_720_000_000n, name: "room-a", sid: "RM_b" },
      { creationTime: 1_720_000_000n, name: "RM_a", sid: "RM_c" },
    ]);
    const response = await app.request(
      `/livekit/rooms?pageSize=1&textFilters=${encodeURIComponent(
        '{"name":"room-a","sid":"RM_b"}',
      )}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      records: [{ name: "room-a", sid: "RM_b" }],
      total: 1,
      totalPages: 1,
    });
  });

  it("reports an offline overview without exposing credentials when config is missing", async () => {
    const response = await app.request("/livekit/overview");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ endpoint: null, metricsConfigured: false, status: "offline" });
    expect(JSON.stringify(body)).not.toContain("test-secret");
  });

  it("validates list pagination", async () => {
    const response = await app.request("/livekit/rooms?page=0");
    expect(response.status).toBe(400);
    expect(roomServiceMocks.listRooms).not.toHaveBeenCalled();
  });

  it("lists active rooms as JSON-safe records", async () => {
    configureLiveKit();
    roomServiceMocks.listRooms.mockResolvedValue([
      {
        activeRecording: false,
        creationTime: 1_720_000_000n,
        creationTimeMs: 0n,
        emptyTimeout: 300,
        maxParticipants: 0,
        metadata: "",
        name: "room-a",
        numParticipants: 1,
        numPublishers: 1,
        sid: "RM_a",
      },
    ]);

    const response = await app.request("/livekit/rooms?page=1&pageSize=20");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      records: [{ createdAt: "2024-07-03T09:46:40.000Z", name: "room-a" }],
      total: 1,
    });
  });

  it("returns 404 before requesting participants for a closed room", async () => {
    configureLiveKit();
    roomServiceMocks.listRooms.mockResolvedValue([]);

    const response = await app.request("/livekit/rooms/closed-room");

    expect(response.status).toBe(404);
    expect(roomServiceMocks.listParticipants).not.toHaveBeenCalled();
  });

  it("returns 404 when a room closes while its drawer is loading", async () => {
    configureLiveKit();
    roomServiceMocks.listRooms
      .mockResolvedValueOnce([
        {
          activeRecording: false,
          creationTime: 1_720_000_000n,
          creationTimeMs: 0n,
          emptyTimeout: 300,
          maxParticipants: 0,
          metadata: "",
          name: "closing-room",
          numParticipants: 1,
          numPublishers: 1,
          sid: "RM_closing",
        },
      ])
      .mockResolvedValueOnce([]);
    roomServiceMocks.listParticipants.mockRejectedValue(new Error("room not found"));

    const response = await app.request("/livekit/rooms/closing-room");

    expect(response.status).toBe(404);
    expect(roomServiceMocks.listRooms).toHaveBeenCalledTimes(2);
  });

  it("distinguishes an unconfigured metrics endpoint from an empty scrape", async () => {
    const response = await app.request("/livekit/metrics?page=1&pageSize=20");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ configured: false, records: [] });
  });

  it("returns parsed Prometheus samples", async () => {
    vi.stubEnv("LIVEKIT_PROMETHEUS_URL", "http://metrics.internal:6789");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            "# HELP livekit_room_total Active rooms\n# TYPE livekit_room_total gauge\nlivekit_room_total 2\n",
          ),
        ),
    );

    const response = await app.request("/livekit/metrics?page=1&pageSize=20");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      configured: true,
      records: [{ name: "livekit_room_total", type: "gauge", value: 2 }],
    });
  });
});
