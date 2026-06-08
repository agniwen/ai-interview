import startHandler, { createServerEntry } from "@tanstack/react-start/server-entry";
import type { handleORPCRequest as handleBackendORPCRequest } from "@arc/ai-recruitment-copilot-backend/server/orpc/handler";

const globalWithCommonJsDirname = globalThis as typeof globalThis & {
  __dirname?: string;
};

// Some Node-oriented dependencies still probe `__dirname` after ESM bundling.
// Define a process-wide fallback before any lazy backend chunks are imported.
globalWithCommonJsDirname.__dirname ??= import.meta.dirname;

interface HonoApp {
  fetch(request: Request): Response | Promise<Response>;
}

type ORPCSessionContext = Parameters<typeof handleBackendORPCRequest>[1];

let honoAppPromise: Promise<HonoApp> | undefined;

async function createHonoApp() {
  const { createServerApp } = await import("@arc/ai-recruitment-copilot-backend/server/app");
  return createServerApp();
}

async function getHonoApp() {
  honoAppPromise ??= createHonoApp();
  return await honoAppPromise;
}

function isApiRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isORPCRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api/rpc" || pathname.startsWith("/api/rpc/");
}

function isHealthRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api/health";
}

async function getORPCSessionContext(request: Request): Promise<ORPCSessionContext> {
  if (!process.env.DATABASE_URL) {
    return { session: null, user: null };
  }

  const { auth } = await import("@arc/ai-recruitment-copilot-backend/lib/server/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  return {
    session: session?.session ?? null,
    user: session?.user ?? null,
  };
}

async function handleORPCRequest(request: Request) {
  const [{ handleORPCRequest: handleBackendORPCRequest }, context] = await Promise.all([
    import("@arc/ai-recruitment-copilot-backend/server/orpc/handler"),
    getORPCSessionContext(request),
  ]);
  const { matched, response } = await handleBackendORPCRequest(request, context);
  return matched ? response : null;
}

export default createServerEntry({
  async fetch(request, options) {
    if (isHealthRequest(request)) {
      return Response.json({ ok: true });
    }

    if (isORPCRequest(request)) {
      const response = await handleORPCRequest(request);
      if (response) {
        return response;
      }
    }

    if (isApiRequest(request)) {
      const honoApp = await getHonoApp();
      return honoApp.fetch(request);
    }

    if (options === undefined) {
      return startHandler.fetch(request);
    }

    return startHandler.fetch(request, options);
  },
});
