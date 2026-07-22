interface RoomLike {
  activeRecording: boolean;
  creationTime: bigint;
  creationTimeMs: bigint;
  emptyTimeout: number;
  maxParticipants: number;
  metadata: string;
  name: string;
  numParticipants: number;
  numPublishers: number;
  sid: string;
}

interface TrackLike {
  height: number;
  mimeType: string;
  muted: boolean;
  name: string;
  sid: string;
  source: number;
  type: number;
  width: number;
}

interface ParticipantLike {
  attributes: Record<string, string>;
  identity: string;
  isPublisher: boolean;
  joinedAt: bigint;
  joinedAtMs: bigint;
  kind: number;
  metadata: string;
  name: string;
  region: string;
  sid: string;
  state: number;
  tracks: TrackLike[];
}

export interface PrometheusMetricRecord {
  help: string | null;
  labels: Record<string, string>;
  name: string;
  type: string | null;
  value: number | string;
}

function epochToIso(milliseconds: bigint, seconds: bigint): string | null {
  const value = milliseconds > 0n ? Number(milliseconds) : Number(seconds) * 1000;
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value).toISOString();
}

function participantStateLabel(state: number): string {
  return ["连接中", "已连接", "活跃", "已断开"][state] ?? `未知 (${state})`;
}

function participantKindLabel(kind: number): string {
  const labels: Record<number, string> = {
    0: "标准用户",
    1: "Ingress",
    2: "Egress",
    3: "SIP",
    4: "Agent",
    7: "Connector",
    8: "Bridge",
  };
  return labels[kind] ?? `未知 (${kind})`;
}

function trackTypeLabel(type: number): string {
  return ["音频", "视频", "数据"][type] ?? `未知 (${type})`;
}

function trackSourceLabel(source: number): string {
  const labels: Record<number, string> = {
    0: "未知",
    1: "摄像头",
    2: "麦克风",
    3: "屏幕共享",
    4: "屏幕共享音频",
  };
  return labels[source] ?? `未知 (${source})`;
}

export function toRoomRecord(room: RoomLike) {
  return {
    activeRecording: room.activeRecording,
    createdAt: epochToIso(room.creationTimeMs, room.creationTime),
    emptyTimeout: room.emptyTimeout,
    maxParticipants: room.maxParticipants,
    name: room.name,
    numParticipants: room.numParticipants,
    numPublishers: room.numPublishers,
    sid: room.sid,
  };
}

export function toParticipantRecord(participant: ParticipantLike) {
  return {
    attributes: participant.attributes,
    identity: participant.identity,
    isPublisher: participant.isPublisher,
    joinedAt: epochToIso(participant.joinedAtMs, participant.joinedAt),
    kind: participantKindLabel(participant.kind),
    metadata: participant.metadata,
    name: participant.name,
    region: participant.region,
    sid: participant.sid,
    state: participantStateLabel(participant.state),
    tracks: participant.tracks.map((track) => ({
      height: track.height,
      mimeType: track.mimeType,
      muted: track.muted,
      name: track.name,
      sid: track.sid,
      source: trackSourceLabel(track.source),
      type: trackTypeLabel(track.type),
      width: track.width,
    })),
  };
}

function parseLabels(input: string | undefined): Record<string, string> {
  if (!input) {
    return {};
  }
  const labels: Record<string, string> = {};
  const labelPattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  for (const match of input.matchAll(labelPattern)) {
    labels[match[1]] = match[2].replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return labels;
}

export function parsePrometheusMetrics(text: string): PrometheusMetricRecord[] {
  const help = new Map<string, string>();
  const types = new Map<string, string>();
  const records: PrometheusMetricRecord[] = [];

  for (const line of text.split("\n")) {
    if (line.startsWith("# HELP ")) {
      const [, name, description] = line.match(/^# HELP\s+(\S+)\s+(.+)$/) ?? [];
      if (name && description) {
        help.set(name, description);
      }
      continue;
    }
    if (line.startsWith("# TYPE ")) {
      const [, name, type] = line.match(/^# TYPE\s+(\S+)\s+(\S+)$/) ?? [];
      if (name && type) {
        types.set(name, type);
      }
      continue;
    }
    if (!line || line.startsWith("#")) {
      continue;
    }

    const [, name, rawLabels, rawValue] =
      line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?$/) ?? [];
    if (!(name && rawValue)) {
      continue;
    }
    const numericValue = Number(rawValue);
    records.push({
      help: help.get(name) ?? null,
      labels: parseLabels(rawLabels),
      name,
      type: types.get(name) ?? null,
      value: Number.isFinite(numericValue) ? numericValue : rawValue,
    });
  }

  return records;
}

export function toLiveKitHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  } else if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("LIVEKIT_URL 必须使用 ws、wss、http 或 https 协议");
  }
  return url.origin;
}

export function safeEndpoint(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return toLiveKitHttpUrl(value);
  } catch {
    return null;
  }
}
