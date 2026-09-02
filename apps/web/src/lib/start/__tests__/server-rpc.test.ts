import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { rpcFetch } from "@/lib/client/api";
import { createServerRpc, createServerRpcFetch } from "../server-rpc";

describe("server-side RPC transport", () => {
  it("forwards the current request identity through the in-process Hono app", async () => {
    const app = new Hono().get("/api/headers", (c) =>
      c.json({
        authorization: c.req.header("authorization"),
        cookie: c.req.header("cookie"),
        requestHeader: c.req.header("x-request-header"),
        rpcHeader: c.req.header("x-rpc-header"),
      }),
    );
    const request = new Request("https://arc.example/platform/users", {
      headers: {
        authorization: "Bearer request-token",
        cookie: "session=abc",
        "x-request-header": "forwarded",
      },
    });

    const response = await createServerRpcFetch(request, app)("/api/headers", {
      headers: { "x-rpc-header": "rpc" },
    });

    await expect(response.json()).resolves.toEqual({
      authorization: "Bearer request-token",
      cookie: "session=abc",
      requestHeader: "forwarded",
      rpcHeader: "rpc",
    });
  });

  it("dispatches typed RPC calls through the supplied in-process Hono app", async () => {
    const app = new Hono().get("/api/join/:code/preview", (c) =>
      c.json({
        authenticated: c.req.header("cookie") === "session=abc",
        code: c.req.param("code"),
        valid: true,
      }),
    );
    const request = new Request("https://arc.example/join/TESTCODE12345678", {
      headers: { cookie: "session=abc" },
    });
    const appFetch = vi.spyOn(app, "fetch");
    const rpc = createServerRpc(request, app);

    const preview = await rpcFetch(
      rpc.api.join[":code"].preview.$get({ param: { code: "TESTCODE12345678" } }),
      "加载邀请链接失败",
    );

    expect(preview).toMatchObject({ authenticated: true, valid: true });
    expect(appFetch).toHaveBeenCalledTimes(1);
    const forwardedRequest = appFetch.mock.calls[0]?.[0];
    expect(forwardedRequest?.url).toBe("https://arc.example/api/join/TESTCODE12345678/preview");
    expect(forwardedRequest?.headers.get("cookie")).toBe("session=abc");
  });
});
