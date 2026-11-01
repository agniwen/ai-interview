import { createHash } from "node:crypto";
import type { MeetingLiveSummaryRequest } from "@app/shared/meeting-live-summary";
import type { MeetingLiveSummaryCandidate } from "./generate-live-meeting-summary";

/** Short request-local references keep transcript UUIDs out of the model's output budget. */
export function compactSummaryEvidence(request: MeetingLiveSummaryRequest) {
  const aliases = new Map<string, string>();
  const originals = new Map<string, string>();
  const alias = (id: string) => {
    const existing = aliases.get(id);
    if (existing) {
      return existing;
    }
    const key = `e${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
    if (originals.has(key) && originals.get(key) !== id) {
      throw new Error("字幕引用编号冲突");
    }
    aliases.set(id, key);
    originals.set(key, id);
    return key;
  };
  const compact: MeetingLiveSummaryRequest = {
    ...request,
    baseSnapshot: request.baseSnapshot
      ? {
          ...request.baseSnapshot,
          coveredThroughTurnId: alias(request.baseSnapshot.coveredThroughTurnId),
          pendingThoughts: request.baseSnapshot.pendingThoughts?.map((thought) => ({
            ...thought,
            evidenceTurnIds: thought.evidenceTurnIds.map(alias),
          })),
          topics: request.baseSnapshot.topics.map((topic) => ({
            ...topic,
            evidenceTurnIds: topic.evidenceTurnIds.map(alias),
            points: topic.points.map((point) => ({
              ...point,
              evidenceTurnIds: point.evidenceTurnIds.map(alias),
            })),
          })),
        }
      : null,
    contextTurns: request.contextTurns?.map((turn) => ({ ...turn, id: alias(turn.id) })),
    turns: request.turns.map((turn) => ({ ...turn, id: alias(turn.id) })),
  };
  const restore = (id: string) => {
    const original = originals.get(id);
    if (!original) {
      throw new Error("实时总结引用了不属于输入字幕的证据");
    }
    return original;
  };
  return {
    request: compact,
    restore: (candidate: MeetingLiveSummaryCandidate): MeetingLiveSummaryCandidate => ({
      ...candidate,
      pendingThoughts: candidate.pendingThoughts?.map((thought) => ({
        ...thought,
        evidenceTurnIds: thought.evidenceTurnIds.map(restore),
      })),
      topics: candidate.topics.map((topic) => ({
        ...topic,
        evidenceTurnIds: topic.evidenceTurnIds.map(restore),
        points: topic.points.map((point) => ({
          ...point,
          evidenceTurnIds: point.evidenceTurnIds.map(restore),
        })),
      })),
    }),
  };
}
