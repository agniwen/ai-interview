import { getRequest } from "@tanstack/react-start/server";
import { hcWithType } from "@app/server/rpc-client";
import type { Rpc } from "@/lib/client/rpc";

interface ServerApiApp {
  fetch(request: Request): Response | Promise<Response>;
}

export function createServerRpcFetch(
  currentRequest: Request,
  app: ServerApiApp,
): typeof globalThis.fetch {
  return async (input, init) => {
    const inputRequest = input instanceof Request ? input : null;
    let inputUrl: string;
    if (inputRequest) {
      inputUrl = inputRequest.url;
    } else if (input instanceof URL) {
      inputUrl = input.href;
    } else {
      inputUrl = String(input);
    }
    const target = new URL(inputUrl, currentRequest.url);
    const headers = new Headers(currentRequest.headers);
    for (const [name, value] of inputRequest?.headers ?? []) {
      headers.set(name, value);
    }
    for (const [name, value] of new Headers(init?.headers)) {
      headers.set(name, value);
    }

    const baseRequest = inputRequest
      ? new Request(target, inputRequest)
      : new Request(target, init);
    const forwardedRequest = new Request(baseRequest, {
      ...init,
      headers,
    });
    return await app.fetch(forwardedRequest);
  };
}

export function createServerRpc(request: Request, app: ServerApiApp): Rpc {
  return hcWithType(new URL("/", request.url).origin, {
    fetch: createServerRpcFetch(request, app),
  });
}

export function getServerRpc(): Rpc {
  let appPromise: Promise<ServerApiApp> | undefined;
  const app: ServerApiApp = {
    async fetch(forwardedRequest) {
      appPromise ??= (async () => {
        const { createServerApp } = await import("@app/server/web/runtime");
        return createServerApp();
      })();
      const serverApp = await appPromise;
      return await serverApp.fetch(forwardedRequest);
    },
  };
  return createServerRpc(getRequest(), app);
}
