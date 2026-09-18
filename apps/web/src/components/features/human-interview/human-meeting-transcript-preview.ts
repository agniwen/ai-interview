import { humanTranscriptionPreviewSchema } from "@app/shared/human-transcription";
import type {
  HumanTranscriptionEvent,
  HumanTranscriptionPreview,
} from "@app/shared/human-transcription";

export interface TranscriptPreviewScope {
  runId: string | null;
  generation: number | null;
  executionId: string | null;
}
export type TranscriptPeople = Record<
  string,
  { displayName: string; role: "candidate" | "interviewer" }
>;
export type TimedTranscriptPreview = HumanTranscriptionPreview & { receivedAt: number };

function sameScope(packet: TranscriptPreviewScope, scope: TranscriptPreviewScope) {
  return (
    packet.runId === scope.runId &&
    packet.generation === scope.generation &&
    packet.executionId === scope.executionId
  );
}

function sentenceKey(event: HumanTranscriptionPreview["event"]) {
  return JSON.stringify([
    event.participantIdentity,
    event.streamEpoch,
    event.providerTaskId,
    event.itemId,
  ]);
}

export function readTranscriptPreview(
  payload: Uint8Array,
  isAgent: boolean,
  scope: TranscriptPreviewScope,
  people: TranscriptPeople,
) {
  if (!isAgent || payload.byteLength > 14_000) {
    return null;
  }
  try {
    const parsed = humanTranscriptionPreviewSchema.safeParse(
      JSON.parse(new TextDecoder().decode(payload)),
    );
    if (
      !parsed.success ||
      !sameScope(parsed.data, scope) ||
      !people[parsed.data.event.participantIdentity]
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function receiveTranscriptPreview(
  previous: TimedTranscriptPreview[],
  packet: HumanTranscriptionPreview,
  now: number,
) {
  const key = sentenceKey(packet.event);
  const active = previous.filter(
    (item) => sameScope(item, packet) && now - item.receivedAt < 60_000,
  );
  const existing = active.find((item) => sentenceKey(item.event) === key);
  if (
    existing &&
    (existing.sequence >= packet.sequence ||
      (existing.event.kind === "final" &&
        existing.event.revision >= packet.event.revision &&
        packet.event.kind === "interim"))
  ) {
    return active;
  }
  return [
    ...active.filter((item) => sentenceKey(item.event) !== key),
    { ...packet, receivedAt: now },
  ].slice(-64);
}

export function visibleTranscriptRows(
  events: HumanTranscriptionEvent[],
  previews: TimedTranscriptPreview[],
  scope: TranscriptPreviewScope,
  people: TranscriptPeople,
  now: number,
) {
  const latest = new Map<string, { event: HumanTranscriptionPreview["event"]; pending: boolean }>();
  for (const event of events) {
    if (event.kind !== "final" || !people[event.participantIdentity] || !event.text.trim()) {
      continue;
    }
    const finalEvent = { ...event, kind: "final" as const };
    const key = sentenceKey(finalEvent);
    if ((latest.get(key)?.event.revision ?? -1) < event.revision) {
      latest.set(key, { event: finalEvent, pending: false });
    }
  }
  for (const preview of previews) {
    const { event } = preview;
    const ttl = event.kind === "interim" ? 15_000 : 60_000;
    if (
      !sameScope(preview, scope) ||
      !people[event.participantIdentity] ||
      now - preview.receivedAt >= ttl ||
      !event.text.trim()
    ) {
      continue;
    }
    const key = sentenceKey(event);
    const saved = latest.get(key);
    if (saved && saved.event.revision >= event.revision) {
      continue;
    }
    latest.set(key, { event, pending: true });
  }
  return [...latest.entries()]
    .map(([key, row]) => ({
      ...row,
      displayName: people[row.event.participantIdentity]?.displayName ?? "",
      key,
    }))
    .toSorted((a, b) => a.event.startMs - b.event.startMs || a.key.localeCompare(b.key));
}
