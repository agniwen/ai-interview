import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BackendTestHarness } from "./backend-test-harness.js";
import { createBackendTestHarness } from "./backend-test-harness.js";

let backend: BackendTestHarness;

beforeAll(async () => {
  backend = await createBackendTestHarness({ backgroundWorkersEnabled: false });
});

afterAll(async () => {
  await backend?.close();
});

describe("public health contracts", () => {
  it("reports the API process as live", async () => {
    const response = await backend.http.get("/system/health/backend/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("keeps an HTTP-only replica ready when background workers are disabled", async () => {
    const response = await backend.http.get("/system/health/backend/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("preserves the worker liveness response", async () => {
    const response = await backend.http.get("/system/health/background/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("makes a disabled background workload explicit on the worker readiness endpoint", async () => {
    const response = await backend.http.get("/system/health/background/ready");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: "Service Unavailable",
      errorCode: "BACKGROUND_WORKERS_DISABLED",
      message: "Background workers are disabled",
      statusCode: 503,
    });
  });
});

describe("HTTP error protocol boundaries", () => {
  it("does not retain legacy /api route aliases", async () => {
    const [healthResponse, authResponse] = await Promise.all([
      backend.http.get("/api/health"),
      backend.http.get("/api/auth/get-session"),
    ]);

    expect(healthResponse.status).toBe(404);
    expect(authResponse.status).toBe(404);
  });

  it("echoes the request correlation header on Nest and Better Auth responses", async () => {
    const correlationId = "contract-request-correlation";
    const [nestResponse, authResponse] = await Promise.all([
      backend.http.get("/system/health/backend/live").set("x-request-id", correlationId),
      backend.http
        .get("/public/auth/__contract_missing_route__")
        .set("x-request-id", correlationId),
    ]);

    expect(nestResponse.headers["x-request-id"]).toBe(correlationId);
    expect(authResponse.headers["x-request-id"]).toBe(correlationId);
  });

  it("uses the Nest standard exception envelope for Nest-owned routes", async () => {
    const response = await backend.http.get("/public/__contract_missing_route__");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "Not Found",
      message: expect.any(String),
      statusCode: 404,
    });
  });

  it("leaves Better Auth errors in the vendor protocol", async () => {
    const response = await backend.http.get("/public/auth/__contract_missing_route__");

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty("statusCode");
  });
});
