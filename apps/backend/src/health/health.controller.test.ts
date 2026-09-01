import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller.js";

type TestHealthIndicatorResult = Record<string, { status: string }>;
type TestHealthIndicator = () => Promise<TestHealthIndicatorResult> | TestHealthIndicatorResult;

function createController(readinessIssue: string | null = null) {
  const databaseHealth = {
    check: vi.fn(async () => ({ database: { status: "up" } })),
  };
  const runtimeHealth = {
    check: vi.fn(() => ({ runtime: { status: "up" } })),
  };
  const backgroundHealth = {
    check: vi.fn(async () =>
      readinessIssue
        ? {
            background: {
              message: readinessIssue,
              reason: "not-ready",
              status: "down",
            },
          }
        : { background: { status: "up" } },
    ),
  };
  const healthChecks = {
    check: vi.fn(async (checks: TestHealthIndicator[]) => {
      for (const check of checks) {
        const result = await check();
        if (Object.values(result).some(({ status }) => status === "down")) {
          throw new Error("Health check failed");
        }
      }
      return { details: {}, error: {}, info: {}, status: "ok" };
    }),
  };
  // SAFETY: each focused fake implements exactly the methods exercised by the
  // readiness controller paths.
  const controller = new HealthController(
    {
      get: vi.fn((name: string) =>
        ["BACKGROUND_WORKERS_ENABLED", "READINESS_DATABASE_CHECK_ENABLED"].includes(name)
          ? true
          : "production",
      ),
    } as never,
    healthChecks as never,
    databaseHealth as never,
    runtimeHealth as never,
    backgroundHealth as never,
  );
  return {
    backgroundHealth,
    controller,
    databaseHealth,
    healthChecks,
    runtimeHealth,
  };
}

describe("HealthController worker readiness", () => {
  it("keeps the existing liveness and API readiness envelopes", async () => {
    const subject = createController();

    expect(subject.controller.getApiHealth()).toEqual({ ok: true });
    expect(subject.controller.getWorkerHealth()).toEqual({ ok: true });
    await expect(subject.controller.getApiReadiness()).resolves.toEqual({ ok: true });
    expect(subject.healthChecks.check).toHaveBeenCalledTimes(2);
  });

  it("requires both the API database and full background diagnostics", async () => {
    const subject = createController();

    await expect(subject.controller.getWorkerReadiness()).resolves.toEqual({ ok: true });

    expect(subject.runtimeHealth.check).toHaveBeenCalledOnce();
    expect(subject.databaseHealth.check).toHaveBeenCalledOnce();
    expect(subject.backgroundHealth.check).toHaveBeenCalledOnce();
    expect(subject.healthChecks.check).toHaveBeenCalledTimes(3);
  });

  it("returns a stable 503 when a background dependency is unavailable", async () => {
    const subject = createController("Dependency check failed");

    await expect(subject.controller.getWorkerReadiness()).rejects.toMatchObject({
      errorCode: "BACKGROUND_RUNTIME_NOT_READY",
      message: "Dependency check failed",
      status: 503,
    });
  });

  it("preserves the draining error contract", async () => {
    const subject = createController();
    subject.runtimeHealth.check.mockReturnValueOnce({
      runtime: { status: "down" },
    });

    await expect(subject.controller.getWorkerReadiness()).rejects.toMatchObject({
      errorCode: "BACKEND_DRAINING",
      message: "Backend is draining",
      status: 503,
    });
    expect(subject.databaseHealth.check).not.toHaveBeenCalled();
    expect(subject.backgroundHealth.check).not.toHaveBeenCalled();
  });
});
