import { createHash } from "node:crypto";
import type { MeetingLiveSummaryCandidate } from "./generate-live-meeting-summary";

/** Bounded retry deduplication; durable finished chunk progress belongs to the worker. */
export function createSummaryCandidateCache(now = Date.now) {
  const entries = new Map<
    string,
    { expiresAt: number; value: Promise<MeetingLiveSummaryCandidate> }
  >();
  return async (
    scope: string,
    prompt: string,
    generate: () => Promise<MeetingLiveSummaryCandidate>,
  ) => {
    const key = createHash("sha256").update(`${scope}\0${prompt}`).digest("hex");
    const previous = entries.get(key);
    if (previous && previous.expiresAt > now()) {
      return await previous.value;
    }
    const value = generate();
    entries.delete(key);
    entries.set(key, { expiresAt: now() + 600_000, value });
    if (entries.size > 64) {
      const oldest = entries.keys().next().value;
      if (oldest) {
        entries.delete(oldest);
      }
    }
    try {
      return await value;
    } catch (error) {
      if (entries.get(key)?.value === value) {
        entries.delete(key);
      }
      throw error;
    }
  };
}
