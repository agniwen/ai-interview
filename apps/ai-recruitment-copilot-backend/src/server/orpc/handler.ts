import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import type { ORPCContext } from "./context";
import { orpcRouter } from "./router";

const ORPC_PREFIX = "/api/rpc";

const handler = new RPCHandler(orpcRouter, {
  interceptors: [
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- oRPC exposes error logging as an interceptor callback.
    onError((error) => {
      console.error(error);
    }),
  ],
});

type HonoORPCContext = Pick<ORPCContext, "session" | "user">;

export function handleORPCRequest(request: Request, context: HonoORPCContext) {
  return handler.handle(request, {
    context: {
      headers: request.headers,
      request,
      session: context.session,
      user: context.user,
    },
    prefix: ORPC_PREFIX,
  });
}
