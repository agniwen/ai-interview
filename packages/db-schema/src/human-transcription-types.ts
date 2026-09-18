export interface HumanTranscriptionEventRecord {
  eventId: string;
  streamEpoch: string;
  participantIdentity: string;
  trackId: string;
  providerTaskId: string;
  itemId: string;
  revision: number;
  kind: "final" | "gap" | "stream_started" | "stream_ended";
  startMs: number;
  endMs: number;
  text: string;
}
