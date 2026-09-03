export interface LiveKitRoomRecord {
  activeRecording: boolean;
  createdAt: string | null;
  emptyTimeout: number;
  maxParticipants: number;
  name: string;
  numParticipants: number;
  numPublishers: number;
  sid: string;
}

export interface LiveKitTrackRecord {
  height: number;
  mimeType: string;
  muted: boolean;
  name: string;
  sid: string;
  source: string;
  type: string;
  width: number;
}

export interface LiveKitParticipantRecord {
  attributes: Record<string, string>;
  identity: string;
  isPublisher: boolean;
  joinedAt: string | null;
  kind: string;
  metadata: string;
  name: string;
  region: string;
  sid: string;
  state: string;
  tracks: LiveKitTrackRecord[];
}

export interface LiveKitMetricRecord {
  help: string | null;
  labels: Record<string, string>;
  name: string;
  type: string | null;
  value: number | string;
}

export interface PaginatedResult<T> {
  page: number;
  pageSize: number;
  records: T[];
  total: number;
  totalPages: number;
}
