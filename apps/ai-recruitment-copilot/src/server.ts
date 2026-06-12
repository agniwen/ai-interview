import startHandler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { applyServerEnv } from "./env/server";

const globalWithCommonJsDirname = globalThis as typeof globalThis & {
  __dirname?: string;
};

// Some Node-oriented dependencies still probe `__dirname` after ESM bundling.
// Define a process-wide fallback before any lazy backend chunks are imported.
globalWithCommonJsDirname.__dirname ??= import.meta.dirname;

interface HonoApp {
  fetch(request: Request): Response | Promise<Response>;
}

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

function isHealthRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api/health";
}

export default createServerEntry({
  async fetch(request, options) {
    applyServerEnv();

    if (isHealthRequest(request)) {
      return Response.json({ ok: true });
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
