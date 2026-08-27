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
