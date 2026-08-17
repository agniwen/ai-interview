import { describe, expect, it } from "vitest";
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
