import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { DRAIN_ORDER, DrainCoordinatorService } from "./drain-coordinator.service.js";
import { RuntimeReadinessService } from "./runtime-readiness.service.js";

describe("DrainCoordinatorService", () => {
  it("drains registered components in explicit order and flushes Sentry last", async () => {
    const calls: string[] = [];
    const readiness = new RuntimeReadinessService();
    // SAFETY: the config fake supplies the only setting read by the coordinator.
    const coordinator = new DrainCoordinatorService(readiness, {
      get: () => 120_000,
    } as never);
    coordinator.register({
      drain: async () => {
        calls.push("background-quiesce");
      },
      name: "background-intake",
      order: DRAIN_ORDER.backgroundQuiesce,
    });
    coordinator.register({
      drain: async () => {
        calls.push("http");
      },
      name: "http-server",
      order: DRAIN_ORDER.http,
    });
    coordinator.register({
      drain: async () => {
        calls.push("database");
      },
      name: "database-pools",
      order: DRAIN_ORDER.database,
    });
    coordinator.register({
      drain: async () => {
        calls.push("background");
      },
      name: "background-resources",
      order: DRAIN_ORDER.backgroundFinalize,
    });
    coordinator.register({
      drain: async () => {
        calls.push("last");
      },
      name: "last",
      order: DRAIN_ORDER.sentry - 1,
    });

    await coordinator.beforeApplicationShutdown("SIGTERM");

    expect(readiness.isDraining()).toBe(true);
    expect(calls).toEqual(["background-quiesce", "http", "background", "database", "last"]);
  });

  it("reports every participant that did not finish before the total timeout", async () => {
    // SAFETY: the config fake supplies the only setting read by the coordinator.
    const coordinator = new DrainCoordinatorService(new RuntimeReadinessService(), {
      get: () => 5,
    } as never);
    coordinator.register({
      drain: () => delay(60_000, undefined, { ref: false }),
      name: "stuck-worker",
      order: DRAIN_ORDER.backgroundFinalize,
    });

    await expect(coordinator.beforeApplicationShutdown()).rejects.toThrow(
      "unfinished: stuck-worker, sentry",
    );
  });
});
