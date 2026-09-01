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
    const response = await backend.http.get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("keeps an HTTP-only replica ready when background workers are disabled", async () => {
    const response = await backend.http.get("/api/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("preserves the worker liveness response", async () => {
    const response = await backend.http.get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("makes a disabled background workload explicit on the worker readiness endpoint", async () => {
    const response = await backend.http.get("/readyz");

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
  it("uses the Nest standard exception envelope for Nest-owned routes", async () => {
    const response = await backend.http.get("/api/__contract_missing_route__");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "Not Found",
      message: expect.any(String),
      statusCode: 404,
    });
  });

  it("leaves Better Auth errors in the vendor protocol", async () => {
    const response = await backend.http.get("/api/auth/__contract_missing_route__");

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty("statusCode");
  });
});
