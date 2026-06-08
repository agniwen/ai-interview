import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { createServerApp } from "../app";
import type { ORPCRouter } from "../orpc/router";

function createTestClient(): RouterClient<ORPCRouter> {
  const app = createServerApp();
  const link = new RPCLink({
    fetch: (request) => Promise.resolve(app.fetch(request)),
    url: "http://example.test/api/rpc",
  });

  return createORPCClient(link);
}

describe("oRPC route mount", () => {
  it("serves procedures from the Hono /api/rpc mount", async () => {
    const client = createTestClient();

    await expect(client.health()).resolves.toEqual({ ok: true });
  });
});
