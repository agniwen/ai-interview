import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { orpcRouter } from "@arc/ai-recruitment-copilot-backend/server/orpc/router";
import type { ORPCRouter } from "@arc/ai-recruitment-copilot-backend/server/orpc/router";

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(orpcRouter, {
      context: () => ({
        headers: getRequestHeaders(),
      }),
    }),
  )
  .client((): RouterClient<ORPCRouter> => {
    const link = new RPCLink({
      fetch: (request, init) =>
        fetch(request, {
          ...init,
          credentials: "include",
        }),
      url: `${window.location.origin}/api/rpc`,
    });

    return createORPCClient(link);
  });

export const orpc: RouterClient<ORPCRouter> = getORPCClient();
