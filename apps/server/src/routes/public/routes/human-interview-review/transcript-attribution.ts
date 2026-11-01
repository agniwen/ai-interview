import type { CanonicalMeetingTranscript } from "@app/shared/meeting-transcription";

type Role = "candidate" | "interviewer" | "unknown";
const ROLE_LABELS = { candidate: "候选人", interviewer: "面试官", unknown: "待确认" } as const;

export function buildAttributionCorrection(
  turns: (CanonicalMeetingTranscript["turns"][number] & { id: string })[],
  assignments: { turnId: string; role: Role }[],
) {
  const ids = new Set(turns.map((turn) => turn.id));
  if (
    assignments.some((item) => !ids.has(item.turnId)) ||
    new Set(assignments.map((item) => item.turnId)).size !== assignments.length
  ) {
    return null;
  }
  const confirmedRoles = Object.fromEntries(assignments.map((item) => [item.turnId, item.role]));
  return {
    confirmedRoles,
    turns: turns.map(({ id, ...turn }) => ({
      ...turn,
      confidence: null,
      speakerDisplayName: confirmedRoles[id]
        ? ROLE_LABELS[confirmedRoles[id]]
        : (turn.speakerDisplayName ?? null),
    })),
  };
}
