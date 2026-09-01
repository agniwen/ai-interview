import "./instrument.server";

import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import type { ServerEntry } from "@tanstack/react-start/server-entry";
import { applyServerEnv } from "./env/server";
import { paraglideMiddleware } from "./paraglide/server";

type StartFetch = ServerEntry["fetch"];
type StartHandlerOptions = Parameters<StartFetch>[1];

export interface ServerEntryDependencies {
  applyServerEnv: () => void;
  createOgImageResponse: () => Response | Promise<Response>;
  startFetch: (request: Request, options?: StartHandlerOptions) => Response | Promise<Response>;
}

async function createOgImageResponse() {
  const { createOgImageResponse: createResponse } = await import("./lib/server/og-image");
  return createResponse();
}

let startFetchPromise: Promise<StartFetch> | undefined;

async function loadStartFetch(): Promise<StartFetch> {
  const { createStartHandler, defaultStreamHandler } = await import("@tanstack/react-start/server");
  return createStartHandler(defaultStreamHandler);
}

function getStartFetch(): Promise<StartFetch> {
  startFetchPromise ??= loadStartFetch();
  return startFetchPromise;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    startFetchPromise = undefined;
  });
}

function isAppVersionRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api/app-version";
}

function isOgImageRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/og.png";
}

export function createServerEntryHandler(dependencies: ServerEntryDependencies) {
  return {
    fetch(request: Request, options?: StartHandlerOptions) {
      dependencies.applyServerEnv();
      const startFetch = () =>
        options === undefined
          ? dependencies.startFetch(request)
          : dependencies.startFetch(request, options);

      if (isOgImageRequest(request)) {
        return dependencies.createOgImageResponse();
      }

      if (isAppVersionRequest(request)) {
        return startFetch();
      }

      return paraglideMiddleware(request, () => startFetch());
    },
  };
}

const defaultDependencies: ServerEntryDependencies = {
  applyServerEnv,
  createOgImageResponse,
  startFetch: async (request, options) => {
    const startFetch = await getStartFetch();
    return options === undefined ? startFetch(request) : startFetch(request, options);
  },
};

const defaultHandler = createServerEntryHandler(defaultDependencies);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Sentry's ServerEntry contract intentionally exposes adapter options as opaque unknown.
function forwardSentryFetch(request: Request, options?: unknown) {
  // SAFETY: Sentry forwards TanStack's original opaque server-entry options unchanged.
  return defaultHandler.fetch(request, options as StartHandlerOptions | undefined);
}

const sentryHandler: ServerEntry = wrapFetchWithSentry({
  fetch: forwardSentryFetch,
});

export default sentryHandler;
