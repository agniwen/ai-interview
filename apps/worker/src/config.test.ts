import { describe, expect, it } from "vitest";
import { isWorkerBackgroundProcessingEnabled } from "./config";

describe("isWorkerBackgroundProcessingEnabled", () => {
  it("keeps existing deployments enabled by default", () => {
    expect(isWorkerBackgroundProcessingEnabled({})).toBe(true);
  });

  it("supports a local notification-only worker", () => {
    expect(
      isWorkerBackgroundProcessingEnabled({ WORKER_BACKGROUND_PROCESSING_ENABLED: " false " }),
    ).toBe(false);
  });
});
