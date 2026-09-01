import { HealthIndicatorService } from "@nestjs/terminus";
import { describe, expect, it, vi } from "vitest";

import { BackgroundReadinessHealthIndicator } from "./background-readiness-health.indicator.js";
import { DatabaseHealthIndicator } from "./database-health.indicator.js";
import { RuntimeReadinessHealthIndicator } from "./runtime-readiness-health.indicator.js";

describe("backend health indicators", () => {
  it("uses the API database ping for readiness", async () => {
    const database = { ping: vi.fn(async () => {}) };
    const config = { get: vi.fn(() => true) };
    // SAFETY: the focused fakes implement the complete database indicator surface.
    const indicator = new DatabaseHealthIndicator(
      new HealthIndicatorService(),
      config as never,
      database as never,
    );

    await expect(indicator.check()).resolves.toMatchObject({
      database: { status: "up" },
    });
    expect(database.ping).toHaveBeenCalledOnce();

    database.ping.mockRejectedValueOnce(new Error("connection refused"));
    await expect(indicator.check()).resolves.toMatchObject({
      database: { message: "connection refused", status: "down" },
    });
  });

  it("reports drain state through a Terminus result", () => {
    // SAFETY: the focused fake implements the only runtime readiness method used.
    const indicator = new RuntimeReadinessHealthIndicator(new HealthIndicatorService(), {
      isDraining: vi.fn(() => true),
    } as never);

    expect(indicator.check()).toEqual({
      runtime: { message: "Backend is draining", status: "down" },
    });
  });

  it("maps background diagnostics and missing runtime to distinct results", async () => {
    const diagnostics = { getReadinessIssue: vi.fn(async () => "Dependency check failed") };
    // SAFETY: the focused fake implements the only background diagnostic method used.
    const indicator = new BackgroundReadinessHealthIndicator(
      new HealthIndicatorService(),
      diagnostics as never,
    );

    await expect(indicator.check()).resolves.toEqual({
      background: {
        message: "Dependency check failed",
        reason: "not-ready",
        status: "down",
      },
    });
    await expect(
      new BackgroundReadinessHealthIndicator(new HealthIndicatorService()).check(),
    ).resolves.toEqual({
      background: {
        message: "Background runtime is unavailable",
        reason: "unavailable",
        status: "down",
      },
    });
  });
});
