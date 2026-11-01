import type { HumanTranscriptionEvent } from "./human-transcription";

export function projectHumanTranscription(
  events: HumanTranscriptionEvent[],
  participants: Record<string, { role: "candidate" | "interviewer"; displayName: string }>,
) {
  const latest = new Map<string, HumanTranscriptionEvent>();
  const gaps = events.filter(
    (event) => event.kind === "gap" || !participants[event.participantIdentity],
  );
  for (const event of events) {
    if (event.kind !== "final" || !participants[event.participantIdentity] || !event.text.trim()) {
      continue;
    }
    const key = JSON.stringify([event.streamEpoch, event.providerTaskId, event.itemId]);
    if ((latest.get(key)?.revision ?? -1) < event.revision) {
      latest.set(key, event);
    }
  }
  const turns = [...latest.values()]
    .toSorted((a, b) => a.startMs - b.startMs || a.eventId.localeCompare(b.eventId))
    .map((event) => {
      const person = participants[event.participantIdentity];
      if (!person) {
        throw new Error("转录发言者未经授权");
      }
      return {
        attribution: {
          method: "track" as const,
          participantIdentity: event.participantIdentity,
          role: person.role,
          sourceId: event.trackId,
        },
        endMs: Math.max(Math.round(event.startMs) + 1, Math.round(event.endMs)),
        speakerDisplayName: person.displayName,
        speakerKey: event.participantIdentity,
        startMs: Math.round(event.startMs),
        text: event.text,
        track: person.role === "candidate" ? ("remote" as const) : ("local" as const),
      };
    });
  return {
    eligible: gaps.length === 0 && turns.some((turn) => turn.attribution.role === "candidate"),
    gaps,
    turns,
  };
}
