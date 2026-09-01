/* oxlint-disable eslint/require-await, unicorn/no-useless-undefined -- Async fakes implement the processor port contract. */
import { describe, expect, it, vi } from "vitest";
import { processInterviewNotificationBatchWorkload } from "./interview-notification.processor.js";

describe("processInterviewNotificationBatchWorkload", () => {
  it("claims a scheduler batch through the public port and reports the processed count", async () => {
    const claimEvents = vi.fn(async () => []);
    const input = {
      leaseDurationMs: 60_000,
      leaseOwner: "backend-1",
      limit: 25,
      now: new Date("2026-09-01T00:00:00.000Z"),
    };

    const processed = await processInterviewNotificationBatchWorkload(input, {
      claimDelivery: vi.fn(async () => null),
      claimEvents,
      listDeliveries: vi.fn(async () => []),
      markDeliveryFailed: vi.fn(async () => true),
      markDeliverySent: vi.fn(async () => true),
      send: vi.fn(async () => ({ providerMessageId: null })),
      updateEventState: vi.fn(async () => true),
    });

    expect(processed).toBe(0);
    expect(claimEvents).toHaveBeenCalledWith(input);
  });
});
