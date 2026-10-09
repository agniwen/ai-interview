import { describe, expect, it } from "vitest";
import { parsePrometheusMetrics, toParticipantRecord, toRoomRecord } from "../utils";

describe("LiveKit platform utilities", () => {
  it("serializes bigint room timestamps without exposing room metadata", () => {
    expect(
      toRoomRecord({
        activeRecording: true,
        creationTime: 1_720_000_000n,
        creationTimeMs: 0n,
        emptyTimeout: 300,
        maxParticipants: 20,
        metadata: '{"private":"value"}',
        name: "interview-room",
        numParticipants: 2,
        numPublishers: 1,
        sid: "RM_demo",
      }),
    ).toEqual({
      activeRecording: true,
      createdAt: "2024-07-03T09:46:40.000Z",
      emptyTimeout: 300,
      maxParticipants: 20,
      name: "interview-room",
      numParticipants: 2,
      numPublishers: 1,
      sid: "RM_demo",
    });
  });

  it("maps participant and track details into JSON-safe drawer data", () => {
    expect(
      toParticipantRecord({
        attributes: { role: "candidate" },
        identity: "candidate-1",
        isPublisher: true,
        joinedAt: 1_720_000_000n,
        joinedAtMs: 0n,
        kind: 0,
        metadata: "{}",
        name: "候选人",
        region: "cn-east",
        sid: "PA_demo",
        state: 2,
        tracks: [
          {
            height: 0,
            mimeType: "audio/opus",
            muted: false,
            name: "microphone",
            sid: "TR_demo",
            source: 2,
            type: 0,
            width: 0,
          },
        ],
      }),
    ).toMatchObject({
      attributes: { role: "candidate" },
      identity: "candidate-1",
      isPublisher: true,
      joinedAt: "2024-07-03T09:46:40.000Z",
      kind: "标准用户",
      state: "活跃",
      tracks: [
        {
          mimeType: "audio/opus",
          muted: false,
          source: "麦克风",
          type: "音频",
        },
      ],
    });
  });

  it("parses Prometheus help, type, labels, values, and special numbers", () => {
    const records = parsePrometheusMetrics(
      `# HELP livekit_room_total Active rooms\n# TYPE livekit_room_total gauge\nlivekit_room_total{node_id="node-1",region="ap-shanghai"} 2\nlivekit_packet_loss_ratio NaN\n`,
    );

    expect(records).toEqual([
      {
        help: "Active rooms",
        labels: { node_id: "node-1", region: "ap-shanghai" },
        name: "livekit_room_total",
        type: "gauge",
        value: 2,
      },
      {
        help: null,
        labels: {},
        name: "livekit_packet_loss_ratio",
        type: null,
        value: "NaN",
      },
    ]);
  });
});
