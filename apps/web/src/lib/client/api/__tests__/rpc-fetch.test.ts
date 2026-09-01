import { describe, expect, expectTypeOf, it } from "vitest";
import { apiRequest, apiResponse } from "../rpc-fetch";

interface RpcErrorPayload {
  error?: string | { code: string };
  message?: string;
}

function failedApiCall(payload: RpcErrorPayload, status = 400) {
  return Promise.resolve({
    data: undefined,
    error: payload,
    response: Response.json(payload, {
      status,
      statusText: status === 404 ? "Not Found" : "Bad Request",
    }),
  });
}

function successfulApiCall<T>(payload: T) {
  return Promise.resolve({
    data: payload,
    error: undefined,
    response: Response.json(payload),
  });
}

describe("apiRequest error compatibility", () => {
  it("prefers the canonical error field", async () => {
    await expect(
      apiRequest(failedApiCall({ error: "canonical", message: "legacy" }), "fallback"),
    ).rejects.toMatchObject({ message: "canonical", status: 400 });
  });

  it("reads legacy message responses during the migration", async () => {
    await expect(
      apiRequest(failedApiCall({ message: "legacy" }), "fallback"),
    ).rejects.toMatchObject({
      message: "legacy",
      status: 400,
    });
  });

  it("falls back when the server payload has no string message", async () => {
    await expect(
      apiRequest(failedApiCall({ error: { code: "bad" } }), "fallback"),
    ).rejects.toMatchObject({ message: "fallback", status: 400 });
  });
});

describe("apiRequest response handling", () => {
  it("uses the caller's successful response type", async () => {
    const result = apiRequest<{ id: string }>(successfulApiCall({ id: "candidate-1" }), "fallback");

    expectTypeOf(result).toEqualTypeOf<Promise<{ id: string }>>();
    await expect(result).resolves.toEqual({ id: "candidate-1" });
  });

  it("adds null only when 404 is allowed", () => {
    const result = apiRequest<{ deleted: boolean }>(
      successfulApiCall({ deleted: true }),
      "fallback",
      {
        allow404: true,
      },
    );

    expectTypeOf(result).toEqualTypeOf<Promise<{ deleted: boolean } | null>>();
  });

  it("returns the raw Hey API response when requested", async () => {
    const response = await apiResponse(failedApiCall({ message: "missing" }, 404));

    expect(response.status).toBe(404);
  });

  it("rebuilds a readable response after Hey API consumes the body", async () => {
    const originalResponse = Response.json({ id: "candidate-1" });
    await originalResponse.json();

    const response = await apiResponse(
      Promise.resolve({
        data: { id: "candidate-1" },
        error: undefined,
        response: originalResponse,
      }),
    );

    await expect(response.json()).resolves.toEqual({ id: "candidate-1" });
  });
});
