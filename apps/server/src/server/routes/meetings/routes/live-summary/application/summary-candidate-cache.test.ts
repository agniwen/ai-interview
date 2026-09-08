import { describe, expect, it, vi } from "vitest";
import { createSummaryCandidateCache } from "./summary-candidate-cache";
import type { MeetingLiveSummaryCandidate } from "./generate-live-meeting-summary";
const candidate: MeetingLiveSummaryCandidate = { activeTopicId: null, summary: "测试", topics: [] };
it("deduplicates same-scope requests, expires entries, and isolates users", async () => {
  let now = 0;
  const cache = createSummaryCandidateCache(() => now);
  const generate = vi.fn(() => Promise.resolve(candidate));
  await Promise.all([cache("org:user", "prompt", generate), cache("org:user", "prompt", generate)]);
  expect(generate).toHaveBeenCalledOnce();
  await cache("org:other-user", "prompt", generate);
  expect(generate).toHaveBeenCalledTimes(2);
  now = 600_001;
  await cache("org:user", "prompt", generate);
  expect(generate).toHaveBeenCalledTimes(3);
});
describe("failed generation", () => {
  it("is retried rather than cached", async () => {
    const cache = createSummaryCandidateCache();
    await expect(
      cache("scope", "prompt", () => Promise.reject(new Error("timeout"))),
    ).rejects.toThrow("timeout");
    await expect(cache("scope", "prompt", () => Promise.resolve(candidate))).resolves.toEqual(
      candidate,
    );
  });
});
