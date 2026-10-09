import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isInterviewNotificationFlowEnabled,
  isInterviewNotificationWorkerEnabled,
} from "./feature-flags";

afterEach(() => vi.unstubAllEnvs());

describe("interview notification feature flags", () => {
  it("requires both flags before the Worker may replace legacy sending", () => {
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "false");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "true");
    expect(isInterviewNotificationFlowEnabled()).toBe(false);
    expect(isInterviewNotificationWorkerEnabled()).toBe(false);

    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "true");
    expect(isInterviewNotificationWorkerEnabled()).toBe(true);
  });
});
