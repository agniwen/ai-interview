import type { ClientResponse } from "hono/client";
import { describe, expect, expectTypeOf, it } from "vitest";
import { rpcFetch } from "../rpc-fetch";

interface RpcErrorPayload {
  error?: string | { code: string };
  message?: string;
}

function failedRpcCall(payload: RpcErrorPayload) {
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return Promise.resolve(
    Response.json(payload, {
      status: 400,
      statusText: "Bad Request",
    }),
  ) as never;
}

function successfulRpcCall<T>(payload: T) {
  // SAFETY: Response.json creates a successful JSON response with the same payload value.
  return Promise.resolve(Response.json(payload)) as Promise<ClientResponse<T, 200, "json">>;
}

describe("rpcFetch error compatibility", () => {
  it("retains gateway status and retry metadata without exposing an HTML error page", async () => {
    // SAFETY: A gateway can return a non-JSON error in place of the typed endpoint response.
    const response = new Response("<html><h1>502 Bad Gateway</h1></html>", {
      headers: { "content-type": "text/html", "retry-after": "2", "x-request-id": "gateway-1" },
      status: 502,
    }) as ClientResponse<never>;
    await expect(rpcFetch(Promise.resolve(response), "创建批次失败")).rejects.toMatchObject({
      message: "服务暂时不可用，请稍后重试。",
      requestId: "gateway-1",
      retryAfterMs: 2000,
      status: 502,
    });
  });

  it("classifies failed connections for bounded upload retry", async () => {
    await expect(
      rpcFetch(Promise.reject(new TypeError("Failed to fetch")), "创建批次失败"),
    ).rejects.toMatchObject({ status: 0 });
  });

  it("prefers the canonical error field", async () => {
    await expect(
      rpcFetch(failedRpcCall({ error: "canonical", message: "legacy" }), "fallback"),
    ).rejects.toMatchObject({ message: "canonical", status: 400 });
  });

  it("reads legacy message responses during the migration", async () => {
    await expect(rpcFetch(failedRpcCall({ message: "legacy" }), "fallback")).rejects.toMatchObject({
      message: "legacy",
      status: 400,
    });
  });

  it("falls back when the server payload has no string message", async () => {
    await expect(
      rpcFetch(failedRpcCall({ error: { code: "bad" } }), "fallback"),
    ).rejects.toMatchObject({ message: "fallback", status: 400 });
  });
});

describe("rpcFetch response inference", () => {
  it("preserves the successful response body type", async () => {
    const result = rpcFetch(successfulRpcCall({ id: "candidate-1" }), "fallback");

    expectTypeOf(result).toEqualTypeOf<Promise<{ id: string }>>();
    await expect(result).resolves.toEqual({ id: "candidate-1" });
  });

  it("adds null only when 404 is allowed", () => {
    const result = rpcFetch(successfulRpcCall({ deleted: true }), "fallback", {
      allow404: true,
    });

    expectTypeOf(result).toEqualTypeOf<Promise<{ deleted: boolean } | null>>();
  });
});
